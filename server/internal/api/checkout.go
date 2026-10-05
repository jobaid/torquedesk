package api

// Session 2 of payments: hand off to the shop's own Stripe Checkout page.
//
// Flow:
//   1. Shop clicks "Send payment link" on a document.
//   2. POST /api/documents/{id}/payment-link → we create a Stripe Checkout
//      Session with the shop's secret key, record a shop_payment_intents row
//      with status=pending, return the URL.
//   3. Shop sends that URL to their customer (copy / email / SMS).
//   4. Customer pays on Stripe-hosted pages — card data NEVER touches us.
//   5. Stripe POSTs checkout.session.completed to our webhook; we verify the
//      signature, mark the intent succeeded, and insert into payments so
//      reports/balance-due see it exactly like a cash payment would.
//
// What this file does NOT do: store card numbers, pretend a payment is
// complete before the webhook, process refunds (handled through the existing
// payments.updatePayment path).

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"
)

func (s *Server) checkoutRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/documents/{id}/payment-link", s.auth("documents.edit", s.createDocumentPaymentLink))
	mux.HandleFunc("GET /api/payment-intents/{id}", s.auth("", s.getPaymentIntent))

	// Public — Stripe calls this, customer never does. No auth; signature-
	// verified against the shop's stored webhook secret. The companyID in the
	// URL scopes which company's webhook secret to use for verification;
	// a bogus value just means we won't find a secret and reject the request.
	mux.HandleFunc("POST /api/webhooks/stripe/{companyID}", s.stripeWebhook)

	// Public — the customer's browser lands here after Checkout. These are
	// read-only status probes; no state is changed here.
	mux.HandleFunc("GET /api/pay/status/{intentId}", s.publicIntentStatus)
}

// ------------------------------- create -------------------------------------

type paymentLinkReq struct {
	Provider      string      `json:"provider"`
	Amount        json.Number `json:"amount"`        // optional; defaults to balance due
	CustomerEmail string      `json:"customerEmail"` // optional; prefills Stripe Checkout
	Description   string      `json:"description"`
}

type paymentLinkRes struct {
	URL      string `json:"url"`
	IntentID string `json:"intentId"`
	Provider string `json:"provider"`
	Amount   string `json:"amount"`
	Expires  int64  `json:"expiresAt"`
}

func (s *Server) createDocumentPaymentLink(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	docID := r.PathValue("id")
	var in paymentLinkReq
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request body.")
		return
	}
	if in.Provider == "" {
		in.Provider = "stripe"
	}
	if in.Provider != "stripe" {
		writeErr(w, 400, "Only Stripe payment links are supported right now. Authorize.Net hosted-form links arrive in a later session.")
		return
	}

	// Look up the document in this tenant + its balance. The customer's
	// display name lives inside customer_snapshot jsonb, not a flat column.
	var displayNumber, docType, docCustomer string
	var balance, total string
	err := s.db.QueryRow(r.Context(), `
		SELECT display_number, type,
		       coalesce(customer_snapshot->>'name', customer_snapshot->>'displayName', ''),
		       balance::text, total::text
		FROM documents WHERE id::text = $1 AND company_id::text = $2`, docID, cid).
		Scan(&displayNumber, &docType, &docCustomer, &balance, &total)
	if err != nil {
		handleErr(w, err)
		return
	}

	bal := dec(balance)
	amt := bal
	if s := strings.TrimSpace(in.Amount.String()); s != "" && s != "0" {
		amt = dec(s)
	}
	if amt.Sign() <= 0 {
		writeErr(w, 400, "There is nothing to pay on this document.")
		return
	}
	if amt.GreaterThan(bal) {
		writeErr(w, 400, "Amount cannot exceed the current balance of "+bal.StringFixed(2)+".")
		return
	}

	// Load the shop's active Stripe gateway (publishable + decrypted secret).
	_, secret, err := s.ActiveShopGatewaySecret(r.Context(), cid, "stripe")
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, 400, "Set up and activate Stripe under Settings → Financial → Payment Gateways first.")
		return
	}
	if err != nil {
		handleErr(w, err)
		return
	}

	// Describe the line on Stripe's Checkout page so the customer sees the
	// shop's own naming, not a Stripe default.
	desc := strings.TrimSpace(in.Description)
	if desc == "" {
		switch docType {
		case "invoice":
			desc = "Invoice " + displayNumber
		case "repair_order":
			desc = "Repair Order " + displayNumber
		default:
			desc = displayNumber
		}
		if docCustomer != "" {
			desc = desc + " — " + docCustomer
		}
	}

	origin := publicOrigin(r)

	// Create the intent row first so we have a stable id for the return URLs.
	var intentID string
	if err := s.db.QueryRow(r.Context(), `
		INSERT INTO shop_payment_intents (company_id, document_id, provider, provider_ref, amount, currency, status)
		VALUES ($1::uuid, $2::uuid, 'stripe', '', $3::numeric, 'USD', 'pending') RETURNING id::text`,
		cid, docID, amt.StringFixed(2)).Scan(&intentID); err != nil {
		handleErr(w, err)
		return
	}

	sess, err := stripeCreateCheckoutSession(r.Context(), secret, stripeCheckoutInput{
		Amount:        amt,
		Currency:      "usd",
		Description:   desc,
		CustomerEmail: strings.TrimSpace(in.CustomerEmail),
		SuccessURL:    origin + "/pay/success?intent=" + intentID,
		CancelURL:     origin + "/pay/cancel?intent=" + intentID,
		Metadata: map[string]string{
			"torquedesk_company_id":  cid,
			"torquedesk_document_id": docID,
			"torquedesk_intent_id":   intentID,
		},
	})
	if err != nil {
		// Mark intent failed so the UI can show a sane state.
		_, _ = s.db.Exec(r.Context(), `UPDATE shop_payment_intents SET status = 'failed', error_message = $1, updated_at = now() WHERE id::text = $2`, err.Error(), intentID)
		writeErr(w, 502, "Stripe rejected the request: "+err.Error())
		return
	}
	if _, err := s.db.Exec(r.Context(), `UPDATE shop_payment_intents SET provider_ref = $1, updated_at = now() WHERE id::text = $2`, sess.ID, intentID); err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 201, paymentLinkRes{
		URL: sess.URL, IntentID: intentID, Provider: "stripe",
		Amount: amt.StringFixed(2), Expires: sess.ExpiresAt,
	})
}

