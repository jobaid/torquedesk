package api

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ----------------------------------------------------------------------------
// Fixora Universal Migration Bundle
//
// A single .zip the SaaS owner uploads to migrate everything for a shop in
// one shot. Shape:
//
//   manifest.json              (optional; informational metadata)
//   customers.csv              (reuses importCustomerRows)
//   vehicles.csv               (reuses importVehicleRows)
//   invoices.csv               (reuses importInvoiceRows)
//   settings.json              (shop_settings + labor_rates + tax_rates + shop_fees)
//   logo.png | logo.jpg | logo.webp   (printing_settings.logo_data)
//
// CSVs use the same column names our existing CSV importers map by default
// when 'custom' preset is selected (so the Fixora field names ARE the headers,
// e.g. "name,phone,email,...").
// ----------------------------------------------------------------------------

const bundleMaxBytes = 100 << 20 // 100 MB

type bundleManifest struct {
	Version      string `json:"version,omitempty"`
	SourceVendor string `json:"source_vendor,omitempty"`
	ExportedAt   string `json:"exported_at,omitempty"`
	Note         string `json:"note,omitempty"`
}

type bundleSettings struct {
	Shop struct {
		Name     string `json:"name"`
		Address1 string `json:"address1"`
		Address2 string `json:"address2"`
		City     string `json:"city"`
		State    string `json:"state"`
		Zip      string `json:"zip"`
		Country  string `json:"country"`
		Phone    string `json:"phone"`
		Email    string `json:"email"`
		Website  string `json:"website"`
	} `json:"shop"`
	LaborRate float64            `json:"labor_rate"`
	TaxRates  []bundleTaxRate    `json:"tax_rates"`
	ShopFees  []bundleShopFee    `json:"shop_fees"`
	Extras    map[string]any     `json:"extras"`
}

type bundleTaxRate struct {
	Name          string  `json:"name"`
	Rate          float64 `json:"rate"`
	AppliesParts  bool    `json:"applies_parts"`
	AppliesLabor  bool    `json:"applies_labor"`
	AppliesFees   bool    `json:"applies_fees"`
	IsDefault     bool    `json:"is_default"`
}

type bundleShopFee struct {
	Name       string  `json:"name"`
	CalcBy     string  `json:"calc_by"` // 'amount' | 'percent'
	Amount     float64 `json:"amount"`
	Percentage float64 `json:"percentage"`
	AppliesTo  string  `json:"applies_to"` // 'labor' | 'parts' | 'labor_parts'
	Taxable    bool    `json:"taxable"`
}

// Build a per-section report for the dry-run and the commit.
func validateBundle(raw []byte) map[string]any {
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		return map[string]any{"total": 0, "valid": 0, "invalid": 1,
			"issues": []map[string]any{{"line": 0, "reason": "not a valid zip: " + err.Error()}}}
	}
	sections := map[string]any{}
	var manifest *bundleManifest
	logoFound := false
	settingsFound := false
	csvs := map[string]int{} // basename -> row count
	for _, f := range zr.File {
		name := strings.ToLower(filepath.Base(f.Name))
		if strings.HasPrefix(f.Name, "__MACOSX/") || strings.HasSuffix(f.Name, "/") {
			continue
		}
		switch name {
		case "manifest.json":
			if r, err := f.Open(); err == nil {
				data, _ := io.ReadAll(r)
				_ = r.Close()
				m := bundleManifest{}
				_ = json.Unmarshal(data, &m)
				manifest = &m
			}
		case "settings.json":
			settingsFound = true
		case "logo.png", "logo.jpg", "logo.jpeg", "logo.webp":
			logoFound = true
		case "customers.csv", "vehicles.csv", "invoices.csv":
			if r, err := f.Open(); err == nil {
				data, _ := io.ReadAll(r)
				_ = r.Close()
				_, count, _ := peekCSV(data)
				csvs[name] = count
			}
		}
	}
	sections["csvs"] = csvs
	sections["has_settings"] = settingsFound
	sections["has_logo"] = logoFound
	sections["manifest"] = manifest
	total := len(csvs)
	if settingsFound {
		total++
	}
	if logoFound {
		total++
	}
	valid := total
	issues := []map[string]any{}
	if total == 0 {
		valid = 0
		issues = append(issues, map[string]any{"line": 0, "reason": "bundle contains no recognised files (expected customers.csv / vehicles.csv / invoices.csv / settings.json / logo.*)"})
	}
	return map[string]any{
		"total":    total,
		"valid":    valid,
		"invalid":  len(issues),
		"issues":   issues,
		"sections": sections,
	}
}

