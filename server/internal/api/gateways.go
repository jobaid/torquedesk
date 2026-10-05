package api

// Payment-gateway settings — Session 1 of the Stripe + Authorize.Net rollout.
//
// This file is CRUD + verification only. No charges are created here; the
// Checkout handoff lives in a later file (and session). The split keeps the
// money-moving code reviewable in isolation.
//
// Secrets are encrypted at rest via crypto.go. The frontend only ever receives:
//   - provider, mode, display_name, publishable_key (public), active, verified,
//     secret_last4, verification_error, updated_at.
// It never receives the plaintext secret or webhook secret back, even to the
// shop owner who entered it — if they lose it, they rotate it.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ------------------------------- shop API -----------------------------------

func (s *Server) gatewayRoutes(mux *http.ServeMux) {
	// Shop-side: tenant-scoped payment gateways the shop uses to charge its own
	// customers. shop_owner/manager can edit; everyone else can read.
	mux.HandleFunc("GET /api/settings/payment-gateways", s.auth("settings.view", s.listShopGateways))
	mux.HandleFunc("PUT /api/settings/payment-gateways/{provider}", s.auth("shop.edit", s.upsertShopGateway))
	mux.HandleFunc("POST /api/settings/payment-gateways/{provider}/verify", s.auth("shop.edit", s.verifyShopGateway))
	mux.HandleFunc("DELETE /api/settings/payment-gateways/{provider}", s.auth("shop.edit", s.deleteShopGateway))

	// SaaS-owner side: CuraNex-level processors used to bill shops for their
	// subscription. Only the saas_owner role can touch these.
	mux.HandleFunc("GET /api/owner/billing-processors", s.ownerAuth(s.listOwnerProcessors))
	mux.HandleFunc("PUT /api/owner/billing-processors/{provider}", s.ownerAuth(s.upsertOwnerProcessor))
	mux.HandleFunc("POST /api/owner/billing-processors/{provider}/verify", s.ownerAuth(s.verifyOwnerProcessor))
	mux.HandleFunc("DELETE /api/owner/billing-processors/{provider}", s.ownerAuth(s.deleteOwnerProcessor))
}

type gatewayDTO struct {
	Provider          string `json:"provider"`
	Mode              string `json:"mode"`
	DisplayName       string `json:"displayName"`
	PublishableKey    string `json:"publishableKey"`
	SecretLast4       string `json:"secretLast4"`
	HasSecret         bool   `json:"hasSecret"`
	HasWebhookSecret  bool   `json:"hasWebhookSecret"`
	Active            bool   `json:"active"`
	VerifiedAt        *int64 `json:"verifiedAt"`
	VerificationError string `json:"verificationError"`
	UpdatedAt         int64  `json:"updatedAt"`
}

type gatewayInput struct {
	Mode             string `json:"mode"`
	DisplayName      string `json:"displayName"`
	PublishableKey   string `json:"publishableKey"`
	SecretKey        string `json:"secretKey"`     // empty = keep existing
	WebhookSecret    string `json:"webhookSecret"` // empty = keep existing
	ClearWebhook     bool   `json:"clearWebhook"`
	Active           bool   `json:"active"`
}

func validProvider(p string) bool { return p == "stripe" || p == "authnet" }
func validMode(m string) bool     { return m == "test" || m == "live" }

func scanGateway(row pgx.Row) (gatewayDTO, []byte, []byte, error) {
	var g gatewayDTO
	var secret, webhook []byte
	var verifiedAt *time.Time
	var updatedAt time.Time
	err := row.Scan(
		&g.Provider, &g.Mode, &g.DisplayName, &g.PublishableKey, &g.SecretLast4,
		&secret, &webhook, &g.Active, &verifiedAt, &g.VerificationError, &updatedAt,
	)
	if err != nil {
		return g, nil, nil, err
	}
	g.HasSecret = len(secret) > 0
	g.HasWebhookSecret = len(webhook) > 0
	if verifiedAt != nil {
		ms := verifiedAt.UnixMilli()
		g.VerifiedAt = &ms
	}
	g.UpdatedAt = updatedAt.UnixMilli()
	return g, secret, webhook, nil
}

