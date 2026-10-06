package api

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
)

var (
	shopRes = &Resource{
		Path: "shop", Entity: "shop_details", Table: "shop_settings", Perm: "shop.edit", Singleton: true,
		Fields: []Field{
			{JSON: "shopName", Col: "shop_name", Label: "Shop name", Required: true, Max: 120},
			{JSON: "address1", Col: "address1", Label: "Address", Max: 200},
			{JSON: "address2", Col: "address2", Label: "Address line 2", Max: 200},
			{JSON: "city", Col: "city", Label: "City", Max: 100},
			{JSON: "state", Col: "state", Label: "State", Max: 60},
			{JSON: "zip", Col: "zip", Label: "ZIP code", Max: 10, Format: "zip"},
			{JSON: "country", Col: "country", Label: "Country", Max: 60},
			{JSON: "phone", Col: "phone", Label: "Phone", Max: 25, Format: "phone"},
			{JSON: "phone2", Col: "phone2", Label: "Secondary phone", Max: 25, Format: "phone"},
			{JSON: "email", Col: "email", Label: "Email", Max: 200, Format: "email"},
			{JSON: "website", Col: "website", Label: "Website", Max: 200, Format: "url"},
			{JSON: "description", Col: "description", Label: "Shop description", Max: 2000},
		},
	}
	displayRes = &Resource{
		Path: "display", Entity: "display_options", Table: "shop_settings", Perm: "financial_settings.edit", Singleton: true,
		Fields: []Field{
			{JSON: "displayPartDetails", Col: "display_part_details", Kind: KBool, Label: "Display part details"},
			{JSON: "displayMarkupDetails", Col: "display_markup_details", Kind: KBool, Label: "Display markup details"},
		},
	}
	licenseRes = &Resource{
		Path: "licenses", Entity: "license", Table: "shop_licenses", Perm: "shop.edit", OrderBy: "expiration_date NULLS LAST, id",
		Fields: []Field{
			{JSON: "type", Col: "type", Kind: KEnum, Label: "Type", Required: true, Enum: []string{"license", "certification", "registration", "other"}},
			{JSON: "name", Col: "name", Label: "Name", Required: true, Max: 200},
			{JSON: "number", Col: "number", Label: "Number", Max: 100},
			{JSON: "issuingOrg", Col: "issuing_org", Label: "Issuing organization", Max: 200},
			{JSON: "issueDate", Col: "issue_date", Kind: KDate, Label: "Issue date"},
			{JSON: "expirationDate", Col: "expiration_date", Kind: KDate, Label: "Expiration date"},
			{JSON: "notes", Col: "notes", Label: "Notes", Max: 2000},
			{JSON: "documentName", Col: "coalesce(document_name, '')", Label: "Document", ReadOnly: true},
		},
		Check: func(m map[string]any, ve ValidationError) {
			i, _ := m["issueDate"].(string)
			e, _ := m["expirationDate"].(string)
			if i != "" && e != "" && e < i {
				ve["expirationDate"] = "Expiration date must be on or after the issue date."
			}
		},
	}
	staffFields = []Field{
		{JSON: "firstName", Col: "first_name", Label: "First name", Required: true, Max: 80},
		{JSON: "lastName", Col: "last_name", Label: "Last name", Max: 80},
		{JSON: "displayName", Col: "display_name", Label: "Display name", Required: true, Max: 40},
		{JSON: "employeeId", Col: "employee_id", Label: "Employee ID", Max: 40},
		{JSON: "phone", Col: "phone", Label: "Phone", Max: 25, Format: "phone"},
		{JSON: "email", Col: "email", Label: "Email", Max: 200, Format: "email"},
		{JSON: "active", Col: "active", Kind: KBool, Label: "Active"},
		{JSON: "notes", Col: "notes", Label: "Notes", Max: 2000},
	}
	writerRes = &Resource{
		Path: "service-writers", Entity: "service_writer", Table: "shop_service_writers", Perm: "staff_settings.edit",
		OrderBy: "active DESC, display_name", Fields: staffFields,
		Label: func(m map[string]any) string { return fmt.Sprint(m["displayName"]) },
	}
	techRes = &Resource{
		Path: "technicians", Entity: "technician", Table: "shop_technicians", Perm: "staff_settings.edit",
		OrderBy: "active DESC, display_name",
		Fields: append(append([]Field{}, staffFields...),
			Field{JSON: "technicianId", Col: "technician_id", Label: "Technician ID", Max: 40},
			Field{JSON: "certification", Col: "certification", Label: "Certification", Max: 200},
			Field{JSON: "specialty", Col: "specialty", Label: "Skill / specialty", Max: 200},
		),
		Label: func(m map[string]any) string { return fmt.Sprint(m["displayName"]) },
	}
	taxRes = &Resource{
		Path: "tax-rates", Entity: "tax_rate", Table: "tax_rates", Perm: "financial_settings.edit", OrderBy: "sort, id",
		Fields: []Field{
			{JSON: "name", Col: "name", Label: "Tax name", Required: true, Max: 80},
			{JSON: "rate", Col: "rate", Kind: KDecimal, Label: "Tax rate", Required: true, Min: 0, MaxNum: 100, Places: 4},
			{JSON: "description", Col: "description", Label: "Description", Max: 500},
			{JSON: "active", Col: "active", Kind: KBool, Label: "Active"},
			{JSON: "isDefault", Col: "is_default", Kind: KBool, Label: "Default tax"},
			{JSON: "appliesParts", Col: "applies_parts", Kind: KBool, Label: "Applies to parts"},
			{JSON: "appliesLabor", Col: "applies_labor", Kind: KBool, Label: "Applies to labor"},
			{JSON: "appliesFees", Col: "applies_fees", Kind: KBool, Label: "Applies to taxable fees"},
			{JSON: "sort", Col: "sort", Kind: KInt, Label: "Order", Min: 0, MaxNum: 1000},
		},
		Check: func(m map[string]any, ve ValidationError) {
			if m["appliesParts"] == false && m["appliesLabor"] == false && m["appliesFees"] == false {
				ve["appliesParts"] = "Choose at least one thing this tax applies to."
			}
		},
	}
	markupRes = &Resource{
		Path: "markups", Entity: "markup", Table: "markup_settings", Perm: "financial_settings.edit", OrderBy: "applies_to, id",
		Fields: []Field{
			{JSON: "name", Col: "name", Label: "Name", Required: true, Max: 80},
			{JSON: "appliesTo", Col: "applies_to", Kind: KEnum, Label: "Applies to", Required: true, Enum: []string{"parts", "labor", "other"}},
			{JSON: "calcType", Col: "calc_type", Kind: KEnum, Label: "Calculation type", Required: true, Enum: []string{"percent", "amount"}},
			{JSON: "percentage", Col: "percentage", Kind: KDecimal, Label: "Percentage", Min: 0, MaxNum: 1000, Places: 3},
			{JSON: "amount", Col: "amount", Kind: KDecimal, Label: "Fixed amount", Min: 0, MaxNum: 100000},
			{JSON: "active", Col: "active", Kind: KBool, Label: "Active"},
			{JSON: "description", Col: "description", Label: "Description", Max: 500},
		},
		Check: func(m map[string]any, ve ValidationError) {
			if m["calcType"] == "percent" && num(m["percentage"]) <= 0 {
				ve["percentage"] = "Enter a percentage greater than 0."
			}
			if m["calcType"] == "amount" && num(m["amount"]) <= 0 {
				ve["amount"] = "Enter an amount greater than 0."
			}
		},
	}
	feeRes = &Resource{
		Path: "shop-fees", Entity: "shop_fee", Table: "shop_fees", Perm: "financial_settings.edit", OrderBy: "sort, id",
		Fields: []Field{
			{JSON: "name", Col: "name", Label: "Fee name", Required: true, Max: 80},
			{JSON: "active", Col: "active", Kind: KBool, Label: "Active"},
			{JSON: "calcBy", Col: "calc_by", Kind: KEnum, Label: "Calculate by", Required: true, Enum: []string{"amount", "percent"}},
			{JSON: "amount", Col: "amount", Kind: KDecimal, Label: "Amount", Min: 0, MaxNum: 10000},
			{JSON: "percentage", Col: "percentage", Kind: KDecimal, Label: "Percentage", Min: 0, MaxNum: 100, Places: 3},
			{JSON: "minimum", Col: "minimum", Kind: KNullDecimal, Label: "Minimum", Min: 0, MaxNum: 10000},
			{JSON: "maximum", Col: "maximum", Kind: KNullDecimal, Label: "Maximum", Min: 0, MaxNum: 10000},
			{JSON: "appliesTo", Col: "applies_to", Kind: KEnum, Label: "Percentage of", Enum: []string{"labor", "parts", "labor_parts"}},
			{JSON: "taxable", Col: "taxable", Kind: KBool, Label: "Taxable"},
			{JSON: "description", Col: "description", Label: "Description", Max: 500},
			{JSON: "sort", Col: "sort", Kind: KInt, Label: "Order", Min: 0, MaxNum: 1000},
		},
		Check: func(m map[string]any, ve ValidationError) {
			if m["calcBy"] == "amount" && num(m["amount"]) <= 0 {
				ve["amount"] = "Enter an amount greater than 0."
			}
			if m["calcBy"] == "percent" {
				if num(m["percentage"]) <= 0 {
					ve["percentage"] = "Enter a percentage greater than 0."
				}
				if m["minimum"] != nil && m["maximum"] != nil && num(m["minimum"]) > num(m["maximum"]) {
					ve["maximum"] = "Maximum must be at least the minimum."
				}
			}
		},
	}
	prefsRes = &Resource{
		Path: "document-preferences", Entity: "document_preferences", Table: "document_preferences", Perm: "document_settings.edit", Singleton: true,
		Fields: []Field{
			{JSON: "defaultOdometerUnit", Col: "default_odometer_unit", Kind: KEnum, Label: "Default odometer unit", Enum: []string{"mi", "km"}},
			{JSON: "includeInspectionDefault", Col: "include_inspection_default", Kind: KBool, Label: "Include Vehicle Inspection Report with documents by default"},
		},
	}
	printingRes = &Resource{
		Path: "printing", Entity: "printing", Table: "printing_settings", Perm: "document_settings.edit", Singleton: true,
		Fields: []Field{
			{JSON: "paperSize", Col: "paper_size", Kind: KEnum, Label: "Paper size", Enum: []string{"letter", "a4"}},
			{JSON: "logoName", Col: "coalesce(logo_name, '')", Label: "Logo", ReadOnly: true},
			{JSON: "logoUpdatedAt", Col: "coalesce(extract(epoch from logo_updated_at)::bigint, 0)", Kind: KInt, Label: "Logo updated", ReadOnly: true},
		},
	}
	optionsRes = &Resource{
		Path: "document-options", Entity: "document_options", Table: "document_options", Perm: "document_settings.edit", Singleton: true,
		Fields: []Field{
			{JSON: "showPartNumbers", Col: "show_part_numbers", Kind: KBool, Label: "Show part numbers"},
			{JSON: "showLaborRates", Col: "show_labor_rates", Kind: KBool, Label: "Show labor rates & hours"},
			{JSON: "showTechnician", Col: "show_technician", Kind: KBool, Label: "Show technician's name"},
			{JSON: "showPromisedDate", Col: "show_promised_date", Kind: KBool, Label: "Show proposed completion date"},
			{JSON: "savePartsDefault", Col: "save_parts_default", Kind: KBool, Label: "Save parts for inspection"},
			{JSON: "showPaymentMethods", Col: "show_payment_methods", Kind: KBool, Label: "Show intended method of payment"},
			{JSON: "paymentMethods", Col: "payment_methods", Kind: KEnumArray, Label: "Payment methods", Enum: []string{"cash", "check", "credit_card", "debit_card", "financing", "other"}},
		},
	}
	estimateRes = &Resource{
		Path: "estimate", Entity: "estimate_settings", Table: "estimate_settings", Perm: "document_settings.edit", Singleton: true,
		Fields: []Field{{JSON: "validityDays", Col: "validity_days", Kind: KInt, Label: "Estimates valid for (days)", Min: 1, MaxNum: 365}},
	}
	headerFooterRes = &Resource{
		Path: "header-footer", Entity: "header_footer", Table: "document_header_footer", Perm: "document_settings.edit", Singleton: true,
		Fields: []Field{
			{JSON: "headerShowLogo", Col: "header_show_logo", Kind: KBool, Label: "Header: logo"},
			{JSON: "headerShowName", Col: "header_show_name", Kind: KBool, Label: "Header: shop name"},
			{JSON: "headerShowAddress", Col: "header_show_address", Kind: KBool, Label: "Header: address"},
			{JSON: "headerShowPhone", Col: "header_show_phone", Kind: KBool, Label: "Header: phone"},
			{JSON: "headerShowEmail", Col: "header_show_email", Kind: KBool, Label: "Header: email"},
			{JSON: "headerShowWebsite", Col: "header_show_website", Kind: KBool, Label: "Header: website"},
			{JSON: "headerLayout", Col: "header_layout", Kind: KEnum, Label: "Header layout", Enum: []string{"logo_left", "logo_center", "logo_right"}},
			{JSON: "headerCustomText", Col: "header_custom_text", Label: "Header custom text", Max: 1000},
			{JSON: "footerCustomText", Col: "footer_custom_text", Label: "Footer custom text", Max: 2000},
			{JSON: "footerShowLicenses", Col: "footer_show_licenses", Kind: KBool, Label: "Footer: licenses"},
			{JSON: "footerShowCertifications", Col: "footer_show_certifications", Kind: KBool, Label: "Footer: certifications"},
			{JSON: "footerShowRegistrations", Col: "footer_show_registrations", Kind: KBool, Label: "Footer: registrations"},
			{JSON: "paymentInstructions", Col: "payment_instructions", Label: "Payment instructions", Max: 2000},
			{JSON: "warrantyText", Col: "warranty_text", Label: "Warranty / disclaimer", Max: 4000},
			{JSON: "customNotes", Col: "custom_notes", Label: "Custom notes", Max: 2000},
		},
	}
)