// getPaymentIntent lets the UI poll for status after the shop sends the link.
func (s *Server) getPaymentIntent(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	id := r.PathValue("id")
	var provider, providerRef, status, errMsg, amount, currency string
	var docID *string
	var created, updated time.Time
	err := s.db.QueryRow(r.Context(), `
		SELECT provider, provider_ref, status, error_message, amount::text, currency, document_id::text, created_at, updated_at
		FROM shop_payment_intents WHERE id::text = $1 AND company_id::text = $2`, id, cid).
		Scan(&provider, &providerRef, &status, &errMsg, &amount, &currency, &docID, &created, &updated)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{
		"id": id, "provider": provider, "providerRef": providerRef,
		"status": status, "errorMessage": errMsg,
		"amount": dec(amount), "currency": currency,
		"documentId": docID,
		"createdAt":  created.UnixMilli(), "updatedAt": updated.UnixMilli(),
	})
}

// publicIntentStatus is called by the browser on the success/cancel landing
// pages. Returns only what the customer should see (status + amount), not the
// shop's internal document data.
func (s *Server) publicIntentStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("intentId")
	var status, amount, currency string
	err := s.db.QueryRow(r.Context(), `SELECT status, amount::text, currency FROM shop_payment_intents WHERE id::text = $1`, id).
		Scan(&status, &amount, &currency)
	if err != nil {
		writeErr(w, 404, "This payment reference was not found.")
		return
	}
	writeJSON(w, 200, map[string]any{"status": status, "amount": dec(amount), "currency": currency})
}

// ------------------------------ webhook -------------------------------------