const gatewayCols = `provider, mode, display_name, publishable_key, secret_last4,
	encrypted_secret_key, encrypted_webhook_secret, active, verified_at, verification_error, updated_at`

func (s *Server) listShopGateways(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	rows, err := s.db.Query(r.Context(), `SELECT `+gatewayCols+` FROM shop_payment_gateways WHERE company_id::text = $1 ORDER BY provider`, cid)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	out := []gatewayDTO{}
	for rows.Next() {
		g, _, _, err := scanGateway(rows)
		if err != nil {
			handleErr(w, err)
			return
		}
		out = append(out, g)
	}
	writeJSON(w, 200, out)
}

func (s *Server) upsertShopGateway(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	cid := companyFrom(r.Context())
	provider := r.PathValue("provider")
	if !validProvider(provider) {
		writeErr(w, 400, "Unknown payment provider.")
		return
	}
	var in gatewayInput
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request body.")
		return
	}
	if !validMode(in.Mode) {
		writeErr(w, 400, "Mode must be 'test' or 'live'.")
		return
	}
	g, err := s.upsertGatewayRow(r.Context(), gatewayScope{table: "shop_payment_gateways", companyID: cid}, provider, in)
	if err != nil {
		handleErr(w, err)
		return
	}
	_ = s.auditGateway(r.Context(), u, cid, provider, "updated", in.Mode, in.Active)
	writeJSON(w, 200, g)
}

func (s *Server) verifyShopGateway(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	provider := r.PathValue("provider")
	if !validProvider(provider) {
		writeErr(w, 400, "Unknown payment provider.")
		return
	}
	g, err := s.verifyGatewayRow(r.Context(), gatewayScope{table: "shop_payment_gateways", companyID: cid}, provider)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, g)
}