func num(v any) float64 {
	x, _ := toFloat(v)
	return x
}

var settingsResources = []*Resource{shopRes, displayRes, licenseRes, writerRes, techRes, taxRes, markupRes, feeRes, prefsRes, printingRes, optionsRes, estimateRes, headerFooterRes}

func (s *Server) settingsRoutes(mux *http.ServeMux) {
	for _, r := range settingsResources {
		s.registerResource(mux, r)
	}
	mux.HandleFunc("GET /api/settings", s.auth("settings.view", s.bundle))
	mux.HandleFunc("GET /api/settings/audit", s.auth("settings.view", s.listAudit))

	mux.HandleFunc("GET /api/settings/labor-rates", s.auth("settings.view", s.listLaborRates))
	mux.HandleFunc("POST /api/settings/labor-rates", s.auth("financial_settings.edit", s.createLaborRate))

	mux.HandleFunc("GET /api/settings/numbering", s.auth("settings.view", s.listNumbering))
	mux.HandleFunc("PUT /api/settings/numbering/{type}", s.auth("document_settings.edit", s.updateNumbering))

	mux.HandleFunc("GET /api/settings/printing/logo", s.getLogo) // public: used in <img> on printed documents
	mux.HandleFunc("POST /api/settings/printing/logo", s.auth("document_settings.edit", s.uploadLogo))
	mux.HandleFunc("DELETE /api/settings/printing/logo", s.auth("document_settings.edit", s.deleteLogo))

	mux.HandleFunc("GET /api/settings/licenses/{id}/document", s.auth("settings.view", s.getLicenseDoc))
	mux.HandleFunc("POST /api/settings/licenses/{id}/document", s.auth("shop.edit", s.uploadLicenseDoc))
	mux.HandleFunc("DELETE /api/settings/licenses/{id}/document", s.auth("shop.edit", s.deleteLicenseDoc))
}

