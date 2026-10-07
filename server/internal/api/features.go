package api

// Per-tenant feature flags.
//
// Lives on the existing company_features table (migration 005). Each flag is
// a jsonb key under `features`. The SaaS owner edits them from the Owner
// Portal company-detail page; shop clients read their own flags via
// /api/me/features at boot and hide disabled menu items.
//
// Server-side enforcement (returning 403 for a disabled feature's API) is a
// separate pass. This session only ships the data + UI gate.

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5"
)

// FeatureCatalog is the canonical list the shop UI reads from. The Owner
// Portal renders a toggle for each entry; the shop sidebar hides nav items
// keyed to disabled entries. Keep keys stable — the DB stores them as-is.
var FeatureCatalog = []map[string]any{
	// Core shop features
	{"key": "dashboard", "label": "Dashboard", "group": "Core", "defaultOn": true},
	{"key": "customers", "label": "Customers", "group": "Core", "defaultOn": true},
	{"key": "vehicles", "label": "Vehicles", "group": "Core", "defaultOn": true},
	{"key": "orders", "label": "Repair orders", "group": "Core", "defaultOn": true},
	{"key": "invoices", "label": "Invoices", "group": "Core", "defaultOn": true},
	{"key": "payments", "label": "Payments", "group": "Core", "defaultOn": true},
	{"key": "settings", "label": "Settings", "group": "Core", "defaultOn": true},

	// Technical info
	{"key": "repair_info", "label": "Repair information", "group": "Technical", "defaultOn": true},
	{"key": "diagnostics", "label": "Diagnostics", "group": "Technical", "defaultOn": true},
	{"key": "dtc", "label": "DTC lookup", "group": "Technical", "defaultOn": true},
	{"key": "wiring", "label": "Wiring diagrams", "group": "Technical", "defaultOn": true},
	{"key": "maintenance", "label": "Maintenance schedules", "group": "Technical", "defaultOn": true},
	{"key": "bulletins", "label": "Technical bulletins", "group": "Technical", "defaultOn": true},

	// Shop add-ons
	{"key": "inspections", "label": "Vehicle inspections (DVI)", "group": "Add-ons", "defaultOn": true},
	{"key": "share_link", "label": "Customer share links", "group": "Add-ons", "defaultOn": true},
	{"key": "chat", "label": "Customer chat", "group": "Add-ons", "defaultOn": true},
	{"key": "authorization", "label": "Online authorization", "group": "Add-ons", "defaultOn": true},
	{"key": "online_payments", "label": "Online payments (Stripe / Auth.Net)", "group": "Add-ons", "defaultOn": true},

	// Reporting
	{"key": "reports", "label": "Reports", "group": "Reporting", "defaultOn": true},
	{"key": "sales_reports", "label": "Sales reports", "group": "Reporting", "defaultOn": true},
	{"key": "advanced_reports", "label": "Advanced reports", "group": "Reporting", "defaultOn": false},

	// Operations
	{"key": "backup", "label": "Backup & restore", "group": "Operations", "defaultOn": true},
	{"key": "notifications", "label": "Email notifications", "group": "Operations", "defaultOn": true},
	{"key": "audit_log", "label": "Audit log", "group": "Operations", "defaultOn": true},

	// Not-yet-shipped modules (shown so owners can see what's coming)
	{"key": "inventory", "label": "Inventory", "group": "Future", "defaultOn": false},
	{"key": "parts", "label": "Parts catalog", "group": "Future", "defaultOn": false},
	{"key": "accounting", "label": "Accounting", "group": "Future", "defaultOn": false},
	{"key": "payroll", "label": "Payroll", "group": "Future", "defaultOn": false},
}

func (s *Server) featureRoutes(mux *http.ServeMux) {
	// Owner-side
	mux.HandleFunc("GET /api/owner/features/catalog", s.ownerAuth(s.listFeatureCatalog))
	mux.HandleFunc("GET /api/owner/companies/{id}/features", s.ownerAuth(s.getCompanyFeatures))
	mux.HandleFunc("PUT /api/owner/companies/{id}/features", s.ownerAuth(s.updateCompanyFeatures))

	// Shop-side (self)
	mux.HandleFunc("GET /api/me/features", s.auth("", s.getMyFeatures))
}

func (s *Server) listFeatureCatalog(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, FeatureCatalog)
}

// getCompanyFeatures returns a merged map: catalog defaults overlaid with
// anything the owner has explicitly set. Missing keys fall back to the
// catalog's defaultOn, so new flags added later start sensibly.
func (s *Server) getCompanyFeatures(w http.ResponseWriter, r *http.Request) {
	cid := r.PathValue("id")
	out, err := s.loadMergedFeatures(r, cid)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"features": out, "catalog": FeatureCatalog})
}

type updateFeaturesReq struct {
	Features map[string]bool `json:"features"`
}

func (s *Server) updateCompanyFeatures(w http.ResponseWriter, r *http.Request) {
	cid := r.PathValue("id")
	u := userFrom(r.Context())
	var in updateFeaturesReq
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	// Only accept known keys.
	known := map[string]bool{}
	for _, f := range FeatureCatalog {
		known[f["key"].(string)] = true
	}
	clean := map[string]bool{}
	for k, v := range in.Features {
		if known[k] {
			clean[k] = v
		}
	}
	b, _ := json.Marshal(clean)
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(), `INSERT INTO company_features (company_id, features)
			VALUES ($1::uuid, $2::jsonb)
			ON CONFLICT (company_id) DO UPDATE
			SET features = EXCLUDED.features, updated_at = now()`, cid, string(b))
		if err != nil {
			return err
		}
		return s.recordSaasAuditTx(r.Context(), tx, nil, u.Name, "company_features_updated", "company", cid, &cid,
			map[string]any{"keys": len(clean)}, clientIP(r))
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	s.getCompanyFeatures(w, r)
}

func (s *Server) getMyFeatures(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	out, err := s.loadMergedFeatures(r, cid)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}

func (s *Server) loadMergedFeatures(r *http.Request, cid string) (map[string]bool, error) {
	var raw []byte
	err := s.db.QueryRow(r.Context(), `SELECT features FROM company_features WHERE company_id::text = $1`, cid).Scan(&raw)
	stored := map[string]any{}
	if err == nil && len(raw) > 0 {
		_ = json.Unmarshal(raw, &stored)
	}
	out := map[string]bool{}
	for _, f := range FeatureCatalog {
		key := f["key"].(string)
		if v, ok := stored[key]; ok {
			if b, ok := v.(bool); ok {
				out[key] = b
				continue
			}
		}
		out[key], _ = f["defaultOn"].(bool)
	}
	return out, nil
}