func (s *Server) deleteShopGateway(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	cid := companyFrom(r.Context())
	provider := r.PathValue("provider")
	if !validProvider(provider) {
		writeErr(w, 400, "Unknown payment provider.")
		return
	}
	if _, err := s.db.Exec(r.Context(), `DELETE FROM shop_payment_gateways WHERE company_id::text = $1 AND provider = $2`, cid, provider); err != nil {
		handleErr(w, err)
		return
	}
	_ = s.auditGateway(r.Context(), u, cid, provider, "removed", "", false)
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ------------------------------- owner API ----------------------------------

func (s *Server) listOwnerProcessors(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT `+gatewayCols+` FROM saas_payment_methods ORDER BY provider`)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	out := []gatewayDTO{}
	for rows.Next() {
		g, _, _, err := scanGateway(rows)
		if err != nil {
			handleErr(w, err)
			return
		}
		out = append(out, g)
	}
	writeJSON(w, 200, out)
}

func (s *Server) upsertOwnerProcessor(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	provider := r.PathValue("provider")
	if !validProvider(provider) {
		writeErr(w, 400, "Unknown payment provider.")
		return
	}
	var in gatewayInput
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request body.")
		return
	}
	if !validMode(in.Mode) {
		writeErr(w, 400, "Mode must be 'test' or 'live'.")
		return
	}
	g, err := s.upsertGatewayRow(r.Context(), gatewayScope{table: "saas_payment_methods"}, provider, in)
	if err != nil {
		handleErr(w, err)
		return
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "billing_processor_updated", "billing_processor", provider, nil,
		map[string]any{"provider": provider, "mode": in.Mode, "active": in.Active}, clientIP(r))
	writeJSON(w, 200, g)
}

func (s *Server) verifyOwnerProcessor(w http.ResponseWriter, r *http.Request) {
	provider := r.PathValue("provider")
	if !validProvider(provider) {
		writeErr(w, 400, "Unknown payment provider.")
		return
	}
	g, err := s.verifyGatewayRow(r.Context(), gatewayScope{table: "saas_payment_methods"}, provider)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, g)
}

func (s *Server) deleteOwnerProcessor(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	provider := r.PathValue("provider")
	if !validProvider(provider) {
		writeErr(w, 400, "Unknown payment provider.")
		return
	}
	if _, err := s.db.Exec(r.Context(), `DELETE FROM saas_payment_methods WHERE provider = $1`, provider); err != nil {
		handleErr(w, err)
		return
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "billing_processor_removed", "billing_processor", provider, nil,
		map[string]any{"provider": provider}, clientIP(r))
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ------------------------- shared upsert / verify ---------------------------

type gatewayScope struct {
	table     string // "shop_payment_gateways" or "saas_payment_methods"
	companyID string // "" for the SaaS-side table
}

// where returns the predicate that uniquely identifies this gateway row and the
// matching argument slice (always ending with the provider).
func (sc gatewayScope) where(provider string) (string, []any) {
	if sc.companyID != "" {
		return "company_id::text = $1 AND provider = $2", []any{sc.companyID, provider}
	}
	return "provider = $1", []any{provider}
}

// upsertGatewayRow handles both shop and SaaS scopes. If a secret or webhook
// secret comes in blank, the existing encrypted value is preserved so the shop
// owner can toggle `active` or rename the gateway without re-entering keys.
func (s *Server) upsertGatewayRow(ctx context.Context, sc gatewayScope, provider string, in gatewayInput) (gatewayDTO, error) {
	key, err := LoadDataKey(s.secret)
	if err != nil {
		return gatewayDTO{}, err
	}

	// Load existing row (if any) to preserve secrets the UI didn't resend.
	existing, existingSecret, existingWebhook, err := s.loadGatewayRow(ctx, sc, provider)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return gatewayDTO{}, err
	}
	hasRow := err == nil

	// Resolve the secret blob to persist.
	var secretBlob []byte
	secretLast4 := existing.SecretLast4
	if strings.TrimSpace(in.SecretKey) != "" {
		enc, err := Encrypt(key, []byte(in.SecretKey))
		if err != nil {
			return gatewayDTO{}, err
		}
		secretBlob = enc
		secretLast4 = Last4(in.SecretKey)
	} else {
		secretBlob = existingSecret
	}

	var webhookBlob []byte
	switch {
	case in.ClearWebhook:
		webhookBlob = nil
	case strings.TrimSpace(in.WebhookSecret) != "":
		enc, err := Encrypt(key, []byte(in.WebhookSecret))
		if err != nil {
			return gatewayDTO{}, err
		}
		webhookBlob = enc
	default:
		webhookBlob = existingWebhook
	}

	// Can't go active without a secret.
	if in.Active && len(secretBlob) == 0 {
		return gatewayDTO{}, ValidationError{"secretKey": "A secret key is required before this gateway can be made active."}
	}

	if hasRow {
		if sc.companyID != "" {
			_, err = s.db.Exec(ctx, `UPDATE shop_payment_gateways
				SET mode = $3, display_name = $4, publishable_key = $5, secret_last4 = $6,
				    encrypted_secret_key = $7, encrypted_webhook_secret = $8, active = $9,
				    verification_error = CASE WHEN $7 IS DISTINCT FROM encrypted_secret_key THEN '' ELSE verification_error END,
				    verified_at = CASE WHEN $7 IS DISTINCT FROM encrypted_secret_key THEN NULL ELSE verified_at END,
				    updated_at = now()
				WHERE company_id::text = $1 AND provider = $2`,
				sc.companyID, provider, in.Mode, in.DisplayName, in.PublishableKey, secretLast4,
				secretBlob, webhookBlob, in.Active)
		} else {
			_, err = s.db.Exec(ctx, `UPDATE saas_payment_methods
				SET mode = $2, display_name = $3, publishable_key = $4, secret_last4 = $5,
				    encrypted_secret_key = $6, encrypted_webhook_secret = $7, active = $8,
				    verification_error = CASE WHEN $6 IS DISTINCT FROM encrypted_secret_key THEN '' ELSE verification_error END,
				    verified_at = CASE WHEN $6 IS DISTINCT FROM encrypted_secret_key THEN NULL ELSE verified_at END,
				    updated_at = now()
				WHERE provider = $1`,
				provider, in.Mode, in.DisplayName, in.PublishableKey, secretLast4,
				secretBlob, webhookBlob, in.Active)
		}
	} else {
		if sc.companyID != "" {
			_, err = s.db.Exec(ctx, `INSERT INTO shop_payment_gateways
				(company_id, provider, mode, display_name, publishable_key, secret_last4, encrypted_secret_key, encrypted_webhook_secret, active)
				VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)`,
				sc.companyID, provider, in.Mode, in.DisplayName, in.PublishableKey, secretLast4,
				secretBlob, webhookBlob, in.Active)
		} else {
			_, err = s.db.Exec(ctx, `INSERT INTO saas_payment_methods
				(provider, mode, display_name, publishable_key, secret_last4, encrypted_secret_key, encrypted_webhook_secret, active)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
				provider, in.Mode, in.DisplayName, in.PublishableKey, secretLast4,
				secretBlob, webhookBlob, in.Active)
		}
	}
	if err != nil {
		return gatewayDTO{}, err
	}
	g, _, _, err := s.loadGatewayRow(ctx, sc, provider)
	return g, err
}

