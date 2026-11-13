package api

import (
	"context"
	"encoding/json"
	"log"
	"net/url"
	"sync"
	"time"
)

// ----------------------------------------------------------------------------
// Trial-activation refund ticker.
//
// At signup we charge $0.30 as a card-validation / anti-abuse fee
// (see signup.go + stripeCreateSubscriptionCheckoutV2 trial activation
// line item). As a goodwill gesture we refund the fee 5 days after the
// charge — long enough that the card has validated and any abusive
// chargeback window has mostly played out, short enough that legitimate
// shops see the refund hit their statement while they're still in trial.
//
// Runs hourly. Dedup is implicit via the trial_activation_refunded_at
// column — once written, the sub falls out of the sweep.
// ----------------------------------------------------------------------------

const trialActivationRefundAfter = 5 * 24 * time.Hour

var trialActRefundOnce sync.Once

// StartTrialActivationRefundTicker runs forever, sweeping every hour.
func (s *Server) StartTrialActivationRefundTicker(ctx context.Context) {
	trialActRefundOnce.Do(func() {
		go func() {
			time.Sleep(90 * time.Second) // let migrations finish on boot
			t := time.NewTicker(1 * time.Hour)
			defer t.Stop()
			s.runTrialActivationRefundSweep(ctx)
			for {
				select {
				case <-ctx.Done():
					return
				case <-t.C:
					s.runTrialActivationRefundSweep(ctx)
				}
			}
		}()
	})
}

func (s *Server) runTrialActivationRefundSweep(ctx context.Context) {
	cutoff := time.Now().Add(-trialActivationRefundAfter)

	rows, err := s.db.Query(ctx, `
		SELECT id::text, company_id::text, coalesce(trial_activation_pi, '')
		  FROM subscriptions
		 WHERE trial_activation_pi IS NOT NULL
		   AND trial_activation_pi <> ''
		   AND trial_activation_refunded_at IS NULL
		   AND trial_activation_charged_at IS NOT NULL
		   AND trial_activation_charged_at < $1`, cutoff)
	if err != nil {
		log.Printf("trial-activation refund sweep: query: %v", err)
		return
	}
	defer rows.Close()

	type row struct{ subID, companyID, pi string }
	var batch []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.subID, &r.companyID, &r.pi); err == nil {
			batch = append(batch, r)
		}
	}
	if len(batch) == 0 {
		return
	}

	secret, ok := s.platformStripeSecret(ctx)
	if !ok {
		log.Printf("trial-activation refund sweep: platform Stripe not configured, skipping %d subs", len(batch))
		return
	}

	for _, r := range batch {
		if err := stripeRefundPaymentIntent(ctx, secret, r.pi); err != nil {
			log.Printf("trial-activation refund: company %s pi %s: %v", r.companyID, r.pi, err)
			continue
		}
		if _, err := s.db.Exec(ctx, `
			UPDATE subscriptions
			   SET trial_activation_refunded_at = now(),
			       updated_at = now()
			 WHERE id::text = $1`, r.subID); err != nil {
			log.Printf("trial-activation refund: mark refunded for sub %s: %v", r.subID, err)
			continue
		}
		cid := r.companyID
		_ = s.recordSaasAudit(ctx, nil, "system", "trial_activation_refunded",
			"company", r.companyID, &cid,
			map[string]any{"payment_intent": r.pi, "reason": "5-day goodwill refund"}, "")
	}
}

// stripeRefundPaymentIntent refunds the full captured amount on the given
// PaymentIntent. Stripe returns 400 for already-refunded / already-fully-
// refunded PIs, which we treat as success so the sub falls out of the sweep.
func stripeRefundPaymentIntent(ctx context.Context, secret, pi string) error {
	form := url.Values{}
	form.Set("payment_intent", pi)
	form.Set("reason", "requested_by_customer")
	resp, err := stripeForm(ctx, secret, "POST", "https://api.stripe.com/v1/refunds", form)
	if err != nil {
		// Stripe's error body includes a code; if it's a double-refund,
		// treat it as done rather than looping.
		var env struct {
			Error struct {
				Code    string `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal(resp, &env) == nil {
			code := env.Error.Code
			if code == "charge_already_refunded" || code == "payment_intent_unexpected_state" {
				return nil
			}
		}
		return err
	}
	return nil
}
