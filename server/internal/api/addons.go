package api

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ----------------------------------------------------------------------------
// Add-on marketplace.
//
// Owner-side: CRUD the addon_catalog (name, price, trial, feature_key).
// Shop-side:  list catalog, subscribe → Stripe Checkout (subscription mode)
//             with 7-day trial, money goes to the SaaS owner's Stripe
//             account via saas_payment_methods. On successful subscription
//             the feature flag flips on. On cancel/expiry it flips off.
// ----------------------------------------------------------------------------

func (s *Server) addonRoutes(mux *http.ServeMux) {
	// Owner
	mux.HandleFunc("GET /api/owner/addons", s.ownerAuth(s.listAddonCatalog))
	mux.HandleFunc("POST /api/owner/addons", s.ownerAuth(s.createAddon))
	mux.HandleFunc("PATCH /api/owner/addons/{id}", s.ownerAuth(s.updateAddon))
	mux.HandleFunc("DELETE /api/owner/addons/{id}", s.ownerAuth(s.deleteAddon))
	// Shop
	mux.HandleFunc("GET /api/addons", s.auth("", s.listShopAddons))
	mux.HandleFunc("POST /api/addons/{featureKey}/subscribe", s.auth("shop.edit", s.subscribeAddon))
	mux.HandleFunc("POST /api/addons/{featureKey}/cancel", s.auth("shop.edit", s.cancelAddon))
	// Platform Stripe webhook (addon subscription events)
	mux.HandleFunc("POST /api/platform-webhooks/stripe", s.platformStripeWebhook)
}

type addonDTO struct {
	ID              string  `json:"id"`
	FeatureKey      string  `json:"featureKey"`
	Name            string  `json:"name"`
	Description     string  `json:"description"`
	MonthlyPrice    string  `json:"monthlyPrice"`
	Currency        string  `json:"currency"`
	TrialDays       int     `json:"trialDays"`
	StripePriceID   string  `json:"stripePriceId"`
	Published       bool    `json:"published"`
	UpdatedAt       int64   `json:"updatedAt"`
}

func (s *Server) scanAddonRow(row pgx.Row) (addonDTO, error) {
	var a addonDTO
	var price string
	var updated time.Time
	err := row.Scan(&a.ID, &a.FeatureKey, &a.Name, &a.Description, &price, &a.Currency, &a.TrialDays, &a.StripePriceID, &a.Published, &updated)
	a.MonthlyPrice = price
	a.UpdatedAt = updated.UnixMilli()
	return a, err
}

const addonCols = `id::text, feature_key, name, description, monthly_price::text, currency, trial_days, stripe_price_id, published, updated_at`

