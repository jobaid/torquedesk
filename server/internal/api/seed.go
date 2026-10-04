package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func envOr(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

// InitCompanyDefaults seeds the minimum settings a brand-new company needs so
// its shop owner can sign in and start creating documents immediately. Called
// from the Owner Portal's "Add Company" flow inside the same transaction so a
// failed init rolls back the whole company creation.
//
// Each inserted row carries the company_id FK; the migration backfilled
// defaults for pre-existing companies, so new tenants need only ensure these
// per-company rows exist.
func (s *Server) InitCompanyDefaults(ctx context.Context, tx pgx.Tx, cid string) error {
	// Singleton settings — a NOP if the migration already created them, which
	// it will have for companies that existed when 005_tenancy ran.
	for _, t := range []string{"shop_settings", "document_preferences", "printing_settings",
		"document_options", "estimate_settings", "document_header_footer", "company_features"} {
		if _, err := tx.Exec(ctx, "INSERT INTO "+t+" (company_id) VALUES ($1::uuid) ON CONFLICT (company_id) DO NOTHING", cid); err != nil {
			return fmt.Errorf("init %s: %w", t, err)
		}
	}
	// Document numbering: one row per doc type.
	if _, err := tx.Exec(ctx, `INSERT INTO document_number_settings (company_id, doc_type, prefix, next_number)
		SELECT $1::uuid, dt.doc_type, '', 10001
		FROM (VALUES ('estimate'), ('repair_order'), ('invoice'), ('statement')) AS dt(doc_type)
		ON CONFLICT (company_id, doc_type) DO NOTHING`, cid); err != nil {
		return fmt.Errorf("init numbering: %w", err)
	}
	// A default labor rate so document creation doesn't 409 on "no active rate".
	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM labor_rates WHERE company_id::text = $1)`, cid).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		if _, err := tx.Exec(ctx, `INSERT INTO labor_rates (company_id, rate, currency, effective_date, active, notes, created_by, updated_by)
			VALUES ($1::uuid, 125.00, 'USD', current_date, true, 'Default rate created with the company. Change it in Settings → Financial.', 'system', 'system')`, cid); err != nil {
			return err
		}
	}
	return nil
}

// SeedDefaultSaasAdmin creates the initial CuraNex SaaS owner account if none
// exists. Credentials come from env (SAAS_ADMIN_EMAIL / SAAS_ADMIN_PASSWORD);
// otherwise a dev-mode default is used with the password logged ONCE on first
// boot so the operator can sign in and rotate it immediately.
func (s *Server) SeedDefaultSaasAdmin(ctx context.Context) error {
	var count int64
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM saas_admin_users`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	email := envOr("SAAS_ADMIN_EMAIL", "owner@curanex.local")
	password := envOr("SAAS_ADMIN_PASSWORD", "")
	logged := false
	if password == "" {
		password = GenerateRandomPassword(12)
		logged = true
	}
	hash, err := HashPassword(password)
	if err != nil {
		return err
	}
	if _, err := s.db.Exec(ctx, `INSERT INTO saas_admin_users (email, name, password_hash) VALUES ($1, $2, $3)`,
		strings.ToLower(email), "CuraNex Owner", hash); err != nil {
		return err
	}
	if logged {
		log.Printf("---- CuraNex SaaS Owner Portal: initial admin created ----")
		log.Printf("  email:    %s", email)
		log.Printf("  password: %s", password)
		log.Printf("  (set SAAS_ADMIN_EMAIL and SAAS_ADMIN_PASSWORD env vars before first run to override)")
		log.Printf("---- change this password immediately after signing in ----")
	}
	return nil
}

// ResetSaasAdminPassword rewrites the password hash for the given SaaS Owner
// email (creating the row if it doesn't exist). Triggered at boot by the
// RESET_SAAS_ADMIN_PASSWORD env var — intended as a self-serve recovery path
// when the operator has lost the initial password.
func (s *Server) ResetSaasAdminPassword(ctx context.Context, email, password string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || password == "" {
		return nil
	}
	hash, err := HashPassword(password)
	if err != nil {
		return err
	}
	tag, err := s.db.Exec(ctx, `UPDATE saas_admin_users SET password_hash = $1, active = true WHERE lower(email) = $2`, hash, email)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		if _, err := s.db.Exec(ctx, `INSERT INTO saas_admin_users (email, name, password_hash) VALUES ($1, $2, $3)`,
			email, "CuraNex Owner", hash); err != nil {
			return err
		}
		log.Printf("CuraNex SaaS Owner reset: created new admin %s", email)
	} else {
		log.Printf("CuraNex SaaS Owner reset: password updated for %s", email)
	}
	return nil
}