func (s *Server) loadGatewayRow(ctx context.Context, sc gatewayScope, provider string) (gatewayDTO, []byte, []byte, error) {
	where, args := sc.where(provider)
	table := sc.table
	return scanGateway(s.db.QueryRow(ctx, `SELECT `+gatewayCols+` FROM `+table+` WHERE `+where, args...))
}

// verifyGatewayRow calls the provider's API with the stored secret and records
// the result. We never trust an active=true flag without a round-trip.
func (s *Server) verifyGatewayRow(ctx context.Context, sc gatewayScope, provider string) (gatewayDTO, error) {
	key, err := LoadDataKey(s.secret)
	if err != nil {
		return gatewayDTO{}, err
	}
	g, secretBlob, _, err := s.loadGatewayRow(ctx, sc, provider)
	if err != nil {
		return gatewayDTO{}, err
	}
	if len(secretBlob) == 0 {
		return gatewayDTO{}, ValidationError{"secretKey": "Enter a secret key before verifying."}
	}
	secret, err := Decrypt(key, secretBlob)
	if err != nil {
		return gatewayDTO{}, err
	}
	verifyErr := VerifyProviderKey(ctx, provider, g.Mode, g.PublishableKey, secret)
	msg := ""
	if verifyErr != nil {
		msg = verifyErr.Error()
	}
	where, args := sc.where(provider)
	table := sc.table
	// $N placeholders depend on how many args sc.where() returned.
	n := len(args)
	sql := fmt.Sprintf(`UPDATE %s SET verified_at = CASE WHEN $%d = '' THEN now() ELSE NULL END,
	    verification_error = $%d, updated_at = now() WHERE %s`, table, n+1, n+1, where)
	args = append(args, msg)
	if _, err := s.db.Exec(ctx, sql, args...); err != nil {
		return gatewayDTO{}, err
	}
	g, _, _, err = s.loadGatewayRow(ctx, sc, provider)
	return g, err
}