// ---------------------------------------------------------------- bundle

// Bundle returns every current setting; the frontend loads it once and
// document creation snapshots from the same data.
type Bundle map[string]any

func (s *Server) loadBundle(ctx context.Context, tx pgx.Tx, cid string) (Bundle, error) {
	b := Bundle{}
	// Self-heal: ensure every per-company settings row exists for this tenant
	// before we read them, so a brand-new company (or any tenant missing a row
	// after an upgrade) never 404s on /api/settings.
	if err := s.InitCompanyDefaults(ctx, tx, cid); err != nil {
		return nil, fmt.Errorf("init defaults: %w", err)
	}
	for _, r := range settingsResources {
		if r.Singleton {
			row, err := r.getSingleton(ctx, tx, cid)
			if err != nil {
				return nil, fmt.Errorf("%s: %w", r.Path, err)
			}
			b[r.Path] = row
		} else {
			rows, err := r.list(ctx, tx, cid)
			if err != nil {
				return nil, fmt.Errorf("%s: %w", r.Path, err)
			}
			b[r.Path] = rows
		}
	}
	lr, err := laborRates(ctx, tx, cid)
	if err != nil {
		return nil, err
	}
	b["laborRates"] = lr
	for _, x := range lr {
		if x["active"] == true {
			b["laborRate"] = x
		}
	}
	nb, err := numbering(ctx, tx, cid)
	if err != nil {
		return nil, err
	}
	b["numbering"] = nb
	return b, nil
}