// SeedDemoDocuments inserts the sample documents once, on first run.
func (s *Server) SeedDemoDocuments(ctx context.Context) error {
	var done bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM app_secrets WHERE name = 'demo_seeded')`).Scan(&done); err != nil || done {
		return err
	}
	// Demo rows all belong to the backfill demo tenant.
	cid, err := s.demoCompanyID(ctx)
	if err != nil {
		return err
	}
	u := User{Name: "system", Role: "admin", CompanyID: cid}
	writerID := func(name string) *int64 {
		var id int64
		if err := s.db.QueryRow(ctx, `SELECT id FROM shop_service_writers WHERE display_name = $1 AND company_id::text = $2`, name, cid).Scan(&id); err != nil {
			return nil
		}
		return &id
	}
	raw := func(v any) json.RawMessage { b, _ := json.Marshal(v); return b }
	cust := func(id, name, phone, email string) json.RawMessage {
		return raw(map[string]string{"id": id, "name": name, "phone": phone, "email": email})
	}
	docs := []struct {
		num  int64
		in   docInput
		then map[string]any
	}{
		{301328, docInput{Type: "estimate", CustomerID: "c3", CustomerSnapshot: cust("c3", "Dana Whitfield", "(301) 555-0119", "dwhitfield@example.com"),
			VehicleID: "cv3", VehicleSnapshot: raw(map[string]any{"year": 2021, "make": "Ram", "model": "1500 Classic", "engineLabel": "5.7L V8", "vin": "1C6RR7TT3MS518357"}),
			WriterID: writerID("TEE"), Items: raw([]map[string]any{
				{"id": "s1", "kind": "labor", "description": "Engine oil & filter change", "qty": 0.5, "price": 150, "procedure": "oil-change"},
				{"id": "s2", "kind": "part", "description": "Full synthetic 0W-20, 1 qt", "qty": 7, "price": 8.99, "cost": 5.5, "partNumber": "OIL-0W20", "taxable": true},
				{"id": "s3", "kind": "part", "description": "Oil filter", "qty": 1, "price": 9.99, "cost": 4.2, "partNumber": "OF-04152", "taxable": true},
				{"id": "s4", "kind": "labor", "description": "Tire rotation & TPMS relearn", "qty": 0.5, "price": 150, "procedure": "tire-rotation"},
			})}, map[string]any{"type": "invoice", "status": "ready", "mileageIn": "61405", "mileageOut": "61412", "tag": "T-14"}},
		{301329, docInput{Type: "estimate", CustomerID: "c1", CustomerSnapshot: cust("c1", "Marcus Reyes", "(202) 555-0187", "marcus.reyes@example.com"),
			VehicleID: "cv1", VehicleSnapshot: raw(map[string]any{"year": 2021, "make": "GMC", "model": "Yukon XL 1500", "engineLabel": "5.3L V8", "vin": "1GKS2GKC5MR123456"}),
			WriterID: writerID("TEE"), Items: raw([]map[string]any{
				{"id": "s5", "kind": "labor", "description": "Installation labor — right front window regulator assembly", "qty": 1.2, "price": 150, "procedure": "window-regulator-front"},
				{"id": "s6", "kind": "note", "description": "Customer provided part (used). No warranty on customer-supplied parts."},
				{"id": "s7", "kind": "discount", "description": "Loyalty discount", "mode": "percent", "value": 5, "appliesTo": "labor"},
			})}, map[string]any{"type": "repair_order", "status": "in_progress", "mileageIn": "48210"}},
		{301330, docInput{Type: "estimate", CustomerID: "c2", CustomerSnapshot: cust("c2", "Priya Natarajan", "(410) 555-0133", "priya.n@example.com"),
			VehicleID: "cv2", VehicleSnapshot: raw(map[string]any{"year": 2013, "make": "Jeep", "model": "Wrangler", "engineLabel": "3.6L V6", "vin": "1C4HJWEG6DL657026"}),
			WriterID: writerID("MARIA"), ShopNote: "Customer reports clicking when starting.", Items: raw([]map[string]any{
				{"id": "s8", "kind": "labor", "description": "Diagnose no-crank condition", "qty": 1, "price": 150},
				{"id": "s9", "kind": "labor", "description": "Starter motor replacement", "qty": 1.3, "price": 150, "procedure": "starter-rr"},
				{"id": "s10", "kind": "part", "description": "Starter motor", "qty": 1, "price": 189, "cost": 135, "partNumber": "STR-6650", "taxable": true},
			})}, nil},
	}
	for _, d := range docs {
		n := d.num
		doc, err := s.insertDocument(ctx, u, d.in, &n)
		if err != nil {
			return err
		}
		if d.then != nil {
			sets := []string{}
			args := []any{}
			for k, v := range d.then {
				col := map[string]string{"type": "type", "status": "status", "mileageIn": "mileage_in", "mileageOut": "mileage_out", "tag": "tag"}[k]
				args = append(args, v)
				sets = append(sets, col+" = $"+itoa(len(args)))
			}
			args = append(args, doc["id"])
			if _, err := s.db.Exec(ctx, "UPDATE documents SET "+join(sets)+" WHERE id::text = $"+itoa(len(args)), args...); err != nil {
				return err
			}
		}
	}
	// The repair order gets its authorization and technician.
	err = pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE documents SET authorization_info = $1, technician_id = t.id, technician_name = t.display_name
			FROM shop_technicians t WHERE t.display_name = 'DOUGLAZ' AND documents.display_number = '301329' AND documents.company_id = t.company_id`,
			raw(map[string]any{"approved": true, "by": "Marcus Reyes", "method": "Phone", "at": time.Now().Add(-4 * time.Hour).UnixMilli()})); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO app_secrets (name, value) VALUES ('demo_seeded', '\x01')`)
		return err
	})
	if err != nil {
		return errors.Join(errors.New("finish seed"), err)
	}
	return nil
}

func itoa(n int) string {
	if n < 10 {
		return string(rune('0' + n))
	}
	return itoa(n/10) + string(rune('0'+n%10))
}

func join(xs []string) string {
	out := ""
	for i, x := range xs {
		if i > 0 {
			out += ", "
		}
		out += x
	}
	return out
}