// VerifyProviderKey hits the provider's lightest-weight read endpoint to confirm
// the credentials actually work in the chosen mode. Stripe → GET /v1/balance;
// Authorize.Net → authenticateTest. Short timeout; errors come back as user-safe
// messages, not raw SDK output.
func VerifyProviderKey(ctx context.Context, provider, mode, publishable, secret string) error {
	client := &http.Client{Timeout: 10 * time.Second}
	switch provider {
	case "stripe":
		req, _ := http.NewRequestWithContext(ctx, "GET", "https://api.stripe.com/v1/balance", nil)
		req.SetBasicAuth(secret, "")
		res, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("could not reach Stripe: %w", err)
		}
		defer res.Body.Close()
		body, _ := io.ReadAll(io.LimitReader(res.Body, 2048))
		if res.StatusCode == 200 {
			if (strings.HasPrefix(secret, "sk_live_") && mode != "live") || (strings.HasPrefix(secret, "sk_test_") && mode != "test") {
				return errors.New("Secret key mode does not match the selected mode (live vs test).")
			}
			return nil
		}
		if res.StatusCode == 401 {
			return errors.New("Stripe rejected this secret key.")
		}
		return fmt.Errorf("Stripe returned %d: %s", res.StatusCode, snippet(body))
	case "authnet":
		host := "https://apitest.authorize.net/xml/v1/request.api"
		if mode == "live" {
			host = "https://api.authorize.net/xml/v1/request.api"
		}
		payload := map[string]any{
			"authenticateTestRequest": map[string]any{
				"merchantAuthentication": map[string]any{"name": publishable, "transactionKey": secret},
			},
		}
		buf, _ := json.Marshal(payload)
		req, _ := http.NewRequestWithContext(ctx, "POST", host, strings.NewReader(string(buf)))
		req.Header.Set("Content-Type", "application/json")
		res, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("could not reach Authorize.Net: %w", err)
		}
		defer res.Body.Close()
		body, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		// Authorize.Net quirk: UTF-8 BOM at start of body breaks json.Unmarshal.
		body = []byte(strings.TrimPrefix(string(body), "\xef\xbb\xbf"))
		var parsed struct {
			Messages struct {
				ResultCode string `json:"resultCode"`
				Message    []struct {
					Code string `json:"code"`
					Text string `json:"text"`
				} `json:"message"`
			} `json:"messages"`
		}
		_ = json.Unmarshal(body, &parsed)
		if parsed.Messages.ResultCode == "Ok" {
			return nil
		}
		if len(parsed.Messages.Message) > 0 {
			return fmt.Errorf("Authorize.Net: %s", parsed.Messages.Message[0].Text)
		}
		return fmt.Errorf("Authorize.Net returned %d: %s", res.StatusCode, snippet(body))
	}
	return errors.New("unknown provider")
}

func snippet(b []byte) string {
	s := strings.TrimSpace(string(b))
	if len(s) > 180 {
		return s[:180] + "…"
	}
	return s
}

// Used by later sessions (charge flow) to look up an active gateway without
// re-implementing the scope dance; exported to avoid package tangling.
func (s *Server) ActiveShopGatewaySecret(ctx context.Context, companyID, provider string) (string, string, error) {
	key, err := LoadDataKey(s.secret)
	if err != nil {
		return "", "", err
	}
	var publishable string
	var blob []byte
	err = s.db.QueryRow(ctx, `SELECT publishable_key, encrypted_secret_key FROM shop_payment_gateways
		WHERE company_id::text = $1 AND provider = $2 AND active`, companyID, provider).Scan(&publishable, &blob)
	if err != nil {
		return "", "", err
	}
	secret, err := Decrypt(key, blob)
	return publishable, secret, err
}

// urlEncode kept for a future Session 2 Stripe form POST; silences unused in a
// zero-dependency Session 1 build without pulling net/url only for future code.
var _ = url.PathEscape

// auditGateway writes a settings_audit_log row outside any transaction. We
// don't use the shared audit() helper because the gateway write isn't in a tx;
// a failed audit must not roll back the key update.
func (s *Server) auditGateway(ctx context.Context, u User, cid, provider, action, mode string, active bool) error {
	newVal := fmt.Sprintf("provider=%s mode=%s active=%t", provider, mode, active)
	if action == "removed" {
		newVal = "provider=" + provider
	}
	var cidArg any
	if cid != "" {
		cidArg = cid
	}
	_, err := s.db.Exec(ctx, `INSERT INTO settings_audit_log (company_id, user_name, user_role, entity, entity_id, action, field, old_value, new_value)
		VALUES ($1::uuid, $2, $3, 'payment_gateway', $4, $5, 'config', NULL, $6)`,
		cidArg, u.Name, u.Role, provider, action, newVal)
	return err
}