func (s *Server) stripeWebhook(w http.ResponseWriter, r *http.Request) {
	cid := r.PathValue("companyID")
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeErr(w, 400, "could not read body")
		return
	}
	// Look up this tenant's Stripe webhook secret.
	key, err := LoadDataKey(s.secret)
	if err != nil {
		writeErr(w, 500, "server misconfigured")
		return
	}
	var encrypted []byte
	err = s.db.QueryRow(r.Context(), `SELECT encrypted_webhook_secret FROM shop_payment_gateways
		WHERE company_id::text = $1 AND provider = 'stripe'`, cid).Scan(&encrypted)
	if err != nil || len(encrypted) == 0 {
		// No webhook secret configured — refuse unverified events. We will not
		// trust a payment confirmation we cannot cryptographically verify.
		writeErr(w, 400, "webhook not configured")
		return
	}
	secret, err := Decrypt(key, encrypted)
	if err != nil {
		writeErr(w, 500, "secret decrypt failed")
		return
	}
	sig := r.Header.Get("Stripe-Signature")
	if err := verifyStripeSignature(sig, body, secret, 5*time.Minute); err != nil {
		writeErr(w, 400, err.Error())
		return
	}

	var evt stripeEvent
	if err := json.Unmarshal(body, &evt); err != nil {
		writeErr(w, 400, "bad event json")
		return
	}

	// Idempotency: a provider+event_id collision means Stripe is retrying.
	// Record first — on duplicate, bail out as "already processed" (204).
	var ignore int
	err = s.db.QueryRow(r.Context(), `INSERT INTO webhook_events (scope, provider, event_id, event_type, company_id, raw, status)
		VALUES ('shop', 'stripe', $1, $2, $3::uuid, $4::jsonb, 'received')
		ON CONFLICT (provider, event_id) DO NOTHING RETURNING 1`, evt.ID, evt.Type, cid, body).Scan(&ignore)
	if errors.Is(err, pgx.ErrNoRows) {
		w.WriteHeader(204)
		return
	}
	if err != nil {
		writeErr(w, 500, "could not persist event")
		return
	}

	if evt.Type == "checkout.session.completed" || evt.Type == "checkout.session.async_payment_succeeded" {
		if err := s.handleStripeSessionCompleted(r.Context(), cid, evt); err != nil {
			_, _ = s.db.Exec(r.Context(), `UPDATE webhook_events SET status = 'failed', error_message = $1, processed_at = now() WHERE provider = 'stripe' AND event_id = $2`, err.Error(), evt.ID)
			writeErr(w, 500, "could not handle event")
			return
		}
		_, _ = s.db.Exec(r.Context(), `UPDATE webhook_events SET status = 'processed', processed_at = now() WHERE provider = 'stripe' AND event_id = $1`, evt.ID)
	} else {
		_, _ = s.db.Exec(r.Context(), `UPDATE webhook_events SET status = 'skipped', processed_at = now() WHERE provider = 'stripe' AND event_id = $1`, evt.ID)
	}
	w.WriteHeader(200)
}

// handleStripeSessionCompleted turns a successful Checkout into a payment row
// against the original document, scoped to the tenant that owns the intent.
func (s *Server) handleStripeSessionCompleted(ctx context.Context, cid string, evt stripeEvent) error {
	// Prefer our metadata (we set torquedesk_intent_id when creating the session)
	// over any Stripe-provided reference, so a crafted payload can't point a
	// webhook from one shop at another shop's document.
	sess := evt.Data.Object
	intentID := sess.Metadata["torquedesk_intent_id"]
	if intentID == "" {
		return fmt.Errorf("missing torquedesk_intent_id in session metadata")
	}
	var docID, status, amount string
	err := s.db.QueryRow(ctx, `SELECT coalesce(document_id::text, ''), status, amount::text FROM shop_payment_intents
		WHERE id::text = $1 AND company_id::text = $2`, intentID, cid).Scan(&docID, &status, &amount)
	if errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("intent %s not found for company %s", intentID, cid)
	}
	if err != nil {
		return err
	}
	if status == "succeeded" {
		return nil // already handled; idempotency insurance beyond webhook_events dedupe
	}
	if docID == "" {
		return fmt.Errorf("intent %s has no document", intentID)
	}
	paid := decimal.NewFromInt(sess.AmountTotal).Div(decimal.NewFromInt(100))
	if !paid.Equal(dec(amount)) {
		// Stripe may charge a slightly different amount if the customer edited
		// quantity on a cart product — not possible with our flow, so treat it
		// as suspicious and refuse rather than silently crediting the wrong $.
		return fmt.Errorf("amount mismatch: intent=%s stripe=%s", amount, paid.StringFixed(2))
	}

	return s.tx(ctx, func(tx pgx.Tx) error {
		// Mark intent succeeded.
		if _, err := tx.Exec(ctx, `UPDATE shop_payment_intents SET status = 'succeeded', updated_at = now() WHERE id::text = $1`, intentID); err != nil {
			return err
		}
		// Insert payment, scoped to company. recorded_by = "Stripe" so an audit
		// of the payments table shows these came from an external provider.
		if _, err := tx.Exec(ctx, `INSERT INTO payments (company_id, document_id, paid_at, method, amount, reference, notes, recorded_by, updated_by)
			VALUES ($1::uuid, $2::uuid, now(), 'credit_card', $3, $4, 'Paid online via Stripe Checkout', 'Stripe', 'Stripe')`,
			cid, docID, paid.StringFixed(2), sess.ID); err != nil {
			return err
		}
		if err := recalcDocument(ctx, tx, docID); err != nil {
			return err
		}
		return nil
	})
}

// ----------------------- stripe client (zero-dep REST) ----------------------

type stripeCheckoutInput struct {
	Amount        decimal.Decimal
	Currency      string
	Description   string
	CustomerEmail string
	SuccessURL    string
	CancelURL     string
	Metadata      map[string]string
}

type stripeCheckoutSession struct {
	ID        string `json:"id"`
	URL       string `json:"url"`
	ExpiresAt int64  `json:"expires_at"`
}

