package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// ----------------------------------------------------------------------------
// Shop self-service: upgrade / downgrade the base subscription plan.
//
// POST /api/me/billing/change-plan  { plan_key, billing_cycle }
//
// Looks up the shop's active Stripe subscription, swaps its item price to the
// requested plan+cycle, and asks Stripe to prorate immediately. If the shop
// hasn't got an active Stripe subscription yet (still on trial without a
// saved card), falls back to the normal setup checkout.
// ----------------------------------------------------------------------------

func (s *Server) registerChangePlanRoute(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/me/billing/change-plan", s.auth("shop.edit", s.changeMyPlan))
}

type changePlanReq struct {
	PlanKey      string `json:"plan_key"`
	BillingCycle string `json:"billing_cycle"` // monthly | annual
}

func (s *Server) changeMyPlan(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	var in changePlanReq
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request body.")
		return
	}
	in.PlanKey = strings.ToLower(strings.TrimSpace(in.PlanKey))
	in.BillingCycle = strings.ToLower(strings.TrimSpace(in.BillingCycle))
	if in.PlanKey == "" {
		writeErr(w, 400, "plan_key is required.")
		return
	}
	if in.BillingCycle != "monthly" && in.BillingCycle != "annual" {
		in.BillingCycle = "monthly"
	}

	// Look up the chosen plan.
	plan, err := loadSignupPlanByKey(r.Context(), s, in.PlanKey)
	if err != nil {
		writeErr(w, 404, "Plan not available.")
		return
	}
	amount := plan.MonthlyPrice
	if in.BillingCycle == "annual" {
		amount = plan.AnnualPrice
	}

	// Current subscription state.
	var currentPlan, currentCycle, stripeSubID, stripeCustID, status string
	err = s.db.QueryRow(r.Context(), `
		SELECT plan, billing_cycle,
		       coalesce(stripe_subscription_id,''),
		       coalesce(stripe_customer_id,''),
		       status
		  FROM subscriptions
		 WHERE company_id::text = $1`, cid).
		Scan(&currentPlan, &currentCycle, &stripeSubID, &stripeCustID, &status)
	if err != nil {
		writeErr(w, 404, "No subscription found for this shop.")
		return
	}
	if currentPlan == in.PlanKey && currentCycle == in.BillingCycle {
		writeErr(w, 409, "You're already on this plan.")
		return
	}

	secret, ok := s.platformStripeSecret(r.Context())
	if !ok {
		writeErr(w, 503, "The Fixora platform payment account is not configured yet.")
		return
	}

	// Get or lazy-create the Stripe price for this plan+cycle.
	priceID, err := signupStripePriceFor(r.Context(), s, secret, plan, in.BillingCycle)
	if err != nil {
		writeErr(w, 502, "Could not reach Stripe: "+err.Error())
		return
	}

	// If no live Stripe subscription (shop is on trial without a card),
	// fall back to the normal setup flow so they add a card first.
	if stripeSubID == "" {
		writeJSON(w, 200, map[string]any{
			"needs_payment_method": true,
			"message":              "Please add a payment method before changing plans.",
		})
		return
	}

	// Fetch the current subscription item to grab its item id (needed to
	// update price in-place; otherwise Stripe adds a new item).
	itemID, err := stripeFirstSubscriptionItemID(r.Context(), secret, stripeSubID)
	if err != nil {
		writeErr(w, 502, "Could not read current subscription: "+err.Error())
		return
	}

	// Swap the price — Stripe prorates immediately by default.
	if err := stripeUpdateSubscriptionPrice(r.Context(), secret, stripeSubID, itemID, priceID); err != nil {
		writeErr(w, 502, "Could not update subscription: "+err.Error())
		return
	}

	// Reflect new plan locally so UI updates without waiting for webhook.
	_, _ = s.db.Exec(r.Context(), `
		UPDATE subscriptions
		   SET plan = $2, billing_cycle = $3,
		       monthly_price = $4, annual_price = $5,
		       updated_at = now()
		 WHERE company_id::text = $1`,
		cid, in.PlanKey, in.BillingCycle, plan.MonthlyPrice, plan.AnnualPrice)

	_ = amount // reserved for future (returning charged amount)
	writeJSON(w, 200, map[string]any{
		"ok":            true,
		"plan":          in.PlanKey,
		"billing_cycle": in.BillingCycle,
		"message":       "Plan updated. Stripe will prorate the difference on your next invoice.",
	})
}

