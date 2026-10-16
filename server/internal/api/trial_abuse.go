package api

// Trial abuse prevention: one trial per email, one trial per real card/bank.
//
// Email: already enforced on company_owners.email (publicSignup checks
// duplicates upfront). This file hardens the second half — the payment
// instrument. Stripe gives us a stable `fingerprint` on every card and
// us_bank_account PaymentMethod that is identical across customers for the
// same real-world instrument. We record it the first time a trial activates
// and refuse any future signup that presents the same fingerprint.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

var ErrTrialAlreadyUsed = errors.New("trial already used for this payment method or email")

type stripePaymentMethod struct {
	ID            string `json:"id"`
	Type          string `json:"type"`
	Card          *struct{ Fingerprint string `json:"fingerprint"` } `json:"card"`
	USBankAccount *struct{ Fingerprint string `json:"fingerprint"` } `json:"us_bank_account"`
}

type stripePMList struct {
	Data []stripePaymentMethod `json:"data"`
}

// fetchCustomerPaymentFingerprint returns (fingerprint, pm_type) for the
// customer's default or first attached payment method. Empty on no card
// attached yet — caller decides whether to proceed.
func fetchCustomerPaymentFingerprint(ctx context.Context, secret, customerID string) (string, string, error) {
	if customerID == "" || secret == "" {
		return "", "", nil
	}
	for _, kind := range []string{"card", "us_bank_account"} {
		req, _ := http.NewRequestWithContext(ctx, "GET",
			"https://api.stripe.com/v1/customers/"+customerID+"/payment_methods?type="+kind+"&limit=1", nil)
		req.SetBasicAuth(secret, "")
		res, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
		if err != nil {
			return "", "", err
		}
		body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		res.Body.Close()
		if res.StatusCode >= 300 {
			return "", "", fmt.Errorf("stripe payment_methods %d: %s", res.StatusCode, snippet(body))
		}
		var list stripePMList
		if err := json.Unmarshal(body, &list); err != nil {
			return "", "", err
		}
		for _, pm := range list.Data {
			if pm.Card != nil && pm.Card.Fingerprint != "" {
				return pm.Card.Fingerprint, "card", nil
			}
			if pm.USBankAccount != nil && pm.USBankAccount.Fingerprint != "" {
				return pm.USBankAccount.Fingerprint, "us_bank_account", nil
			}
		}
	}
	return "", "", nil
}

// claimTrialPaymentFingerprint records the (fingerprint, company) pair and
// returns (allowed, firstCompanyID). allowed=false means this card/bank has
// already been used on a previous trial — the caller must block the signup.
func (s *Server) claimTrialPaymentFingerprint(ctx context.Context, fingerprint, pmType, companyID, email string) (bool, string, error) {
	if fingerprint == "" {
		// No fingerprint available — don't block (defensive; webhooks occasionally
		// arrive before the PaymentMethod is attached). Future runs of the
		// activation path will catch it.
		return true, "", nil
	}
	// INSERT ... ON CONFLICT DO NOTHING. If the row is new, we claim it.
	// If a row already exists for a different company, block.
	tag, err := s.db.Exec(ctx, `INSERT INTO trial_payment_fingerprints
		(fingerprint, pm_type, first_company_id, first_email)
		VALUES ($1, $2, $3::uuid, $4)
		ON CONFLICT (fingerprint) DO NOTHING`,
		fingerprint, pmType, companyID, email)
	if err != nil {
		return false, "", err
	}
	if tag.RowsAffected() == 1 {
		return true, companyID, nil
	}
	// Conflict — look up who owns it.
	var ownerID string
	_ = s.db.QueryRow(ctx, `SELECT coalesce(first_company_id::text,'')
		FROM trial_payment_fingerprints WHERE fingerprint = $1`, fingerprint).Scan(&ownerID)
	if ownerID == companyID {
		// Same company retrying — allow.
		return true, ownerID, nil
	}
	return false, ownerID, nil
}

// enforceTrialAbuse is called from activateSignupV2 after a Stripe customer
// is linked to a new signup. If the card/bank was already used on another
// shop, cancels the Stripe sub, suspends the new company, and returns
// ErrTrialAlreadyUsed so the caller can surface the message.
func (s *Server) enforceTrialAbuse(ctx context.Context, companyID, stripeCustomerID, stripeSubID string) error {
	if companyID == "" || stripeCustomerID == "" {
		return nil
	}
	secret, ok := s.platformStripeSecret(ctx)
	if !ok {
		return nil
	}
	fp, pmType, err := fetchCustomerPaymentFingerprint(ctx, secret, stripeCustomerID)
	if err != nil {
		log.Printf("trial-abuse: fingerprint lookup failed for %s: %v", companyID, err)
		return nil // never fail activation on a Stripe hiccup
	}
	if fp == "" {
		return nil
	}
	var ownerEmail string
	_ = s.db.QueryRow(ctx, `SELECT lower(email) FROM company_owners WHERE company_id::text = $1 LIMIT 1`, companyID).Scan(&ownerEmail)
	allowed, prevCompany, err := s.claimTrialPaymentFingerprint(ctx, fp, pmType, companyID, ownerEmail)
	if err != nil {
		log.Printf("trial-abuse: claim failed for %s: %v", companyID, err)
		return nil
	}
	if allowed {
		return nil
	}
	// Blocked. Cancel the Stripe subscription so the user is not charged after
	// the trial, then suspend the company and mark the sub as cancelled.
	if stripeSubID != "" {
		req, _ := http.NewRequestWithContext(ctx, "DELETE", "https://api.stripe.com/v1/subscriptions/"+stripeSubID, nil)
		req.SetBasicAuth(secret, "")
		res, derr := (&http.Client{Timeout: 15 * time.Second}).Do(req)
		if derr == nil {
			io.Copy(io.Discard, res.Body)
			res.Body.Close()
		}
	}
	_, _ = s.db.Exec(ctx, `UPDATE companies SET status='suspended', updated_at=now() WHERE id::text = $1`, companyID)
	_, _ = s.db.Exec(ctx, `UPDATE company_owners SET status='disabled', updated_at=now() WHERE company_id::text = $1`, companyID)
	_, _ = s.db.Exec(ctx, `UPDATE subscriptions
		SET status='cancelled',
		    notes = coalesce(notes,'') || E'\nBlocked: trial already used by company ' || $1,
		    updated_at = now()
		WHERE company_id::text = $2`, prevCompany, companyID)
	log.Printf("trial-abuse: blocked company %s — fingerprint already claimed by %s", companyID, prevCompany)
	return ErrTrialAlreadyUsed
}