func (s *Server) listAddonCatalog(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT `+addonCols+` FROM addon_catalog ORDER BY created_at`)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	out := []addonDTO{}
	for rows.Next() {
		a, err := s.scanAddonRow(rows)
		if err != nil {
			continue
		}
		out = append(out, a)
	}
	writeJSON(w, 200, out)
}

type addonInput struct {
	FeatureKey   string      `json:"featureKey"`
	Name         string      `json:"name"`
	Description  string      `json:"description"`
	MonthlyPrice json.Number `json:"monthlyPrice"`
	Currency     string      `json:"currency"`
	TrialDays    int         `json:"trialDays"`
	Published    bool        `json:"published"`
}

func (s *Server) createAddon(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var in addonInput
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	in.FeatureKey = strings.TrimSpace(in.FeatureKey)
	in.Name = strings.TrimSpace(in.Name)
	if in.FeatureKey == "" || in.Name == "" {
		writeErr(w, 400, "Feature key and name are required.")
		return
	}
	price, err := strconv.ParseFloat(in.MonthlyPrice.String(), 64)
	if err != nil || price <= 0 {
		writeErr(w, 400, "Monthly price must be greater than 0.")
		return
	}
	cur := strings.ToUpper(strings.TrimSpace(in.Currency))
	if cur == "" {
		cur = "USD"
	}
	trial := in.TrialDays
	if trial < 0 {
		trial = 0
	}
	if trial > 90 {
		trial = 90
	}
	// Create matching Stripe Product + Price up front so the subscribe flow
	// can use them without a round-trip. If platform Stripe isn't configured
	// yet, store the row with empty IDs — we'll create them lazily on first
	// subscribe.
	productID, priceID := "", ""
	if secret, ok := s.platformStripeSecret(r.Context()); ok {
		productID, priceID, err = stripeCreateProductAndPrice(r.Context(), secret, in.Name, in.Description, price, strings.ToLower(cur))
		if err != nil {
			log.Printf("addon create: stripe product/price failed: %v", err)
		}
	}
	var id string
	err = s.db.QueryRow(r.Context(), `INSERT INTO addon_catalog
		(feature_key, name, description, monthly_price, currency, trial_days,
		 stripe_product_id, stripe_price_id, published)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id::text`,
		in.FeatureKey, in.Name, in.Description, price, cur, trial, productID, priceID, in.Published).Scan(&id)
	if err != nil {
		handleErr(w, err)
		return
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "addon_created", "addon", id, nil,
		map[string]any{"featureKey": in.FeatureKey, "price": price, "currency": cur}, clientIP(r))
	s.listAddonCatalog(w, r)
}

func (s *Server) updateAddon(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	u := userFrom(r.Context())
	var p struct {
		Name         *string      `json:"name"`
		Description  *string      `json:"description"`
		MonthlyPrice *json.Number `json:"monthlyPrice"`
		TrialDays    *int         `json:"trialDays"`
		Published    *bool        `json:"published"`
	}
	if err := readJSON(r, &p); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	sets, args := []string{"updated_at = now()"}, []any{}
	add := func(c string, v any) { args = append(args, v); sets = append(sets, fmt.Sprintf("%s = $%d", c, len(args))) }
	if p.Name != nil {
		add("name", strings.TrimSpace(*p.Name))
	}
	if p.Description != nil {
		add("description", *p.Description)
	}
	if p.MonthlyPrice != nil {
		x, _ := strconv.ParseFloat(p.MonthlyPrice.String(), 64)
		if x <= 0 {
			writeErr(w, 400, "Monthly price must be greater than 0.")
			return
		}
		add("monthly_price", x)
	}
	if p.TrialDays != nil {
		t := *p.TrialDays
		if t < 0 {
			t = 0
		}
		if t > 90 {
			t = 90
		}
		add("trial_days", t)
	}
	if p.Published != nil {
		add("published", *p.Published)
	}
	if len(sets) == 1 {
		writeErr(w, 400, "Nothing to update.")
		return
	}
	args = append(args, id)
	if _, err := s.db.Exec(r.Context(), fmt.Sprintf("UPDATE addon_catalog SET %s WHERE id::text = $%d", strings.Join(sets, ", "), len(args)), args...); err != nil {
		handleErr(w, err)
		return
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "addon_updated", "addon", id, nil, nil, clientIP(r))
	s.listAddonCatalog(w, r)
}

func (s *Server) deleteAddon(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	u := userFrom(r.Context())
	// Refuse delete if any shop has an active subscription.
	var count int
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM shop_addon_subscriptions
		WHERE addon_id::text = $1 AND status IN ('trialing','active','past_due')`, id).Scan(&count)
	if count > 0 {
		writeErr(w, 409, fmt.Sprintf("%d shop(s) still subscribed. Cancel their subscriptions first.", count))
		return
	}
	if _, err := s.db.Exec(r.Context(), `DELETE FROM addon_catalog WHERE id::text = $1`, id); err != nil {
		handleErr(w, err)
		return
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "addon_deleted", "addon", id, nil, nil, clientIP(r))
	s.listAddonCatalog(w, r)
}