func importBundle(ctx context.Context, s *Server, companyID string, raw []byte) (int, int, []string) {
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		return 0, 0, []string{"not a valid zip: " + err.Error()}
	}
	imported, skipped := 0, 0
	errs := []string{}

	// Collect bytes per well-known file name.
	files := map[string][]byte{}
	for _, f := range zr.File {
		name := strings.ToLower(filepath.Base(f.Name))
		if strings.HasPrefix(f.Name, "__MACOSX/") || strings.HasSuffix(f.Name, "/") {
			continue
		}
		if f.UncompressedSize64 > uint64(bundleMaxBytes) {
			errs = append(errs, fmt.Sprintf("%s: skipped (over 100 MB)", f.Name))
			continue
		}
		r, err := f.Open()
		if err != nil {
			continue
		}
		data, err := io.ReadAll(io.LimitReader(r, bundleMaxBytes))
		_ = r.Close()
		if err != nil {
			continue
		}
		files[name] = data
	}

	// 1. CSV sections — reuse the existing importers with identity mapping.
	// (For a bundle we assume the CSV headers already use our field names.)
	runCSV := func(name string, fields []string, fn func(context.Context, *Server, string, []byte, map[string]string) (int, int, []string)) {
		data, ok := files[name]
		if !ok {
			return
		}
		headers, _, err := peekCSV(data)
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s: parse error (%s)", name, err.Error()))
			return
		}
		mapping := map[string]string{}
		lower := map[string]string{}
		for _, h := range headers {
			lower[strings.ToLower(h)] = h
		}
		for _, f := range fields {
			if orig, ok := lower[f]; ok {
				mapping[f] = orig
			}
		}
		imp, skp, es := fn(ctx, s, companyID, data, mapping)
		imported += imp
		skipped += skp
		for _, e := range es {
			errs = append(errs, name+": "+e)
		}
	}
	runCSV("customers.csv", entityFields["customers"], importCustomerRows)
	runCSV("vehicles.csv", entityFields["vehicles"], importVehicleRows)
	runCSV("invoices.csv", entityFields["invoices"], importInvoiceRows)

	// 2. settings.json
	if data, ok := files["settings.json"]; ok {
		if err := applyBundleSettings(ctx, s, companyID, data); err != nil {
			errs = append(errs, "settings.json: "+err.Error())
		} else {
			imported++
		}
	}

	// 3. logo (first match wins)
	for _, name := range []string{"logo.png", "logo.jpg", "logo.jpeg", "logo.webp"} {
		if data, ok := files[name]; ok {
			mime := "image/png"
			switch name {
			case "logo.jpg", "logo.jpeg":
				mime = "image/jpeg"
			case "logo.webp":
				mime = "image/webp"
			}
			if err := applyBundleLogo(ctx, s, companyID, name, mime, data); err != nil {
				errs = append(errs, name+": "+err.Error())
			} else {
				imported++
			}
			break
		}
	}

	return imported, skipped, errs
}

