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
	mux.HandleFunc("GET /api/me/billing",             s.auth("settings.view", s.getMyBilling))
	mux.HandleFunc("POST /api/me/billing/portal",     s.auth("shop.edit",     s.openStripePortal))
	mux.HandleFunc("POST /api/me/billing/setup",      s.auth("shop.edit",     s.setupBilling))
	mux.HandleFunc("POST /api/me/billing/setup/sync/{session}", s.auth("shop.edit", s.setupBillingSync))
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

// setupBilling creates a Stripe Checkout session (subscription mode) for a
// shop that was activated manually and has no stripe_customer_id yet.
// Lets the shop manager attach their card without the SaaS owner having to
// touch Stripe. On completion the session's customer + subscription ids are
// written to subscriptions and the Billing Portal link becomes available
// for all the usual self-service actions (plan change, cancel, auto-pay,
// invoice history, update bank).
type setupBillingReq struct {
	Plan         string `json:"plan"`         // optional override — defaults to current plan
	BillingCycle string `json:"billingCycle"` // optional override — defaults to current cycle
}

func (s *Server) setupBilling(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	u := userFrom(r.Context())
	var in setupBillingReq
	_ = readJSON(r, &in)

	var subID, curPlan, curCycle, stripeCust string
	_ = s.db.QueryRow(r.Context(), `SELECT id::text, plan, billing_cycle, coalesce(stripe_customer_id,'')
		FROM subscriptions WHERE company_id::text = $1`, cid).Scan(&subID, &curPlan, &curCycle, &stripeCust)
	if subID == "" {
		writeErr(w, 404, "No subscription on file.")
		return
	}
	if stripeCust != "" {
		writeErr(w, 409, "This shop already has a Stripe profile — use Open billing portal instead.")
		return
	}

	plan := strings.ToLower(strings.TrimSpace(in.Plan))
	if plan == "" {
		plan = curPlan
	}
	cycle := strings.ToLower(strings.TrimSpace(in.BillingCycle))
	if cycle == "" {
		cycle = curCycle
	}
	if cycle == "" {
		cycle = "monthly"
	}
	planDef, ok := signupPlans[plan]
	if !ok {
		writeErr(w, 400, "Unknown plan.")
		return
	}

	secret, ok := s.platformStripeSecret(r.Context())
	if !ok {
		writeErr(w, 503, "Platform payment account not configured.")
		return
	}
	priceID, pErr := signupStripePriceFor(r.Context(), s, secret, planDef, cycle)
	if pErr != nil {
		writeErr(w, 502, "Could not reach Stripe: "+pErr.Error())
		return
	}

	origin := publicOrigin(r)
	sessURL, _, cErr := stripeCreateSubscriptionCheckoutV2(r.Context(), secret, stripeSubscriptionCheckoutInput{
		PriceID:   priceID,
		TrialDays: 0, // no trial on billing-setup — this is a paying shop filling in missing Stripe details
		Email:     u.Email,
		SuccessURL: origin + "/settings/general/billing?setup=success&session={CHECKOUT_SESSION_ID}",
		CancelURL:  origin + "/settings/general/billing?setup=cancel",
		Metadata: map[string]string{
			"torquedesk_signup":        "true", // reuse signup activation path
			"torquedesk_company_id":    cid,
			"torquedesk_subscription":  subID,
			"torquedesk_plan":          plan,
			"torquedesk_billing_cycle": cycle,
		},
	})
	if cErr != nil {
		writeErr(w, 502, "Could not start checkout: "+cErr.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"url": sessURL})
}

// setupBillingSync is the browser self-heal after the Stripe return — same
// shape as the signup sync but constrained to the signed-in company so a
// malicious user can't attach their session to someone else's row.
func (s *Server) setupBillingSync(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	sess := r.PathValue("session")
	secret, ok := s.platformStripeSecret(r.Context())
	if !ok {
		writeErr(w, 503, "Platform payment account not configured.")
		return
	}
	resp, cErr := stripeForm(r.Context(), secret, "GET", "https://api.stripe.com/v1/checkout/sessions/"+sess+"?expand[]=subscription", nil)
	if cErr != nil {
		writeErr(w, 502, cErr.Error())
		return
	}
	var dto struct {
		Status   string `json:"status"`
		Metadata struct {
			CompanyID    string `json:"torquedesk_company_id"`
			Subscription string `json:"torquedesk_subscription"`
			Plan         string `json:"torquedesk_plan"`
			BillingCycle string `json:"torquedesk_billing_cycle"`
		} `json:"metadata"`
		SubscriptionID any `json:"subscription"`
		CustomerID     any `json:"customer"`
	}
	if err := json.Unmarshal(resp, &dto); err != nil {
		writeErr(w, 502, "Could not parse Stripe response.")
		return
	}
	// Tenant scope: the session's metadata must point at the signed-in company.
	if dto.Metadata.CompanyID != cid {
		writeErr(w, 403, "This Checkout session doesn't belong to this shop.")
		return
	}
	if dto.Status != "complete" {
		writeJSON(w, 200, map[string]any{"ok": true, "ready": false, "status": dto.Status})
		return
	}
	stripeSubID := ""
	switch v := dto.SubscriptionID.(type) {
	case string:
		stripeSubID = v
	case map[string]any:
		if id, ok := v["id"].(string); ok {
			stripeSubID = id
		}
	}
	stripeCustID := ""
	switch v := dto.CustomerID.(type) {
	case string:
		stripeCustID = v
	case map[string]any:
		if id, ok := v["id"].(string); ok {
			stripeCustID = id
		}
	}
	if err := s.activateSignupV2(r.Context(), cid, dto.Metadata.Subscription,
		dto.Metadata.Plan, dto.Metadata.BillingCycle, stripeSubID, stripeCustID); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "ready": true})
}

// Guard: errors import kept for callers that may still reference it.
var _ = errors.New

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
