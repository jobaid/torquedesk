package api

// Vehicle Intelligence & Parts Pricing HTTP routes.
//
// Entitlement: every endpoint is guarded by companyHasFeature() against
//   vehicle_history  → CARFAX
//   parts_pricing    → merchant price lookups
// Toggle lives on company_features (Owner Portal → company detail).
//
// Credentials: stored encrypted (AES-GCM) via Encrypt/Decrypt; never
// returned to the frontend. Tenant isolation enforced on every query by
// scoping company_id = userFrom(ctx).CompanyID.

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

func (s *Server) vintelRoutes(mux *http.ServeMux) {
	// Catalog of adapters (always available; UI uses this to render Connect pages).
	mux.HandleFunc("GET /api/vintel/providers", s.auth("", s.listVintelProviders))

	// Merchant connections (per shop).
	mux.HandleFunc("GET /api/vintel/connections", s.auth("", s.listMerchantConnections))
	mux.HandleFunc("POST /api/vintel/connections/{provider}", s.auth("shop.edit", s.connectMerchant))
	mux.HandleFunc("DELETE /api/vintel/connections/{provider}", s.auth("shop.edit", s.disconnectMerchant))

	// Vehicle history reports.
	mux.HandleFunc("POST /api/vintel/vehicle-history", s.auth("shop.edit", s.requestVehicleHistory))
	mux.HandleFunc("GET /api/vintel/vehicle-history", s.auth("", s.listVehicleHistory))

	// Parts price comparison.
	mux.HandleFunc("POST /api/vintel/parts/quote", s.auth("shop.edit", s.quoteParts))
}

// companyHasFeature returns true if the shop has the add-on toggled on.
// Features live in company_features.features (jsonb). Default false if missing.
func (s *Server) companyHasFeature(ctx context.Context, companyID, key string) bool {
	var raw []byte
	err := s.db.QueryRow(ctx, `SELECT features FROM company_features WHERE company_id=$1`, companyID).Scan(&raw)
	if err != nil {
		return false
	}
	var m map[string]bool
	if err := json.Unmarshal(raw, &m); err != nil {
		return false
	}
	return m[key]
}

func (s *Server) requireFeature(w http.ResponseWriter, r *http.Request, key string) bool {
	u := userFrom(r.Context())
	if !s.companyHasFeature(r.Context(), u.CompanyID, key) {
		writeJSON(w, 403, map[string]any{
			"error":        "This add-on is not enabled for your shop. Contact your Fixora administrator.",
			"missingAddon": key,
		})
		return false
	}
	return true
}

// ---- providers catalog ------------------------------------------------------

func (s *Server) listVintelProviders(w http.ResponseWriter, r *http.Request) {
	out := make([]map[string]any, 0, len(merchantRegistry))
	for _, a := range merchantRegistry {
		out = append(out, map[string]any{
			"provider":     a.Provider(),
			"kind":         string(a.Kind()),
			"capabilities": a.Capabilities(),
			"credentials":  a.CredentialSchema(),
		})
	}
	writeJSON(w, 200, out)
}

// ---- connections ------------------------------------------------------------

type connectionDTO struct {
	Provider     string     `json:"provider"`
	Kind         string     `json:"kind"`
	Status       string     `json:"status"`
	AccountLabel string     `json:"accountLabel"`
	Enabled      bool       `json:"enabled"`
	LastCheckAt  *time.Time `json:"lastCheckAt,omitempty"`
	LastError    string     `json:"lastError,omitempty"`
}

func (s *Server) listMerchantConnections(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	rows, err := s.db.Query(r.Context(),
		`SELECT provider, status, account_label, enabled, last_check_at, last_error
		   FROM shop_merchant_connections WHERE company_id=$1 ORDER BY provider`, u.CompanyID)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	defer rows.Close()
	out := []connectionDTO{}
	for rows.Next() {
		var c connectionDTO
		var last *time.Time
		if err := rows.Scan(&c.Provider, &c.Status, &c.AccountLabel, &c.Enabled, &last, &c.LastError); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		c.LastCheckAt = last
		if a := findAdapter(c.Provider); a != nil {
			c.Kind = string(a.Kind())
		}
		out = append(out, c)
	}
	writeJSON(w, 200, out)
}

type connectReq struct {
	AccountLabel string            `json:"accountLabel"`
	Credentials  map[string]string `json:"credentials"` // {key: value}
}