type stripeErrorResp struct {
	Err struct {
		Message string `json:"message"`
		Code    string `json:"code"`
		Type    string `json:"type"`
	} `json:"error"`
}

func stripeCreateCheckoutSession(ctx context.Context, secret string, in stripeCheckoutInput) (stripeCheckoutSession, error) {
	form := url.Values{}
	form.Set("mode", "payment")
	form.Set("success_url", in.SuccessURL)
	form.Set("cancel_url", in.CancelURL)
	// One ad-hoc line item: price_data lets us pass an amount without creating
	// a Stripe Product/Price up front.
	form.Set("line_items[0][price_data][currency]", strings.ToLower(in.Currency))
	form.Set("line_items[0][price_data][unit_amount]", strconv.FormatInt(in.Amount.Mul(decimal.NewFromInt(100)).Round(0).IntPart(), 10))
	name := in.Description
	if name == "" {
		name = "TorqueDesk payment"
	}
	form.Set("line_items[0][price_data][product_data][name]", name)
	form.Set("line_items[0][quantity]", "1")
	if in.CustomerEmail != "" {
		form.Set("customer_email", in.CustomerEmail)
	}
	for k, v := range in.Metadata {
		form.Set("metadata["+k+"]", v)
		// Also attach to the created PaymentIntent so a Dashboard search finds it.
		form.Set("payment_intent_data[metadata]["+k+"]", v)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.stripe.com/v1/checkout/sessions", strings.NewReader(form.Encode()))
	if err != nil {
		return stripeCheckoutSession{}, err
	}
	req.SetBasicAuth(secret, "")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 15 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return stripeCheckoutSession{}, fmt.Errorf("could not reach Stripe: %w", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		var e stripeErrorResp
		_ = json.Unmarshal(body, &e)
		if e.Err.Message != "" {
			return stripeCheckoutSession{}, errors.New(e.Err.Message)
		}
		return stripeCheckoutSession{}, fmt.Errorf("stripe returned %d: %s", res.StatusCode, snippet(body))
	}
	var sess stripeCheckoutSession
	if err := json.Unmarshal(body, &sess); err != nil {
		return stripeCheckoutSession{}, fmt.Errorf("could not parse Stripe response: %w", err)
	}
	if sess.URL == "" {
		return stripeCheckoutSession{}, errors.New("Stripe did not return a Checkout URL")
	}
	return sess, nil
}

// --------------------------- webhook signature ------------------------------

type stripeEvent struct {
	ID   string `json:"id"`
	Type string `json:"type"`
	Data struct {
		Object stripeCheckoutObject `json:"object"`
	} `json:"data"`
}

type stripeCheckoutObject struct {
	ID            string            `json:"id"`
	AmountTotal   int64             `json:"amount_total"`
	Currency      string            `json:"currency"`
	PaymentStatus string            `json:"payment_status"`
	Metadata      map[string]string `json:"metadata"`
}

// verifyStripeSignature implements Stripe's `Stripe-Signature` header check
// ourselves so the only dependency on github.com/stripe/stripe-go is the one
// we don't need: this file is deliberately zero-dep so a wire change in that
// SDK can't take down the webhook.
func verifyStripeSignature(header string, payload []byte, secret string, tolerance time.Duration) error {
	if header == "" {
		return errors.New("missing Stripe-Signature header")
	}
	var ts string
	sigs := []string{}
	for _, part := range strings.Split(header, ",") {
		kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "t":
			ts = kv[1]
		case "v1":
			sigs = append(sigs, kv[1])
		}
	}
	if ts == "" || len(sigs) == 0 {
		return errors.New("malformed Stripe-Signature header")
	}
	tsNum, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		return errors.New("bad Stripe-Signature timestamp")
	}
	if tolerance > 0 && time.Since(time.Unix(tsNum, 0)) > tolerance {
		return errors.New("Stripe-Signature timestamp outside tolerance (replay?)")
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts))
	mac.Write([]byte("."))
	mac.Write(payload)
	want := hex.EncodeToString(mac.Sum(nil))
	for _, got := range sigs {
		if hmac.Equal([]byte(got), []byte(want)) {
			return nil
		}
	}
	return errors.New("Stripe-Signature mismatch")
}

// publicOrigin returns the scheme+host the end-user hits, honouring the
// X-Forwarded-* headers that a reverse proxy sets so Checkout can redirect
// the customer back to our real public URL (not an internal address).
func publicOrigin(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if h := r.Header.Get("X-Forwarded-Proto"); h != "" {
		scheme = strings.SplitN(h, ",", 2)[0]
	}
	host := r.Host
	if h := r.Header.Get("X-Forwarded-Host"); h != "" {
		host = strings.SplitN(h, ",", 2)[0]
	}
	return scheme + "://" + strings.TrimSpace(host)
}
