package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ----------------------------------------------------------------------------
// Public self-serve signup — Phase B of the marketing / signup build-out.
//
// Flow:
//   1. Marketing site redirects visitor to /signup?plan=starter.
//   2. React page collects business + owner + plan details, POSTs to
//      /api/public/signup.
//   3. We create pending companies, company_owners, and subscriptions rows
//      inside one transaction, Argon2id-hash the password, then open a
//      Stripe Checkout session (subscription mode, trial_period_days = 7)
//      against the SaaS owner's platform Stripe account.
//   4. On return, the frontend polls /api/public/signup/sync/{session}
//      which asks Stripe directly whether the session is paid, and if so
//      flips everything from pending → trialing/active and emails the
//      shop owner a welcome message.
//   5. The platform webhook does the same in response to
//      checkout.session.completed so the activation isn't dependent on
//      the browser being open.
// ----------------------------------------------------------------------------

// signupPlan is the public catalog shown on the marketing site AND accepted
// by the signup endpoint. Mirrors torquedesk-marketing/backend plans.go so a
// visitor sees the same prices on either side.
type signupPlan struct {
	Key            string
	Name           string
	MonthlyPrice   float64
	AnnualPrice    float64
	TrialDays      int
	// Feature keys to flip on when the subscription activates. Everything
	// in features.go FeatureCatalog is valid here.
	Features []string
}

var signupPlans = map[string]signupPlan{
	"starter": {
		Key: "starter", Name: "Starter", MonthlyPrice: 49, AnnualPrice: 470, TrialDays: 7,
		Features: []string{
			"dashboard", "customers", "vehicles", "orders", "invoices", "payments",
			"settings", "share_link", "online_payments", "notifications",
		},
	},
	"professional": {
		Key: "professional", Name: "Professional", MonthlyPrice: 99, AnnualPrice: 950, TrialDays: 7,
		Features: []string{
			"dashboard", "customers", "vehicles", "orders", "invoices", "payments", "settings",
			"share_link", "online_payments", "notifications",
			"inspections", "inspection_photos", "technician_submit",
			"authorization", "chat", "payment_receipts", "email_templates",
			"reports", "sales_reports", "advanced_reports", "parts_profit",
			"payments_report", "tax_report",
		},
	},
	"business": {
		Key: "business", Name: "Business", MonthlyPrice: 199, AnnualPrice: 1900, TrialDays: 14,
		Features: []string{
			"dashboard", "customers", "vehicles", "orders", "invoices", "payments", "settings",
			"share_link", "online_payments", "notifications",
			"inspections", "inspection_photos", "technician_submit",
			"authorization", "chat", "payment_receipts", "email_templates",
			"reports", "sales_reports", "advanced_reports", "parts_profit",
			"payments_report", "tax_report",
			"backup", "audit_log", "mfa", "password_reset", "integrations_hub",
			"void_documents", "reopen_documents", "deposit_payments",
			"repair_info", "diagnostics", "dtc", "wiring", "maintenance", "bulletins",
		},
	},
}

func (s *Server) signupRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/public/signup/plans", s.publicSignupPlans)
	mux.HandleFunc("POST /api/public/signup", loginLimit(s.publicSignup))
	mux.HandleFunc("POST /api/public/signup/sync/{session}", s.publicSignupSync)
}

func (s *Server) publicSignupPlans(w http.ResponseWriter, r *http.Request) {
	out := []map[string]any{}
	// Deterministic order so the UI stays stable.
	for _, key := range []string{"starter", "professional", "business"} {
		p := signupPlans[key]
		out = append(out, map[string]any{
			"key": p.Key, "name": p.Name,
			"monthlyPrice": p.MonthlyPrice, "annualPrice": p.AnnualPrice,
			"trialDays": p.TrialDays,
			"features":  p.Features,
		})
	}
	writeJSON(w, 200, out)
}

type signupReq struct {
	Plan         string `json:"plan"`
	BillingCycle string `json:"billingCycle"` // "monthly" | "annual"
	Business     struct {
		Name     string `json:"name"`
		LegalName string `json:"legalName"`
		Email    string `json:"email"`
		Phone    string `json:"phone"`
		Street   string `json:"street"`
		City     string `json:"city"`
		State    string `json:"state"`
		Zip      string `json:"zip"`
		Country  string `json:"country"`
	} `json:"business"`
	Owner struct {
		FirstName string `json:"firstName"`
		LastName  string `json:"lastName"`
		Email     string `json:"email"`
		Phone     string `json:"phone"`
		Password  string `json:"password"`
	} `json:"owner"`
}

var signupSlugRE = regexp.MustCompile(`[^a-z0-9]+`)