// loadSignupPlanByKey fetches a plan row and returns the shared signupPlan
// struct used by the signup helpers.
func loadSignupPlanByKey(ctx context.Context, s *Server, key string) (signupPlan, error) {
	var p signupPlan
	var monthly, annual string
	err := s.db.QueryRow(ctx, `
		SELECT key, name, monthly_price::text, annual_price::text, trial_days
		  FROM signup_plans
		 WHERE key = $1 AND published`, key).
		Scan(&p.Key, &p.Name, &monthly, &annual, &p.TrialDays)
	if err != nil {
		return p, err
	}
	p.MonthlyPrice = parseFloat(monthly)
	p.AnnualPrice = parseFloat(annual)
	return p, nil
}

// ---- Stripe helpers for subscription changes --------------------------------

func stripeFirstSubscriptionItemID(ctx context.Context, secret, subID string) (string, error) {
	resp, err := stripeForm(ctx, secret, "GET", "https://api.stripe.com/v1/subscriptions/"+url.PathEscape(subID), nil)
	if err != nil {
		return "", err
	}
	var out struct {
		Items struct {
			Data []struct {
				ID string `json:"id"`
			} `json:"data"`
		} `json:"items"`
	}
	if err := json.Unmarshal(resp, &out); err != nil || len(out.Items.Data) == 0 {
		return "", fmt.Errorf("subscription has no items: %s", snippet(resp))
	}
	return out.Items.Data[0].ID, nil
}

func stripeUpdateSubscriptionPrice(ctx context.Context, secret, subID, itemID, newPriceID string) error {
	form := url.Values{}
	form.Set("items[0][id]", itemID)
	form.Set("items[0][price]", newPriceID)
	form.Set("proration_behavior", "always_invoice") // charge diff immediately
	form.Set("payment_behavior", "allow_incomplete")
	_, err := stripeForm(ctx, secret, "POST", "https://api.stripe.com/v1/subscriptions/"+url.PathEscape(subID), form)
	return err
}

// stripeCreateSubscriptionOnCustomer creates a subscription directly against
// a customer who already has a default payment method on file. Used by
// subscribeAddon when the shop has previously set up billing — no need to
// re-enter the card through Checkout.
func stripeCreateSubscriptionOnCustomer(ctx context.Context, secret string, in stripeDirectSubInput) (string, error) {
	form := url.Values{}
	form.Set("customer", in.CustomerID)
	form.Set("items[0][price]", in.PriceID)
	if in.TrialDays > 0 {
		form.Set("trial_period_days", fmt.Sprintf("%d", in.TrialDays))
	}
	form.Set("payment_behavior", "default_incomplete")
	for k, v := range in.Metadata {
		form.Set("metadata["+k+"]", v)
	}
	resp, err := stripeForm(ctx, secret, "POST", "https://api.stripe.com/v1/subscriptions", form)
	if err != nil {
		return "", err
	}
	var out struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(resp, &out); err != nil || out.ID == "" {
		return "", fmt.Errorf("stripe did not return subscription id: %s", snippet(resp))
	}
	return out.ID, nil
}

type stripeDirectSubInput struct {
	CustomerID string
	PriceID    string
	TrialDays  int
	Metadata   map[string]string
}

// stripeCustomerHasDefaultPM returns true if the Stripe customer has a
// default payment method we can charge without re-prompting.
func stripeCustomerHasDefaultPM(ctx context.Context, secret, customerID string) bool {
	resp, err := stripeForm(ctx, secret, "GET", "https://api.stripe.com/v1/customers/"+url.PathEscape(customerID), nil)
	if err != nil {
		return false
	}
	var out struct {
		InvoiceSettings struct {
			DefaultPaymentMethod any `json:"default_payment_method"`
		} `json:"invoice_settings"`
		DefaultSource any `json:"default_source"`
	}
	if err := json.Unmarshal(resp, &out); err != nil {
		return false
	}
	if s, ok := out.InvoiceSettings.DefaultPaymentMethod.(string); ok && s != "" {
		return true
	}
	if s, ok := out.DefaultSource.(string); ok && s != "" {
		return true
	}
	return false
}
