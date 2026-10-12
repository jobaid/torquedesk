package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
)

// ----------------------------------------------------------------------------
// Subscription renewal flow for expired / cancelled shops.
//
// When a shop can't log in because its subscription is expired/cancelled,
// the SaaS owner can send a renewal link to the shop's primary owner. The
// link points at either:
//   - a Stripe Billing Portal session (if the shop was previously linked
//     via setupBilling / signup — portal lets them update card + reactivate)
//   - the public /signup page prefilled with their current plan (if the
//     shop was never linked to Stripe or the customer was deleted)
//
// Once the shop manager pays through Stripe, the existing webhook /
// setupBillingSync path re-attaches the Stripe IDs and the company status
// goes back to active — no further admin action needed.
//
// A tiny ticker runs daily to auto-send once per expired shop so operators
// don't have to click a button for every renewal.
// ----------------------------------------------------------------------------

func (s *Server) renewalRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/owner/companies/{id}/send-renewal", s.ownerAuth(s.ownerSendRenewal))
}

func (s *Server) ownerSendRenewal(w http.ResponseWriter, r *http.Request) {
	cid := r.PathValue("id")
	u := userFrom(r.Context())
	link, email, companyName, err := s.buildRenewalMessage(r.Context(), cid)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if err := s.sendRenewalEmail(r.Context(), cid, email, companyName, link); err != nil {
		writeErr(w, 502, err.Error())
		return
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "renewal_email_sent", "company", cid, &cid,
		map[string]any{"to": email}, clientIP(r))
	writeJSON(w, 200, map[string]any{"ok": true, "sentTo": email})
}

// buildRenewalMessage resolves the right payment link + recipient for a
// company. Returns (link, email, companyName, err).
func (s *Server) buildRenewalMessage(ctx context.Context, cid string) (string, string, string, error) {
	var companyName, stripeCust, plan string
	if err := s.db.QueryRow(ctx, `SELECT c.name,
		coalesce(s.stripe_customer_id, ''), coalesce(s.plan, '')
		FROM companies c LEFT JOIN subscriptions s ON s.company_id = c.id
		WHERE c.id::text = $1`, cid).Scan(&companyName, &stripeCust, &plan); err != nil {
		return "", "", "", fmt.Errorf("company not found: %w", err)
	}
	email, _ := s.primaryOwnerEmail(ctx, cid)
	if email == "" {
		return "", "", "", fmt.Errorf("no primary owner email on file")
	}
	appOrigin := strings.TrimSpace(getEnv("APP_ORIGIN", "https://apps.2set.com"))
	// Preferred: Stripe Billing Portal if the shop was previously linked.
	if stripeCust != "" {
		if secret, ok := s.platformStripeSecret(ctx); ok {
			form := url.Values{}
			form.Set("customer", stripeCust)
			form.Set("return_url", appOrigin+"/settings/general/billing")
			if resp, err := stripeForm(ctx, secret, "POST", "https://api.stripe.com/v1/billing_portal/sessions", form); err == nil {
				var out struct {
					URL string `json:"url"`
				}
				if json.Unmarshal(resp, &out) == nil && out.URL != "" {
					return out.URL, email, companyName, nil
				}
			}
		}
	}
	// Fallback: public signup page prefilled with the plan.
	q := "plan=" + url.QueryEscape(plan)
	if plan == "" {
		q = "plan=professional"
	}
	return appOrigin + "/signup?" + q, email, companyName, nil
}

func (s *Server) sendRenewalEmail(ctx context.Context, cid, email, companyName, link string) error {
	fromName := s.platformFromName(ctx)
	subject := "Renew your " + companyName + " subscription to keep access"
	html := `<p>Hi,</p>
<p>Your TorqueDesk subscription for <strong>` + htmlEscape(companyName) + `</strong> has expired, so you can't sign in right now.</p>
<p>Pick up where you left off — click the button below to renew. Your shop data, customers, and documents are all preserved and come back online the moment payment goes through.</p>
<p><a href="` + htmlEscape(link) + `" style="display:inline-block;padding:12px 22px;background:#2a6cf0;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Renew subscription</a></p>
<p style="color:#6b7280;font-size:12px">Or copy and paste this link into your browser:<br>` + htmlEscape(link) + `</p>
<p>Questions? Just reply to this email.</p>`
	text := "Hi,\n\nYour TorqueDesk subscription for " + companyName + " has expired, so you can't sign in right now.\n\n" +
		"Pick up where you left off — renew here:\n\n" + link + "\n\nYour shop data is preserved and comes back online the moment payment goes through.\n\nQuestions? Just reply to this email.\n"
	today := time.Now().UTC().Format("2006-01-02")
	s.SendPlatformEmail(ctx, []string{email},
		subject,
		platformEmailShell(fromName, "Renew your TorqueDesk subscription", html, "You can also contact your TorqueDesk administrator for help."),
		text,
		"renewal", "renewal:"+cid+":"+today,
	)
	return nil
}

// ------------------------- auto-send ticker ---------------------------------

var renewalTickerOnce sync.Once

// StartRenewalTicker wakes once an hour, finds companies whose subscription
// end_date has passed and status is expired/cancelled, and emails the
// primary owner a renewal link. Dedup key limits to one email per shop
// per day — operators can also hit the manual button in between.
func (s *Server) StartRenewalTicker(ctx context.Context) {
	renewalTickerOnce.Do(func() {
		go func() {
			t := time.NewTicker(1 * time.Hour)
			defer t.Stop()
			s.runRenewalSweep(ctx)
			for {
				select {
				case <-ctx.Done():
					return
				case <-t.C:
					s.runRenewalSweep(ctx)
				}
			}
		}()
	})
}

func (s *Server) runRenewalSweep(ctx context.Context) {
	rows, err := s.db.Query(ctx, `SELECT c.id::text FROM companies c
		JOIN subscriptions s ON s.company_id = c.id
		WHERE c.status IN ('expired', 'cancelled')
		  AND s.end_date IS NOT NULL
		  AND s.end_date < now()
		  AND s.end_date > now() - interval '60 days'`)
	if err != nil {
		return
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	for _, cid := range ids {
		link, email, name, err := s.buildRenewalMessage(ctx, cid)
		if err != nil || email == "" {
			continue
		}
		if err := s.sendRenewalEmail(ctx, cid, email, name, link); err != nil {
			log.Printf("renewal email failed for %s: %v", cid, err)
			continue
		}
		_ = s.recordSaasAudit(ctx, nil, "system", "renewal_email_auto", "company", cid, &cid, map[string]any{"to": email}, "")
	}
}

func getEnv(k, def string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return def
}

var _ = pgx.ErrNoRows // keep pgx import for future queries