func (s *Server) publicSignup(w http.ResponseWriter, r *http.Request) {
	var in signupReq
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	plan, ok := signupPlans[strings.ToLower(strings.TrimSpace(in.Plan))]
	if !ok {
		writeErr(w, 400, "That plan is not available.")
		return
	}
	cycle := strings.ToLower(strings.TrimSpace(in.BillingCycle))
	if cycle == "" {
		cycle = "monthly"
	}
	if cycle != "monthly" && cycle != "annual" {
		writeErr(w, 400, "Billing cycle must be monthly or annual.")
		return
	}
	ve := ValidationError{}
	in.Business.Name = strings.TrimSpace(in.Business.Name)
	in.Business.Email = strings.ToLower(strings.TrimSpace(in.Business.Email))
	in.Owner.Email = strings.ToLower(strings.TrimSpace(in.Owner.Email))
	in.Owner.FirstName = strings.TrimSpace(in.Owner.FirstName)
	in.Owner.LastName = strings.TrimSpace(in.Owner.LastName)
	if in.Business.Name == "" || len(in.Business.Name) > 200 {
		ve["business.name"] = "Enter your shop name."
	}
	if _, err := mail.ParseAddress(in.Business.Email); err != nil {
		ve["business.email"] = "Enter a valid business email."
	}
	if _, err := mail.ParseAddress(in.Owner.Email); err != nil {
		ve["owner.email"] = "Enter a valid owner email."
	}
	if in.Owner.FirstName == "" {
		ve["owner.firstName"] = "Enter the owner's first name."
	}
	if len(in.Owner.Password) < 8 {
		ve["owner.password"] = "Password must be at least 8 characters."
	}
	// Reject obvious duplicates upfront. A race with another signup is still
	// possible — the unique index on company_owners.email catches that at
	// commit time.
	var existingCount int
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM company_owners WHERE lower(email) = $1`, in.Owner.Email).Scan(&existingCount)
	if existingCount > 0 {
		ve["owner.email"] = "An account with this email already exists. Please sign in instead."
	}
	if len(ve) > 0 {
		handleErr(w, ve)
		return
	}

	// Build slug + code from the shop name.
	slug := signupSlugRE.ReplaceAllString(strings.ToLower(in.Business.Name), "-")
	slug = strings.Trim(slug, "-")
	if len(slug) < 3 {
		slug = fmt.Sprintf("shop-%d", time.Now().Unix())
	}
	if len(slug) > 60 {
		slug = slug[:60]
	}
	// Ensure uniqueness.
	base := slug
	for i := 1; ; i++ {
		var dup bool
		_ = s.db.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM companies WHERE slug = $1)`, slug).Scan(&dup)
		if !dup {
			break
		}
		slug = fmt.Sprintf("%s-%d", base, i)
		if i > 50 {
			slug = fmt.Sprintf("shop-%d", time.Now().UnixNano())
			break
		}
	}
	code := strings.ToUpper(strings.ReplaceAll(slug, "-", "")) + "-" + fmt.Sprintf("%04d", time.Now().UnixNano()%10000)
	if len(code) > 48 {
		code = code[:48]
	}

	ownerHash, err := HashPassword(in.Owner.Password)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}

	// Platform Stripe is required to accept paid signups. (Phase B
	// deliberately refuses signups when it's not yet configured so you
	// never end up with an orphan pending company nobody can activate.)
	secret, ok := s.platformStripeSecret(r.Context())
	if !ok {
		writeErr(w, 503, "Online signup is temporarily unavailable. Please contact support to set up your account.")
		return
	}

	// Create pending rows in a single tx.
	var companyID, subscriptionID string
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		if err := tx.QueryRow(r.Context(), `INSERT INTO companies
			(company_code, slug, name, legal_name,
			 address_street, address_city, address_state, address_zip, address_country,
			 phone, email, industry, timezone, status, application_url)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Automotive','America/New_York','pending',$12)
			RETURNING id::text`,
			code, slug, in.Business.Name, in.Business.LegalName,
			in.Business.Street, in.Business.City, in.Business.State, in.Business.Zip, defaultStr(in.Business.Country, "US"),
			in.Business.Phone, in.Business.Email,
			"/t/"+slug,
		).Scan(&companyID); err != nil {
			return err
		}
		if _, err := tx.Exec(r.Context(), `INSERT INTO company_owners
			(company_id, first_name, last_name, email, phone, username, password_hash, status)
			VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, 'pending')`,
			companyID, in.Owner.FirstName, in.Owner.LastName,
			in.Owner.Email, in.Owner.Phone, strings.ToLower(strings.Split(in.Owner.Email, "@")[0]),
			ownerHash); err != nil {
			return err
		}
		if err := tx.QueryRow(r.Context(), `INSERT INTO subscriptions
			(company_id, plan, status, billing_cycle, monthly_price, annual_price, start_date, trial_end, auto_renewal)
			VALUES ($1::uuid, $2, 'pending', $3, $4, $5, current_date, current_date + ($6 || ' days')::interval, true)
			RETURNING id::text`,
			companyID, plan.Key, cycle, plan.MonthlyPrice, plan.AnnualPrice, plan.TrialDays,
		).Scan(&subscriptionID); err != nil {
			return err
		}
		// Default feature set during trial — same bundle the webhook /
		// sync will confirm once Stripe reports the trial as started.
		b, _ := json.Marshal(featuresFromPlan(plan))
		_, err := tx.Exec(r.Context(), `INSERT INTO company_features (company_id, features)
			VALUES ($1::uuid, $2::jsonb)
			ON CONFLICT (company_id) DO UPDATE SET features = EXCLUDED.features, updated_at = now()`,
			companyID, string(b))
		return err
	})
	if err != nil {
		handleErr(w, err)
		return
	}

	// Lazy-provision the Stripe recurring Price for this plan + cycle.
	priceID, pErr := signupStripePriceFor(r.Context(), s, secret, plan, cycle)
	if pErr != nil {
		writeErr(w, 502, "Could not reach Stripe: "+pErr.Error())
		return
	}

	origin := publicOrigin(r)
	sessURL, sessID, cErr := stripeCreateSubscriptionCheckoutV2(r.Context(), secret, stripeSubscriptionCheckoutInput{
		PriceID:   priceID,
		TrialDays: plan.TrialDays,
		Email:     in.Owner.Email,
		SuccessURL: origin + "/signup/complete?session={CHECKOUT_SESSION_ID}&company=" + companyID,
		CancelURL:  origin + "/signup?plan=" + plan.Key + "&cancelled=1",
		Metadata: map[string]string{
			"torquedesk_signup":        "true",
			"torquedesk_company_id":    companyID,
			"torquedesk_subscription":  subscriptionID,
			"torquedesk_plan":          plan.Key,
			"torquedesk_billing_cycle": cycle,
		},
	})
	if cErr != nil {
		writeErr(w, 502, "Could not start checkout: "+cErr.Error())
		return
	}
	// Store Stripe refs on the subscription row so the sync path can look
	// them up when the webhook doesn't arrive.
	_, _ = s.db.Exec(r.Context(), `UPDATE subscriptions
		SET notes = coalesce(notes,'') || E'\nStripe session: ' || $1
		WHERE id::text = $2`, sessID, subscriptionID)

	writeJSON(w, 200, map[string]any{"url": sessURL, "companyId": companyID, "sessionId": sessID})
}