func (s *Server) bundle(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	var b Bundle
	err := s.tx(r.Context(), func(tx pgx.Tx) (err error) { b, err = s.loadBundle(r.Context(), tx, cid); return })
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, b)
}

// ---------------------------------------------------------------- labor rates

func laborRates(ctx context.Context, tx pgx.Tx, cid string) ([]map[string]any, error) {
	rows, err := tx.Query(ctx, `SELECT id, rate::float8, currency, to_char(effective_date, 'YYYY-MM-DD'), active, notes, created_at, created_by
		FROM labor_rates WHERE company_id::text = $1 ORDER BY active DESC, effective_date DESC, id DESC`, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var rate float64
		var cur, eff, notes, by string
		var active bool
		var at any
		if err := rows.Scan(&id, &rate, &cur, &eff, &active, &notes, &at, &by); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"id": id, "rate": rate, "currency": cur, "effectiveDate": eff, "active": active, "notes": notes, "createdAt": at, "createdBy": by})
	}
	return out, rows.Err()
}

func (s *Server) listLaborRates(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	var out []map[string]any
	err := s.tx(r.Context(), func(tx pgx.Tx) (err error) { out, err = laborRates(r.Context(), tx, cid); return })
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}

var laborFields = []Field{
	{JSON: "rate", Kind: KDecimal, Label: "Labor rate", Required: true, Min: 0.01, MaxNum: 9999.99},
	{JSON: "currency", Kind: KEnum, Label: "Currency", Required: true, Enum: []string{"USD", "CAD", "EUR", "GBP", "AUD", "MXN"}},
	{JSON: "effectiveDate", Kind: KDate, Label: "Effective date", Required: true},
	{JSON: "notes", Label: "Notes", Max: 500},
}

