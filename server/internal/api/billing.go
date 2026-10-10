package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ----------------------------------------------------------------------------
// Shop-side billing self-service — Phase C.
//
// Lets a shop owner / manager see their current plan + status and open
// Stripe's hosted Customer Portal to change plan, update card, download
// invoices, and cancel. We don't rebuild the portal; Stripe does that part
// better than we would.
// ----------------------------------------------------------------------------

func (s *Server) billingRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/me/billing",         s.auth("settings.view", s.getMyBilling))
	mux.HandleFunc("POST /api/me/billing/portal", s.auth("shop.edit",     s.openStripePortal))
}

type myBillingDTO struct {
	Plan             string  `json:"plan"`
	Status           string  `json:"status"`
	BillingCycle     string  `json:"billingCycle"`
	MonthlyPrice     float64 `json:"monthlyPrice"`
	AnnualPrice      float64 `json:"annualPrice"`
	StartDate        string  `json:"startDate,omitempty"`
	EndDate          string  `json:"endDate,omitempty"`
	TrialEnd         string  `json:"trialEnd,omitempty"`
	AutoRenewal      bool    `json:"autoRenewal"`
	PaymentStatus    string  `json:"paymentStatus"`
	HasStripeCustomer bool   `json:"hasStripeCustomer"`
}

func (s *Server) getMyBilling(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	var dto myBillingDTO
	var monthly, annual, stripeCust string
	var startD, endD, trialD *time.Time
	err := s.db.QueryRow(r.Context(), `SELECT
		plan, status, billing_cycle, monthly_price::text, annual_price::text,
		start_date, end_date, trial_end, auto_renewal, payment_status,
		coalesce(stripe_customer_id, '')
		FROM subscriptions WHERE company_id::text = $1`, cid).
		Scan(&dto.Plan, &dto.Status, &dto.BillingCycle, &monthly, &annual,
			&startD, &endD, &trialD, &dto.AutoRenewal, &dto.PaymentStatus, &stripeCust)
	if err != nil {
		writeErr(w, 404, "No subscription found for this shop.")
		return
	}
	dto.MonthlyPrice = parseFloat(monthly)
	dto.AnnualPrice = parseFloat(annual)
	if startD != nil {
		dto.StartDate = startD.Format("2006-01-02")
	}
	if endD != nil {
		dto.EndDate = endD.Format("2006-01-02")
	}
	if trialD != nil {
		dto.TrialEnd = trialD.Format("2006-01-02")
	}
	dto.HasStripeCustomer = stripeCust != ""
	writeJSON(w, 200, dto)
}

// openStripePortal creates a short-lived Stripe Customer Portal session so
// the shop can manage their subscription without us rebuilding Stripe's UI.
// The portal handles: payment method updates, invoice downloads, plan
// changes (if enabled in your Stripe portal config), cancellation.
func (s *Server) openStripePortal(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	var stripeCust string
	_ = s.db.QueryRow(r.Context(),
		`SELECT coalesce(stripe_customer_id,'') FROM subscriptions WHERE company_id::text = $1`, cid).Scan(&stripeCust)
	if stripeCust == "" {
		writeErr(w, 409, "This subscription doesn't have a Stripe customer yet. Contact support — this usually means the shop was activated manually without a Stripe signup.")
		return
	}
	secret, ok := s.platformStripeSecret(r.Context())
	if !ok {
		writeErr(w, 503, "Platform payment account not configured.")
		return
	}
	form := url.Values{}
	form.Set("customer", stripeCust)
	form.Set("return_url", publicOrigin(r)+"/settings/general/billing")
	resp, err := stripeForm(r.Context(), secret, "POST", "https://api.stripe.com/v1/billing_portal/sessions", form)
	if err != nil {
		writeErr(w, 502, "Could not open the Stripe portal: "+err.Error())
		return
	}
	var out struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(resp, &out); err != nil || out.URL == "" {
		writeErr(w, 502, "Stripe did not return a portal URL.")
		return
	}
	writeJSON(w, 200, map[string]any{"url": out.URL})
}

// parseFloat is a tiny helper that mirrors the Phase A plans.go format
// (numeric → text in the DB, parse back to float64 in the response).
func parseFloat(s string) float64 {
	var f float64
	_ = jsonUnmarshalFloat(s, &f)
	return f
}

func jsonUnmarshalFloat(s string, f *float64) error {
	s = strings.TrimSpace(s)
	if s == "" {
		return errors.New("empty")
	}
	return json.Unmarshal([]byte(s), f)
}