func applyBundleSettings(ctx context.Context, s *Server, companyID string, raw []byte) error {
	var settings bundleSettings
	if err := json.Unmarshal(raw, &settings); err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// shop_settings — upsert into the singleton row.
	sh := settings.Shop
	if sh.Name != "" || sh.Phone != "" || sh.Address1 != "" {
		_, err := tx.Exec(ctx, `
			INSERT INTO shop_settings (company_id, shop_name, address1, address2, city, state, zip, country, phone, email, website)
			VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE(NULLIF($8,''), 'United States'),$9,$10,$11)
			ON CONFLICT (company_id) DO UPDATE SET
			  shop_name = COALESCE(NULLIF(EXCLUDED.shop_name,''), shop_settings.shop_name),
			  address1  = COALESCE(NULLIF(EXCLUDED.address1,''),  shop_settings.address1),
			  address2  = COALESCE(NULLIF(EXCLUDED.address2,''),  shop_settings.address2),
			  city      = COALESCE(NULLIF(EXCLUDED.city,''),      shop_settings.city),
			  state     = COALESCE(NULLIF(EXCLUDED.state,''),     shop_settings.state),
			  zip       = COALESCE(NULLIF(EXCLUDED.zip,''),       shop_settings.zip),
			  country   = COALESCE(NULLIF(EXCLUDED.country,''),   shop_settings.country),
			  phone     = COALESCE(NULLIF(EXCLUDED.phone,''),     shop_settings.phone),
			  email     = COALESCE(NULLIF(EXCLUDED.email,''),     shop_settings.email),
			  website   = COALESCE(NULLIF(EXCLUDED.website,''),   shop_settings.website),
			  updated_at = now()`,
			companyID, sh.Name, sh.Address1, sh.Address2, sh.City, sh.State, sh.Zip,
			sh.Country, sh.Phone, sh.Email, sh.Website)
		if err != nil {
			return fmt.Errorf("shop_settings: %w", err)
		}
	}

	// labor_rates — insert a new active one; deactivate the old active row.
	if settings.LaborRate > 0 {
		_, _ = tx.Exec(ctx, `UPDATE labor_rates SET active=false, updated_at=now() WHERE company_id=$1 AND active`, companyID)
		_, err := tx.Exec(ctx, `
			INSERT INTO labor_rates (company_id, rate, currency, effective_date, active, notes, created_by, updated_by)
			VALUES ($1,$2,'USD', current_date, true, 'Imported from migration bundle', 'migration', 'migration')`,
			companyID, settings.LaborRate)
		if err != nil {
			return fmt.Errorf("labor_rates: %w", err)
		}
	}

	// tax_rates — upsert each by (company_id, lower(name)).
	for _, t := range settings.TaxRates {
		if strings.TrimSpace(t.Name) == "" {
			continue
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO tax_rates (company_id, name, rate, applies_parts, applies_labor, applies_fees, is_default, active)
			VALUES ($1,$2,$3,$4,$5,$6,$7,true)
			ON CONFLICT (company_id, lower(name)) DO UPDATE SET
			  rate = EXCLUDED.rate,
			  applies_parts = EXCLUDED.applies_parts,
			  applies_labor = EXCLUDED.applies_labor,
			  applies_fees  = EXCLUDED.applies_fees,
			  is_default    = EXCLUDED.is_default,
			  updated_at = now()`,
			companyID, t.Name, t.Rate, t.AppliesParts, t.AppliesLabor, t.AppliesFees, t.IsDefault)
		if err != nil {
			return fmt.Errorf("tax_rates(%s): %w", t.Name, err)
		}
	}

	// shop_fees — simple insert; dedupe by (company_id, lower(name)).
	for _, f := range settings.ShopFees {
		if strings.TrimSpace(f.Name) == "" {
			continue
		}
		calc := f.CalcBy
		if calc != "amount" && calc != "percent" {
			calc = "amount"
		}
		applies := f.AppliesTo
		if applies != "labor" && applies != "parts" && applies != "labor_parts" {
			applies = "labor_parts"
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO shop_fees (company_id, name, active, calc_by, amount, percentage, applies_to, taxable)
			VALUES ($1,$2,true,$3,$4,$5,$6,$7)
			ON CONFLICT DO NOTHING`,
			companyID, f.Name, calc, f.Amount, f.Percentage, applies, f.Taxable)
		if err != nil {
			return fmt.Errorf("shop_fees(%s): %w", f.Name, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}
	// Touch updated_at even without a direct update so dependent caches invalidate.
	_, _ = s.db.Exec(ctx, `UPDATE shop_settings SET updated_at = now() WHERE company_id=$1`, companyID)
	_ = time.Now
	return nil
}

func applyBundleLogo(ctx context.Context, s *Server, companyID, name, mime string, data []byte) error {
	// printing_settings is a singleton row per company. Insert if missing, then update.
	_, _ = s.db.Exec(ctx, `
		INSERT INTO printing_settings (company_id) VALUES ($1)
		ON CONFLICT (company_id) DO NOTHING`, companyID)
	_, err := s.db.Exec(ctx, `
		UPDATE printing_settings
		   SET logo_name = $2, logo_mime = $3, logo_size = $4, logo_data = $5,
		       logo_updated_at = now(), updated_at = now(), updated_by = 'migration'
		 WHERE company_id = $1`,
		companyID, name, mime, len(data), data)
	return err
}