// createLaborRate adds a new rate and makes it the active one. Previous rates are
// kept for history; existing documents keep the rate frozen in their snapshot.
func (s *Server) createLaborRate(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := readJSON(r, &body); err != nil {
		writeErr(w, 400, "Invalid JSON body.")
		return
	}
	res := &Resource{Fields: laborFields}
	vals, err := res.validate(body, nil, true)
	if err != nil {
		handleErr(w, err)
		return
	}
	u := userFrom(r.Context())
	cid := u.CompanyID
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		var oldRate *float64
		tx.QueryRow(r.Context(), `SELECT rate::float8 FROM labor_rates WHERE active AND company_id::text = $1 FOR UPDATE`, cid).Scan(&oldRate)
		if _, err := tx.Exec(r.Context(), `UPDATE labor_rates SET active = false, updated_at = now(), updated_by = $1 WHERE active AND company_id::text = $2`, u.Name, cid); err != nil {
			return err
		}
		var id int64
		if err := tx.QueryRow(r.Context(), `INSERT INTO labor_rates (company_id, rate, currency, effective_date, active, notes, created_by, updated_by)
			VALUES ($1::uuid, $2, $3, $4, true, $5, $6, $6) RETURNING id`, cid, vals["rate"], vals["currency"], vals["effectiveDate"], vals["notes"], u.Name).Scan(&id); err != nil {
			return err
		}
		old := ""
		if oldRate != nil {
			old = fmt.Sprintf("$%.2f", *oldRate)
		}
		return audit(r.Context(), tx, u, "labor_rate", id, "update", "Labor rate", old, fmt.Sprintf("$%.2f", vals["rate"]), cid)
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	s.listLaborRates(w, r)
}