func (s *Server) connectMerchant(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	provider := r.PathValue("provider")
	a := findAdapter(provider)
	if a == nil {
		writeErr(w, 404, "unknown provider")
		return
	}
	// Entitlement gate based on adapter kind.
	key := "vehicle_history"
	if a.Kind() == KindPartsPricing {
		key = "parts_pricing"
	}
	if !s.requireFeature(w, r, key) {
		return
	}

	var in connectReq
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, 400, "invalid request")
		return
	}
	// Validate required fields.
	for _, f := range a.CredentialSchema() {
		if f.Required && in.Credentials[f.Key] == "" {
			writeErr(w, 400, "missing "+f.Label)
			return
		}
	}
	// Encrypt the whole credentials map as a single blob.
	key2, err := LoadDataKey(s.secret)
	if err != nil {
		writeErr(w, 500, "encryption key unavailable")
		return
	}
	raw, _ := json.Marshal(in.Credentials)
	enc, err := Encrypt(key2, raw)
	if err != nil {
		writeErr(w, 500, "encrypt: "+err.Error())
		return
	}

	_, err = s.db.Exec(r.Context(),
		`INSERT INTO shop_merchant_connections
		   (company_id, provider, account_label, status, credentials_enc, enabled, updated_at)
		 VALUES ($1,$2,$3,'connected',$4,true,now())
		 ON CONFLICT (company_id, provider) DO UPDATE SET
		   account_label=EXCLUDED.account_label,
		   status='connected',
		   credentials_enc=EXCLUDED.credentials_enc,
		   enabled=true,
		   last_error='',
		   updated_at=now()`,
		u.CompanyID, provider, in.AccountLabel, enc)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	s.logIntegrationAudit(r.Context(), u.CompanyID, u.Name, provider, "connect", map[string]any{"accountLabel": in.AccountLabel}, clientIP(r))
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) disconnectMerchant(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	provider := r.PathValue("provider")
	_, err := s.db.Exec(r.Context(),
		`UPDATE shop_merchant_connections
		   SET status='disconnected', enabled=false, credentials_enc=NULL, updated_at=now()
		 WHERE company_id=$1 AND provider=$2`, u.CompanyID, provider)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	s.logIntegrationAudit(r.Context(), u.CompanyID, u.Name, provider, "disconnect", nil, clientIP(r))
	writeJSON(w, 200, map[string]any{"ok": true})
}

// loadCreds returns the decrypted credential blob for a connected provider,
// or (nil, false) if not connected.
func (s *Server) loadCreds(ctx context.Context, companyID, provider string) ([]byte, bool) {
	var enc []byte
	err := s.db.QueryRow(ctx,
		`SELECT credentials_enc FROM shop_merchant_connections
		  WHERE company_id=$1 AND provider=$2 AND enabled=true AND status='connected'`,
		companyID, provider).Scan(&enc)
	if err != nil || len(enc) == 0 {
		return nil, false
	}
	key, err := LoadDataKey(s.secret)
	if err != nil {
		return nil, false
	}
	plain, err := Decrypt(key, enc)
	if err != nil {
		return nil, false
	}
	return []byte(plain), true
}

// ---- vehicle history --------------------------------------------------------

type vhrReq struct {
	VIN       string `json:"vin"`
	VehicleID string `json:"vehicleId,omitempty"`
}

