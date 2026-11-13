package api

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
)

// ----------------------------------------------------------------------------
// Owner Admin: switch a shop's Stripe subscription to auto-invoice with
// net-14 payment terms (Stripe emails the shop an invoice each billing cycle;
// shop has 14 days to pay before it goes past_due, giving them a visible,
// shareable invoice for accounting instead of a silent card charge).
//
// POST /api/owner/subscriptions/{id}/net14
//   body: { "mode": "net14" | "auto_charge" }
// ----------------------------------------------------------------------------

func (s *Server) registerNet14Route(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/owner/subscriptions/{id}/net14", s.ownerAuth(s.setSubscriptionNet14))
}

type net14Req struct {
	Mode string `json:"mode"` // "net14" (default) | "auto_charge"
}

func (s *Server) setSubscriptionNet14(w http.ResponseWriter, r *http.Request) {
	subRowID := r.PathValue("id")
	var in net14Req
	_ = readJSON(r, &in)
	mode := strings.ToLower(strings.TrimSpace(in.Mode))
	if mode == "" {
		mode = "net14"
	}
	if mode != "net14" && mode != "auto_charge" {
		writeErr(w, 400, "mode must be 'net14' or 'auto_charge'.")
		return
	}

	// Look up the Stripe subscription id for this row.
	var stripeSubID, companyID string
	err := s.db.QueryRow(r.Context(),
		`SELECT coalesce(stripe_subscription_id,''), company_id::text
		   FROM subscriptions WHERE id::text = $1`, subRowID).Scan(&stripeSubID, &companyID)
	if err != nil {
		writeErr(w, 404, "Subscription not found.")
		return
	}
	if stripeSubID == "" {
		writeErr(w, 409, "This shop has no active Stripe subscription yet. Ask them to set up billing first.")
		return
	}

	secret, ok := s.platformStripeSecret(r.Context())
	if !ok {
		writeErr(w, 503, "Platform Stripe account not configured.")
		return
	}

	// Switch collection_method and days_until_due on the Stripe sub.
	form := url.Values{}
	if mode == "net14" {
		form.Set("collection_method", "send_invoice")
		form.Set("days_until_due", "14")
	} else {
		form.Set("collection_method", "charge_automatically")
		// days_until_due is cleared by Stripe when switching to charge_automatically.
	}

	resp, err := stripeForm(r.Context(), secret, "POST",
		"https://api.stripe.com/v1/subscriptions/"+url.PathEscape(stripeSubID), form)
	if err != nil {
		writeErr(w, 502, "Stripe update failed: "+err.Error())
		return
	}
	var out struct {
		ID               string `json:"id"`
		CollectionMethod string `json:"collection_method"`
		DaysUntilDue     int    `json:"days_until_due"`
	}
	_ = json.Unmarshal(resp, &out)

	// Mirror on our row so the UI can read it without round-tripping Stripe.
	_, _ = s.db.Exec(r.Context(), `
		UPDATE subscriptions
		   SET notes = coalesce(notes,'') || E'\nSet to ' || $2 || ' via Owner Admin',
		       updated_at = now()
		 WHERE id::text = $1`, subRowID, mode)

	writeJSON(w, 200, map[string]any{
		"ok":                 true,
		"mode":               mode,
		"stripe_sub_id":      out.ID,
		"collection_method":  out.CollectionMethod,
		"days_until_due":     out.DaysUntilDue,
		"message": map[string]string{
			"net14":       "Switched to send_invoice with 14-day terms. Stripe will email the shop a hosted invoice each billing cycle.",
			"auto_charge": "Switched to charge_automatically. Stripe will attempt the saved payment method on each cycle.",
		}[mode],
	})
}