// ---------------------------------------------------------------- numbering

func numbering(ctx context.Context, tx pgx.Tx, cid string) ([]map[string]any, error) {
	rows, err := tx.Query(ctx, `SELECT n.doc_type, n.prefix, n.next_number,
		coalesce((SELECT max(number) FROM documents d WHERE d.number_type = n.doc_type AND d.company_id = n.company_id), 0)
		FROM document_number_settings n WHERE n.company_id::text = $1
		ORDER BY array_position(ARRAY['estimate','repair_order','invoice','statement'], n.doc_type)`, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var t, p string
		var next, last int64
		if err := rows.Scan(&t, &p, &next, &last); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"docType": t, "prefix": p, "nextNumber": next, "lastIssued": last})
	}
	return out, rows.Err()
}

func (s *Server) listNumbering(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	var out []map[string]any
	err := s.tx(r.Context(), func(tx pgx.Tx) (err error) { out, err = numbering(r.Context(), tx, cid); return })
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}

func (s *Server) updateNumbering(w http.ResponseWriter, r *http.Request) {
	docType := r.PathValue("type")
	var body map[string]any
	if err := readJSON(r, &body); err != nil {
		writeErr(w, 400, "Invalid JSON body.")
		return
	}
	res := &Resource{Fields: []Field{
		{JSON: "nextNumber", Kind: KInt, Label: "Next number", Required: true, Min: 1, MaxNum: 9_999_999_999},
		{JSON: "prefix", Label: "Prefix", Max: 8},
	}}
	vals, err := res.validate(body, nil, true)
	if err != nil {
		handleErr(w, err)
		return
	}
	u := userFrom(r.Context())
	cid := u.CompanyID
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		var oldNext int64
		var oldPrefix string
		if err := tx.QueryRow(r.Context(), `SELECT next_number, prefix FROM document_number_settings WHERE company_id::text = $1 AND doc_type = $2 FOR UPDATE`, cid, docType).Scan(&oldNext, &oldPrefix); err != nil {
			return err
		}
		next := vals["nextNumber"].(int64)
		prefix := oldPrefix
		if p, ok := vals["prefix"].(string); ok {
			prefix = p
		}
		var maxIssued int64
		tx.QueryRow(r.Context(), `SELECT coalesce(max(number), 0) FROM documents WHERE company_id::text = $1 AND number_type = $2`, cid, docType).Scan(&maxIssued)
		if next <= maxIssued {
			return ValidationError{"nextNumber": fmt.Sprintf("Must be greater than the last issued number (%d) to avoid duplicates.", maxIssued)}
		}
		var clash bool
		tx.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM documents WHERE company_id::text = $1 AND display_number = $2)`, cid, prefix+fmt.Sprint(next)).Scan(&clash)
		if clash {
			return ValidationError{"nextNumber": "A document with number " + prefix + fmt.Sprint(next) + " already exists. Choose another number or prefix."}
		}
		if _, err := tx.Exec(r.Context(), `UPDATE document_number_settings SET next_number = $1, prefix = $2, updated_at = now(), updated_by = $3 WHERE company_id::text = $4 AND doc_type = $5`, next, prefix, u.Name, cid, docType); err != nil {
			return err
		}
		if next != oldNext {
			if err := audit(r.Context(), tx, u, "document_numbering", docType, "update", "Next number", fmt.Sprint(oldNext), fmt.Sprint(next), cid); err != nil {
				return err
			}
		}
		if prefix != oldPrefix {
			return audit(r.Context(), tx, u, "document_numbering", docType, "update", "Prefix", oldPrefix, prefix, cid)
		}
		return nil
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	s.listNumbering(w, r)
}

// ---------------------------------------------------------------- uploads

var imageTypes = map[string]bool{"image/png": true, "image/jpeg": true, "image/webp": true}
var docTypes = map[string]bool{"image/png": true, "image/jpeg": true, "image/webp": true, "application/pdf": true}

// readUpload reads a multipart "file" field, sniffing the real content type.
func readUpload(r *http.Request, maxBytes int64, allowed map[string]bool) (name, mime string, data []byte, err error) {
	r.Body = http.MaxBytesReader(nil, r.Body, maxBytes+64<<10)
	f, hdr, err := r.FormFile("file")
	if err != nil {
		return "", "", nil, errStatus(400, "Choose a file to upload (max "+fmt.Sprint(maxBytes>>20)+" MB).")
	}
	defer f.Close()
	data, err = io.ReadAll(io.LimitReader(f, maxBytes+1))
	if err != nil {
		return "", "", nil, errStatus(400, "Could not read the file.")
	}
	if int64(len(data)) > maxBytes {
		return "", "", nil, errStatus(413, fmt.Sprintf("File is too large. Maximum size is %d MB.", maxBytes>>20))
	}
	mime = http.DetectContentType(data)
	if strings.HasPrefix(mime, "application/octet-stream") && strings.HasSuffix(strings.ToLower(hdr.Filename), ".webp") {
		mime = "image/webp"
	}
	mime = strings.SplitN(mime, ";", 2)[0]
	if !allowed[mime] {
		return "", "", nil, errStatus(415, "Unsupported file type.")
	}
	name = hdr.Filename
	if len(name) > 200 {
		name = name[:200]
	}
	return name, mime, data, nil
}

func (s *Server) uploadLogo(w http.ResponseWriter, r *http.Request) {
	name, mime, data, err := readUpload(r, 2<<20, imageTypes)
	if err != nil {
		if he, ok := err.(httpError); ok && he.status == 415 {
			err = errStatus(415, "Logo must be a PNG, JPG or WebP image.")
		}
		handleErr(w, err)
		return
	}
	u := userFrom(r.Context())
	cid := u.CompanyID
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		var old string
		tx.QueryRow(r.Context(), `SELECT coalesce(logo_name, '') FROM printing_settings WHERE company_id::text = $1`, cid).Scan(&old)
		if _, err := tx.Exec(r.Context(), `UPDATE printing_settings SET logo_name = $1, logo_mime = $2, logo_size = $3, logo_data = $4,
			logo_updated_at = now(), updated_at = now(), updated_by = $5 WHERE company_id::text = $6`, name, mime, len(data), data, u.Name, cid); err != nil {
			return err
		}
		return audit(r.Context(), tx, u, "printing", "singleton", "update", "Shop logo", old, name, cid)
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	s.serveSingleton(w, r, printingRes)
}

func (s *Server) deleteLogo(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	cid := u.CompanyID
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		var old string
		tx.QueryRow(r.Context(), `SELECT coalesce(logo_name, '') FROM printing_settings WHERE company_id::text = $1`, cid).Scan(&old)
		if _, err := tx.Exec(r.Context(), `UPDATE printing_settings SET logo_name = NULL, logo_mime = NULL, logo_size = NULL, logo_data = NULL,
			logo_updated_at = now(), updated_at = now(), updated_by = $1 WHERE company_id::text = $2`, u.Name, cid); err != nil {
			return err
		}
		return audit(r.Context(), tx, u, "printing", "singleton", "update", "Shop logo", old, "(removed)", cid)
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	s.serveSingleton(w, r, printingRes)
}

// getLogo is public (used by <img> on printed documents) so it accepts a
// company id via ?company query param. If omitted, falls back to the demo tenant.
func (s *Server) getLogo(w http.ResponseWriter, r *http.Request) {
	cid := r.URL.Query().Get("company")
	if cid == "" {
		if demo, err := s.demoCompanyID(r.Context()); err == nil {
			cid = demo
		}
	}
	var mime *string
	var data []byte
	if err := s.db.QueryRow(r.Context(), `SELECT logo_mime, logo_data FROM printing_settings WHERE company_id::text = $1`, cid).Scan(&mime, &data); err != nil || mime == nil {
		writeErr(w, 404, "No logo.")
		return
	}
	w.Header().Set("Content-Type", *mime)
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Write(data)
}

// serveSingleton returns the current user's per-company singleton row.
func (s *Server) serveSingleton(w http.ResponseWriter, r *http.Request, res *Resource) {
	cid := companyFrom(r.Context())
	var row map[string]any
	err := s.tx(r.Context(), func(tx pgx.Tx) (err error) { row, err = res.getSingleton(r.Context(), tx, cid); return })
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, row)
}

func (s *Server) uploadLicenseDoc(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	name, mime, data, err := readUpload(r, 5<<20, docTypes)
	if err != nil {
		if he, ok := err.(httpError); ok && he.status == 415 {
			err = errStatus(415, "Document must be a PDF, PNG, JPG or WebP file.")
		}
		handleErr(w, err)
		return
	}
	u := userFrom(r.Context())
	cid := u.CompanyID
	var row map[string]any
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		tag, err := tx.Exec(r.Context(), `UPDATE shop_licenses SET document_name = $1, document_mime = $2, document_size = $3, document_data = $4,
			updated_at = now(), updated_by = $5 WHERE id = $6 AND company_id::text = $7`, name, mime, len(data), data, u.Name, id, cid)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return pgx.ErrNoRows
		}
		if err := audit(r.Context(), tx, u, "license", id, "update", "Supporting document", "", name, cid); err != nil {
			return err
		}
		row, err = licenseRes.get(r.Context(), tx, cid, id)
		return err
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, row)
}

func (s *Server) deleteLicenseDoc(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	u := userFrom(r.Context())
	cid := u.CompanyID
	var row map[string]any
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		var old string
		if err := tx.QueryRow(r.Context(), `SELECT coalesce(document_name, '') FROM shop_licenses WHERE id = $1 AND company_id::text = $2`, id, cid).Scan(&old); err != nil {
			return err
		}
		if _, err := tx.Exec(r.Context(), `UPDATE shop_licenses SET document_name = NULL, document_mime = NULL, document_size = NULL, document_data = NULL,
			updated_at = now(), updated_by = $1 WHERE id = $2 AND company_id::text = $3`, u.Name, id, cid); err != nil {
			return err
		}
		if err := audit(r.Context(), tx, u, "license", id, "update", "Supporting document", old, "(removed)", cid); err != nil {
			return err
		}
		var err error
		row, err = licenseRes.get(r.Context(), tx, cid, id)
		return err
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, row)
}

func (s *Server) getLicenseDoc(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	cid := companyFrom(r.Context())
	var name, mime *string
	var data []byte
	if err := s.db.QueryRow(r.Context(), `SELECT document_name, document_mime, document_data FROM shop_licenses WHERE id = $1 AND company_id::text = $2`, id, cid).Scan(&name, &mime, &data); err != nil || mime == nil {
		writeErr(w, 404, "No document uploaded.")
		return
	}
	w.Header().Set("Content-Type", *mime)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", *name))
	w.Write(data)
}