// publicSignupSync is the browser-side self-heal: after Stripe redirects to
// /signup/complete?session=..., the React page POSTs here. We retrieve the
// session, verify it belongs to a signup we started, then run the same
// activation path the webhook would run.
func (s *Server) publicSignupSync(w http.ResponseWriter, r *http.Request) {
	sess := r.PathValue("session")
	if sess == "" {
		writeErr(w, 400, "Missing session id.")
		return
	}
	secret, ok := s.platformStripeSecret(r.Context())
	if !ok {
		writeErr(w, 503, "Payment account not configured.")
		return
	}
	resp, cErr := stripeForm(r.Context(), secret, "GET", "https://api.stripe.com/v1/checkout/sessions/"+sess+"?expand[]=subscription", nil)
	if cErr != nil {
		writeErr(w, 502, cErr.Error())
		return
	}
	var dto struct {
		Status        string `json:"status"`
		PaymentStatus string `json:"payment_status"`
		Metadata      struct {
			Signup        string `json:"torquedesk_signup"`
			CompanyID     string `json:"torquedesk_company_id"`
			Subscription  string `json:"torquedesk_subscription"`
			Plan          string `json:"torquedesk_plan"`
			BillingCycle  string `json:"torquedesk_billing_cycle"`
		} `json:"metadata"`
		SubscriptionID any `json:"subscription"`
	}
	if err := json.Unmarshal(resp, &dto); err != nil {
		writeErr(w, 502, "Could not parse Stripe response.")
		return
	}
	if dto.Metadata.Signup != "true" {
		writeErr(w, 404, "This checkout session is not a TorqueDesk signup.")
		return
	}
	if dto.Status != "complete" {
		writeJSON(w, 200, map[string]any{"ok": true, "status": dto.Status, "ready": false})
		return
	}
	// Extract the Stripe subscription id regardless of whether Stripe
	// expanded it to an object or just returned the id string.
	stripeSubID := ""
	switch v := dto.SubscriptionID.(type) {
	case string:
		stripeSubID = v
	case map[string]any:
		if id, ok := v["id"].(string); ok {
			stripeSubID = id
		}
	}
	if err := s.activateSignup(r.Context(), dto.Metadata.CompanyID, dto.Metadata.Subscription,
		dto.Metadata.Plan, dto.Metadata.BillingCycle, stripeSubID); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "status": "complete", "ready": true, "companyId": dto.Metadata.CompanyID})
}