func (s *Server) requestVehicleHistory(w http.ResponseWriter, r *http.Request) {
	if !s.requireFeature(w, r, "vehicle_history") {
		return
	}
	u := userFrom(r.Context())
	var in vhrReq
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || len(in.VIN) < 11 {
		writeErr(w, 400, "a valid VIN is required")
		return
	}
	provider := "carfax"
	a, _ := findAdapter(provider).(VehicleHistoryAdapter)
	if a == nil {
		writeErr(w, 500, "no vehicle-history adapter available")
		return
	}
	creds, _ := s.loadCreds(r.Context(), u.CompanyID, provider)
	res, _ := a.RequestReport(r.Context(), creds, in.VIN)

	var vehicleID *string
	if in.VehicleID != "" {
		vehicleID = &in.VehicleID
	}
	var completed *time.Time
	if !res.Completed.IsZero() {
		completed = &res.Completed
	}
	_, err := s.db.Exec(r.Context(),
		`INSERT INTO vehicle_history_report_requests
		   (company_id, vehicle_id, vin, provider, status, report_url, error_message, requested_by, completed_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		u.CompanyID, vehicleID, in.VIN, provider, res.Status, res.ReportURL, res.Error, u.Name, completed)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	s.logIntegrationAudit(r.Context(), u.CompanyID, u.Name, provider, "report_request",
		map[string]any{"vin": in.VIN, "status": res.Status}, clientIP(r))
	writeJSON(w, 200, map[string]any{
		"status":    res.Status,
		"reportUrl": res.ReportURL,
		"error":     res.Error,
	})
}

func (s *Server) listVehicleHistory(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	rows, err := s.db.Query(r.Context(),
		`SELECT id, vin, provider, status, report_url, requested_at, completed_at, error_message, requested_by
		   FROM vehicle_history_report_requests
		  WHERE company_id=$1 ORDER BY requested_at DESC LIMIT 100`, u.CompanyID)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, vin, prov, status, url, msg, by string
		var requested time.Time
		var completed *time.Time
		if err := rows.Scan(&id, &vin, &prov, &status, &url, &requested, &completed, &msg, &by); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		out = append(out, map[string]any{
			"id":          id,
			"vin":         vin,
			"provider":    prov,
			"status":      status,
			"reportUrl":   url,
			"requestedAt": requested,
			"completedAt": completed,
			"error":       msg,
			"requestedBy": by,
		})
	}
	writeJSON(w, 200, out)
}

// ---- parts price comparison -------------------------------------------------

type quoteBody struct {
	RepairOrderID string `json:"repairOrderId,omitempty"`
	VIN           string `json:"vin,omitempty"`
	SearchTerm    string `json:"searchTerm"`
	PartNumber    string `json:"partNumber,omitempty"`
}

func (s *Server) quoteParts(w http.ResponseWriter, r *http.Request) {
	if !s.requireFeature(w, r, "parts_pricing") {
		return
	}
	u := userFrom(r.Context())
	var in quoteBody
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.SearchTerm == "" {
		writeErr(w, 400, "searchTerm is required")
		return
	}

	// Create the quote row.
	var quoteID string
	var roID *string
	if in.RepairOrderID != "" {
		roID = &in.RepairOrderID
	}
	expires := time.Now().Add(2 * time.Hour)
	err := s.db.QueryRow(r.Context(),
		`INSERT INTO parts_price_quotes (company_id, repair_order_id, vin, search_term, requested_by, expires_at)
		 VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
		u.CompanyID, roID, in.VIN, in.SearchTerm, u.Name, expires).Scan(&quoteID)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}

	// Query every connected parts adapter.
	results := []QuoteItem{}
	for _, a := range merchantRegistry {
		p, ok := a.(PartsAdapter)
		if !ok {
			continue
		}
		creds, connected := s.loadCreds(r.Context(), u.CompanyID, p.Provider())
		if !connected {
			continue
		}
		items, err := p.Quote(r.Context(), creds, QuoteRequest{VIN: in.VIN, SearchTerm: in.SearchTerm, PartNumber: in.PartNumber})
		if err != nil {
			s.logIntegrationAudit(r.Context(), u.CompanyID, u.Name, p.Provider(), "error",
				map[string]any{"error": err.Error()}, clientIP(r))
			continue
		}
		for _, it := range items {
			it.Provider = p.Provider()
			if it.RetrievedAt.IsZero() {
				it.RetrievedAt = time.Now()
			}
			results = append(results, it)
			_, _ = s.db.Exec(r.Context(),
				`INSERT INTO parts_quote_items
				   (quote_id, provider, merchant_part_no, description, classification, fitment_note,
				    unit_price, core_charge, shipping, fees, currency, availability, delivery_est, retrieved_at)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
				quoteID, it.Provider, it.MerchantPartNo, it.Description, it.Classification, it.Fitment,
				it.UnitPrice, it.Core, it.Shipping, it.Fees, it.Currency, it.Availability, it.DeliveryEst, it.RetrievedAt)
		}
	}

	s.logIntegrationAudit(r.Context(), u.CompanyID, u.Name, "", "price_lookup",
		map[string]any{"searchTerm": in.SearchTerm, "resultCount": len(results)}, clientIP(r))

	writeJSON(w, 200, map[string]any{
		"quoteId":   quoteID,
		"items":     results,
		"expiresAt": expires,
	})
}

// ---- audit ------------------------------------------------------------------

func (s *Server) logIntegrationAudit(ctx context.Context, companyID, actor, provider, action string, details map[string]any, ip string) {
	if details == nil {
		details = map[string]any{}
	}
	payload, _ := json.Marshal(details)
	_, _ = s.db.Exec(ctx,
		`INSERT INTO integration_audit_logs (company_id, actor_name, provider, action, details, ip)
		 VALUES ($1,$2,$3,$4,$5,$6)`,
		companyID, actor, provider, action, payload, ip)
}