// listShopAddons returns the published catalog + this shop's active
// subscriptions for each addon.
func (s *Server) listShopAddons(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	rows, err := s.db.Query(r.Context(), `SELECT `+addonCols+` FROM addon_catalog WHERE published = true ORDER BY monthly_price`)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	catalog := []addonDTO{}
	for rows.Next() {
		a, err := s.scanAddonRow(rows)
		if err != nil {
			continue
		}
		catalog = append(catalog, a)
	}
	subRows, _ := s.db.Query(r.Context(), `SELECT feature_key, status, cancel_at_period_end,
		coalesce(to_char(current_period_end, 'YYYY-MM-DD"T"HH24:MI:SSZ'), ''),
		coalesce(to_char(trial_end,          'YYYY-MM-DD"T"HH24:MI:SSZ'), '')
		FROM shop_addon_subscriptions WHERE company_id::text = $1
		  AND status IN ('pending','trialing','active','past_due')`, cid)
	subs := map[string]map[string]any{}
	for subRows.Next() {
		var fk, st, cpe, tre string
		var cancel bool
		if err := subRows.Scan(&fk, &st, &cancel, &cpe, &tre); err == nil {
			subs[fk] = map[string]any{"status": st, "cancelAtPeriodEnd": cancel, "currentPeriodEnd": cpe, "trialEnd": tre}
		}
	}
	subRows.Close()
	writeJSON(w, 200, map[string]any{"catalog": catalog, "subscriptions": subs})
}