// activateSignup flips a pending signup (company + owner + subscription) into
// an active state and records the Stripe subscription id. Idempotent: if the
// company is already active, nothing changes. Returns a welcome email through
// the platform mailer the first time it activates.
func (s *Server) activateSignup(ctx context.Context, companyID, subID, planKey, cycle, stripeSubID string) error {
	if companyID == "" {
		return errors.New("missing company id")
	}
	plan, ok := signupPlans[planKey]
	if !ok {
		return errors.New("unknown plan: " + planKey)
	}
	var prevStatus string
	err := s.db.QueryRow(ctx, `SELECT status FROM companies WHERE id::text = $1`, companyID).Scan(&prevStatus)
	if err != nil {
		return err
	}
	if prevStatus == "active" || prevStatus == "trial" {
		return nil // already activated — webhook/sync race won
	}
	notePart := ""
	if stripeSubID != "" {
		notePart = "\nStripe subscription: " + stripeSubID
	}
	err = s.tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE companies SET status = 'active', updated_at = now() WHERE id::text = $1`, companyID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE company_owners SET status = 'active', updated_at = now() WHERE company_id::text = $1`, companyID); err != nil {
			return err
		}
		subStatus := "trial"
		if plan.TrialDays == 0 {
			subStatus = "active"
		}
		if subID != "" {
			if _, err := tx.Exec(ctx, `UPDATE subscriptions
				SET status = $1, notes = coalesce(notes,'') || $2, updated_at = now()
				WHERE id::text = $3`, subStatus, notePart, subID); err != nil {
				return err
			}
		} else {
			if _, err := tx.Exec(ctx, `UPDATE subscriptions
				SET status = $1, notes = coalesce(notes,'') || $2, updated_at = now()
				WHERE company_id::text = $3`, subStatus, notePart, companyID); err != nil {
				return err
			}
		}
		// Make sure the plan features are enabled (they were seeded at
		// signup but a prior admin override could have disabled them).
		b, _ := json.Marshal(featuresFromPlan(plan))
		_, err := tx.Exec(ctx, `INSERT INTO company_features (company_id, features)
			VALUES ($1::uuid, $2::jsonb)
			ON CONFLICT (company_id) DO UPDATE SET features = EXCLUDED.features, updated_at = now()`,
			companyID, string(b))
		return err
	})
	if err != nil {
		return err
	}
	invalidateCompanyStatus(companyID)
	// Welcome email through the platform mailer.
	var ownerEmail, ownerName, companyName string
	_ = s.db.QueryRow(ctx, `SELECT lower(email), trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
		FROM company_owners WHERE company_id::text = $1 ORDER BY created_at ASC LIMIT 1`, companyID).Scan(&ownerEmail, &ownerName)
	_ = s.db.QueryRow(ctx, `SELECT name FROM companies WHERE id::text = $1`, companyID).Scan(&companyName)
	appURL := strings.TrimSpace(os.Getenv("APP_ORIGIN"))
	if appURL == "" {
		appURL = "https://apps.2set.com"
	}
	go s.NotifyCompanyCreated(context.Background(), ownerEmail, ownerName, companyName, appURL)
	return nil
}

// featuresFromPlan returns a map[key]true for every feature a plan should
// turn on. Features missing from this map stay at their catalog default.
func featuresFromPlan(p signupPlan) map[string]bool {
	out := map[string]bool{}
	for _, k := range p.Features {
		out[k] = true
	}
	return out
}

// signupStripePriceFor finds (or lazily creates) a recurring Stripe Price
// for a plan + billing cycle, cached in a tiny in-memory map so repeat
// signups don't re-provision. Cache lives for the process lifetime.
var signupPriceCache = struct {
	m map[string]string
}{m: map[string]string{}}

func signupStripePriceFor(ctx context.Context, _ *Server, secret string, plan signupPlan, cycle string) (string, error) {
	key := plan.Key + ":" + cycle
	if v, ok := signupPriceCache.m[key]; ok {
		return v, nil
	}
	amount := plan.MonthlyPrice
	interval := "month"
	if cycle == "annual" {
		amount = plan.AnnualPrice
		interval = "year"
	}
	// Reuse the addon helper to create a product + price in one call. We
	// deliberately do NOT persist these ids to the DB — Phase C can add a
	// subscription_plan_prices table if you want them survivable across
	// restarts.
	productID, priceID, err := stripeCreateProductAndPriceWithInterval(ctx, secret,
		"TorqueDesk — "+plan.Name+" ("+cycle+")",
		"TorqueDesk subscription", amount, "usd", interval)
	if err != nil {
		return "", err
	}
	_ = productID
	signupPriceCache.m[key] = priceID
	return priceID, nil
}