// subscribeAddon creates a Stripe Checkout session in subscription mode with
// a trial period and returns the checkout URL for the shop to redirect to.
func (s *Server) subscribeAddon(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	u := userFrom(r.Context())
	key := r.PathValue("featureKey")
	// Load addon.
	var addonID, name, desc, stripePrice, currency string
	var monthly float64
	var trial int
	var published bool
	err := s.db.QueryRow(r.Context(), `SELECT id::text, name, description, monthly_price::float, currency, trial_days, stripe_price_id, published
		FROM addon_catalog WHERE feature_key = $1`, key).Scan(&addonID, &name, &desc, &monthly, &currency, &trial, &stripePrice, &published)
	if err != nil {
		writeErr(w, 404, "This add-on is not available.")
		return
	}
	if !published {
		writeErr(w, 403, "This add-on is not available.")
		return
	}
	// Guard: already subscribed?
	var already bool
	_ = s.db.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM shop_addon_subscriptions
		WHERE company_id::text = $1 AND feature_key = $2
		  AND status IN ('pending','trialing','active','past_due'))`, cid, key).Scan(&already)
	if already {
		writeErr(w, 409, "You already have an active subscription for this add-on.")
		return
	}
	// Load platform Stripe secret.
	secret, ok := s.platformStripeSecret(r.Context())
	if !ok {
		writeErr(w, 503, "The TorqueDesk platform payment account is not configured yet. Please contact support.")
		return
	}
	// Lazy-create Stripe product + price if the owner skipped it on insert.
	if stripePrice == "" {
		productID, priceID, cErr := stripeCreateProductAndPrice(r.Context(), secret, name, desc, monthly, strings.ToLower(currency))
		if cErr != nil {
			writeErr(w, 502, "Could not reach Stripe: "+cErr.Error())
			return
		}
		stripePrice = priceID
		_, _ = s.db.Exec(r.Context(), `UPDATE addon_catalog SET stripe_product_id = $1, stripe_price_id = $2, updated_at = now() WHERE id::text = $3`, productID, priceID, addonID)
	}
	// Record a pending subscription row so the webhook can match by metadata.
	var subRowID string
	err = s.db.QueryRow(r.Context(), `INSERT INTO shop_addon_subscriptions
		(company_id, addon_id, feature_key, status) VALUES ($1::uuid, $2::uuid, $3, 'pending')
		RETURNING id::text`, cid, addonID, key).Scan(&subRowID)
	if err != nil {
		handleErr(w, err)
		return
	}
	origin := publicOrigin(r)
	sessURL, err := stripeCreateSubscriptionCheckout(r.Context(), secret, stripeSubscriptionCheckoutInput{
		PriceID:   stripePrice,
		TrialDays: trial,
		Email:     u.Email,
		SuccessURL: origin + "/settings/general/addons?result=success&feature=" + url.QueryEscape(key),
		CancelURL:  origin + "/settings/general/addons?result=cancel&feature=" + url.QueryEscape(key),
		Metadata: map[string]string{
			"torquedesk_company_id":   cid,
			"torquedesk_feature_key":  key,
			"torquedesk_addon_id":     addonID,
			"torquedesk_sub_row_id":   subRowID,
		},
	})
	if err != nil {
		_, _ = s.db.Exec(r.Context(), `DELETE FROM shop_addon_subscriptions WHERE id::text = $1 AND status = 'pending'`, subRowID)
		writeErr(w, 502, "Could not start checkout: "+err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"url": sessURL})
}

// cancelAddon tells Stripe to cancel at period end so the shop keeps access
// until the paid period runs out, then our webhook flips the flag off.
func (s *Server) cancelAddon(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	key := r.PathValue("featureKey")
	var subID, stripeSubID string
	err := s.db.QueryRow(r.Context(), `SELECT id::text, stripe_subscription_id FROM shop_addon_subscriptions
		WHERE company_id::text = $1 AND feature_key = $2
		  AND status IN ('trialing','active','past_due') LIMIT 1`, cid, key).Scan(&subID, &stripeSubID)
	if err != nil {
		writeErr(w, 404, "No active subscription found for this add-on.")
		return
	}
	if stripeSubID == "" {
		// No Stripe side yet (shop never completed checkout); just mark canceled.
		_, _ = s.db.Exec(r.Context(), `UPDATE shop_addon_subscriptions SET status='canceled', updated_at=now() WHERE id::text=$1`, subID)
		writeJSON(w, 200, map[string]any{"ok": true})
		return
	}
	secret, ok := s.platformStripeSecret(r.Context())
	if !ok {
		writeErr(w, 503, "Platform payment account not configured.")
		return
	}
	if err := stripeCancelAtPeriodEnd(r.Context(), secret, stripeSubID); err != nil {
		writeErr(w, 502, "Could not cancel in Stripe: "+err.Error())
		return
	}
	_, _ = s.db.Exec(r.Context(), `UPDATE shop_addon_subscriptions SET cancel_at_period_end=true, updated_at=now() WHERE id::text=$1`, subID)
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ---------------------------- platform webhook -----------------------------

func (s *Server) platformStripeWebhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeErr(w, 400, "could not read body")
		return
	}
	// Load platform webhook secret from saas_payment_methods.
	key, err := LoadDataKey(s.secret)
	if err != nil {
		writeErr(w, 500, "server misconfigured")
		return
	}
	var encrypted []byte
	err = s.db.QueryRow(r.Context(), `SELECT encrypted_webhook_secret FROM saas_payment_methods
		WHERE provider = 'stripe' AND active LIMIT 1`).Scan(&encrypted)
	if err != nil || len(encrypted) == 0 {
		writeErr(w, 400, "platform webhook not configured")
		return
	}
	secret, err := Decrypt(key, encrypted)
	if err != nil {
		writeErr(w, 500, "secret decrypt failed")
		return
	}
	if err := verifyStripeSignature(r.Header.Get("Stripe-Signature"), body, secret, 5*time.Minute); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	// Loose parse — we only care about customer.subscription.* events here.
	var env struct {
		ID   string `json:"id"`
		Type string `json:"type"`
		Data struct {
			Object json.RawMessage `json:"object"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &env); err != nil {
		writeErr(w, 400, "bad json")
		return
	}
	// Dedupe via webhook_events (reused across providers; scope separates).
	var inserted bool
	_ = s.db.QueryRow(r.Context(), `INSERT INTO webhook_events (scope, provider, event_id, event_type, raw, status)
		VALUES ('platform', 'stripe', $1, $2, $3, 'pending')
		ON CONFLICT (provider, event_id) DO NOTHING RETURNING true`, env.ID, env.Type, body).Scan(&inserted)
	if !inserted {
		writeJSON(w, 200, map[string]any{"ok": true, "deduped": true})
		return
	}
	switch env.Type {
	case "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted":
		if err := s.handlePlatformSubscriptionEvent(r.Context(), body); err != nil {
			_, _ = s.db.Exec(r.Context(), `UPDATE webhook_events SET status='failed', error_message=$1, processed_at=now() WHERE provider='stripe' AND event_id=$2`, err.Error(), env.ID)
			writeErr(w, 500, err.Error())
			return
		}
		_, _ = s.db.Exec(r.Context(), `UPDATE webhook_events SET status='processed', processed_at=now() WHERE provider='stripe' AND event_id=$1`, env.ID)
	default:
		_, _ = s.db.Exec(r.Context(), `UPDATE webhook_events SET status='skipped', processed_at=now() WHERE provider='stripe' AND event_id=$1`, env.ID)
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

type stripeSubscription struct {
	ID       string `json:"id"`
	Status   string `json:"status"`
	Customer string `json:"customer"`
	Metadata struct {
		CompanyID  string `json:"torquedesk_company_id"`
		FeatureKey string `json:"torquedesk_feature_key"`
		AddonID    string `json:"torquedesk_addon_id"`
		SubRowID   string `json:"torquedesk_sub_row_id"`
	} `json:"metadata"`
	CancelAtPeriodEnd  bool  `json:"cancel_at_period_end"`
	CurrentPeriodEnd   int64 `json:"current_period_end"`
	TrialEnd           int64 `json:"trial_end"`
}

func (s *Server) handlePlatformSubscriptionEvent(ctx context.Context, raw []byte) error {
	var env struct {
		Data struct {
			Object stripeSubscription `json:"object"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		return err
	}
	sub := env.Data.Object
	cid := sub.Metadata.CompanyID
	key := sub.Metadata.FeatureKey
	if cid == "" || key == "" {
		return errors.New("missing company_id / feature_key in subscription metadata")
	}
	// Translate Stripe status to our enum values.
	status := sub.Status
	// features flag on/off depending on status.
	featureOn := status == "trialing" || status == "active" || status == "past_due"
	var periodEnd, trialEnd any
	if sub.CurrentPeriodEnd > 0 {
		periodEnd = time.Unix(sub.CurrentPeriodEnd, 0).UTC()
	}
	if sub.TrialEnd > 0 {
		trialEnd = time.Unix(sub.TrialEnd, 0).UTC()
	}
	return s.tx(ctx, func(tx pgx.Tx) error {
		// Upsert the subscription row — by sub_row_id if we created one, else
		// by (company_id, feature_key).
		if sub.Metadata.SubRowID != "" {
			if _, err := tx.Exec(ctx, `UPDATE shop_addon_subscriptions
				SET stripe_subscription_id=$1, stripe_customer_id=$2, status=$3,
				    cancel_at_period_end=$4, current_period_end=$5, trial_end=$6, updated_at=now()
				WHERE id::text=$7`, sub.ID, sub.Customer, status, sub.CancelAtPeriodEnd, periodEnd, trialEnd, sub.Metadata.SubRowID); err != nil {
				return err
			}
		} else {
			if _, err := tx.Exec(ctx, `INSERT INTO shop_addon_subscriptions
				(company_id, addon_id, feature_key, stripe_subscription_id, stripe_customer_id, status,
				 cancel_at_period_end, current_period_end, trial_end)
				VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9)
				ON CONFLICT DO NOTHING`,
				cid, sub.Metadata.AddonID, key, sub.ID, sub.Customer, status,
				sub.CancelAtPeriodEnd, periodEnd, trialEnd); err != nil {
				return err
			}
		}
		// Flip feature flag. Reuses company_features (one row per tenant).
		if featureOn {
			if _, err := tx.Exec(ctx, `INSERT INTO company_features (company_id, features)
				VALUES ($1::uuid, jsonb_build_object($2::text, true))
				ON CONFLICT (company_id) DO UPDATE SET features = company_features.features || jsonb_build_object($2::text, true), updated_at = now()`, cid, key); err != nil {
				return err
			}
		} else {
			if _, err := tx.Exec(ctx, `UPDATE company_features
				SET features = features || jsonb_build_object($2::text, false), updated_at = now()
				WHERE company_id::text = $1`, cid, key); err != nil {
				return err
			}
		}
		return nil
	})
}

// --------------------------- stripe helpers --------------------------------

func (s *Server) platformStripeSecret(ctx context.Context) (string, bool) {
	key, err := LoadDataKey(s.secret)
	if err != nil {
		return "", false
	}
	var blob []byte
	err = s.db.QueryRow(ctx, `SELECT encrypted_secret_key FROM saas_payment_methods
		WHERE provider = 'stripe' AND active LIMIT 1`).Scan(&blob)
	if err != nil || len(blob) == 0 {
		return "", false
	}
	secret, err := Decrypt(key, blob)
	if err != nil {
		return "", false
	}
	return secret, true
}

// stripeCreateProductAndPrice creates a recurring Price (monthly) attached to
// a new Product. Returns product_id and price_id.
func stripeCreateProductAndPrice(ctx context.Context, secret, name, desc string, amount float64, currency string) (string, string, error) {
	// Product
	form := url.Values{}
	form.Set("name", name)
	if desc != "" {
		form.Set("description", desc)
	}
	prodResp, err := stripeForm(ctx, secret, "POST", "https://api.stripe.com/v1/products", form)
	if err != nil {
		return "", "", err
	}
	var prod struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(prodResp, &prod); err != nil || prod.ID == "" {
		return "", "", fmt.Errorf("could not parse product: %s", snippet(prodResp))
	}
	// Price
	cents := int64(amount*100 + 0.5)
	form = url.Values{}
	form.Set("unit_amount", strconv.FormatInt(cents, 10))
	form.Set("currency", currency)
	form.Set("recurring[interval]", "month")
	form.Set("product", prod.ID)
	priceResp, err := stripeForm(ctx, secret, "POST", "https://api.stripe.com/v1/prices", form)
	if err != nil {
		return prod.ID, "", err
	}
	var price struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(priceResp, &price); err != nil || price.ID == "" {
		return prod.ID, "", fmt.Errorf("could not parse price: %s", snippet(priceResp))
	}
	return prod.ID, price.ID, nil
}

type stripeSubscriptionCheckoutInput struct {
	PriceID    string
	TrialDays  int
	Email      string
	SuccessURL string
	CancelURL  string
	Metadata   map[string]string
}

func stripeCreateSubscriptionCheckout(ctx context.Context, secret string, in stripeSubscriptionCheckoutInput) (string, error) {
	form := url.Values{}
	form.Set("mode", "subscription")
	form.Set("success_url", in.SuccessURL)
	form.Set("cancel_url", in.CancelURL)
	form.Set("line_items[0][price]", in.PriceID)
	form.Set("line_items[0][quantity]", "1")
	if in.TrialDays > 0 {
		form.Set("subscription_data[trial_period_days]", strconv.Itoa(in.TrialDays))
	}
	if in.Email != "" {
		form.Set("customer_email", in.Email)
	}
	for k, v := range in.Metadata {
		form.Set("metadata["+k+"]", v)
		form.Set("subscription_data[metadata]["+k+"]", v)
	}
	resp, err := stripeForm(ctx, secret, "POST", "https://api.stripe.com/v1/checkout/sessions", form)
	if err != nil {
		return "", err
	}
	var out struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(resp, &out); err != nil || out.URL == "" {
		return "", fmt.Errorf("stripe did not return checkout URL: %s", snippet(resp))
	}
	return out.URL, nil
}

func stripeCancelAtPeriodEnd(ctx context.Context, secret, subID string) error {
	form := url.Values{}
	form.Set("cancel_at_period_end", "true")
	_, err := stripeForm(ctx, secret, "POST", "https://api.stripe.com/v1/subscriptions/"+subID, form)
	return err
}

// stripeForm POSTs form-encoded body to Stripe and returns the response body.
func stripeForm(ctx context.Context, secret, method, u string, form url.Values) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, method, u, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth(secret, "")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		var e stripeErrorResp
		_ = json.Unmarshal(body, &e)
		if e.Err.Message != "" {
			return body, errors.New(e.Err.Message)
		}
		return body, fmt.Errorf("stripe %d: %s", res.StatusCode, snippet(body))
	}
	return body, nil
}

// Suppress unused if the helper gets inlined away later.
var _ = hex.EncodeToString
var _ = hmac.New
var _ = sha256.Sum256
