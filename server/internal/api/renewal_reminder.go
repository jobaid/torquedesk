package api

import (
	"context"
	"log"
	"sync"
	"time"
)

// ----------------------------------------------------------------------------
// Pre-expiry renewal reminder.
//
// Sends a heads-up email 7 days before each active subscription's end_date so
// the shop manager can update their card / confirm renewal before access cuts
// out. Dedup key is per-shop-per-anchor-date so the same shop can't get
// multiple reminders in the same 7-day window.
//
// Pairs with StartRenewalTicker (which handles AFTER expiry).
// ----------------------------------------------------------------------------

const renewalReminderDays = 7

var renewalReminderOnce sync.Once

// StartRenewalReminderTicker sweeps once an hour for subscriptions whose
// end_date is ~7 days away and sends a reminder email.
func (s *Server) StartRenewalReminderTicker(ctx context.Context) {
	renewalReminderOnce.Do(func() {
		go func() {
			// First sweep 2 minutes after boot so a fresh deploy catches
			// anything that rolled into the 7-day window during downtime.
			time.Sleep(2 * time.Minute)
			t := time.NewTicker(1 * time.Hour)
			defer t.Stop()
			s.runRenewalReminderSweep(ctx)
			for {
				select {
				case <-ctx.Done():
					return
				case <-t.C:
					s.runRenewalReminderSweep(ctx)
				}
			}
		}()
	})
}

func (s *Server) runRenewalReminderSweep(ctx context.Context) {
	// Active / trial subs whose end_date is in the (7±1) day window.
	rows, err := s.db.Query(ctx, `
		SELECT c.id::text, c.name, s.end_date, s.plan, s.monthly_price::text
		  FROM companies c
		  JOIN subscriptions s ON s.company_id = c.id
		 WHERE c.status IN ('active', 'trial')
		   AND s.end_date IS NOT NULL
		   AND s.end_date::date BETWEEN current_date + 6 AND current_date + 8
		   AND s.auto_renewal = true`)
	if err != nil {
		log.Printf("renewal reminder sweep: query: %v", err)
		return
	}
	defer rows.Close()

	type row struct {
		cid, name, plan, price string
		endDate                time.Time
	}
	var pending []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.cid, &r.name, &r.endDate, &r.plan, &r.price); err == nil {
			pending = append(pending, r)
		}
	}

	for _, p := range pending {
		email, _ := s.primaryOwnerEmail(ctx, p.cid)
		if email == "" {
			continue
		}
		dueOn := p.endDate.Format("January 2, 2006")
		dedupe := "renewal_reminder:" + p.cid + ":" + p.endDate.Format("2006-01-02")

		subject := "Your " + p.name + " subscription renews in " + humanDaysUntil(p.endDate)
		htmlBody := `<p>Hi,</p>
<p>A quick heads-up: your <strong>` + htmlEscape(p.name) + `</strong> Fixora subscription (` +
			htmlEscape(p.plan) + ` plan) renews on <strong>` + dueOn + `</strong> ` +
			`(in ` + humanDaysUntil(p.endDate) + `).</p>` +
			`<p>If your saved card is up to date, there's nothing to do &mdash; Stripe will bill and email you the invoice automatically. ` +
			`If you need to update your card or review your plan, use the button below.</p>` +
			`<p><a href="https://my.fixoraerp.com/settings/general/billing" ` +
			`style="display:inline-block;padding:12px 22px;background:#f58220;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">` +
			`Manage billing</a></p>` +
			`<p style="color:#6b7280;font-size:12px">Questions? Just reply to this email.</p>`
		textBody := "Hi,\n\nA quick heads-up: your " + p.name + " Fixora subscription (" + p.plan + " plan) " +
			"renews on " + dueOn + " (in " + humanDaysUntil(p.endDate) + ").\n\n" +
			"If your saved card is up to date, there's nothing to do — Stripe will bill and email you the invoice automatically.\n\n" +
			"Need to update your card or review your plan? Open:\n" +
			"https://my.fixoraerp.com/settings/general/billing\n\n" +
			"Questions? Just reply to this email.\n"

		s.SendPlatformEmail(ctx, []string{email},
			subject,
			platformEmailShell(s.platformFromName(ctx), "Renewal reminder", htmlBody,
				"You're receiving this because your subscription renews soon."),
			textBody,
			"renewal_reminder", dedupe,
		)
		_ = s.recordSaasAudit(ctx, nil, "system", "renewal_reminder_sent", "company", p.cid, &p.cid,
			map[string]any{"to": email, "end_date": p.endDate.Format("2006-01-02")}, "")
	}
}

// humanDaysUntil renders "in 7 days", "tomorrow", "in a few hours" — short
// strings for email copy.
func humanDaysUntil(t time.Time) string {
	d := int(time.Until(t).Hours() / 24)
	switch {
	case d <= 0:
		return "less than a day"
	case d == 1:
		return "1 day"
	default:
		return fmtInt(d) + " days"
	}
}

func fmtInt(i int) string {
	if i < 0 {
		return "0"
	}
	// Small helper to avoid pulling strconv here — numbers are always tiny.
	return int2a(i)
}

func int2a(i int) string {
	if i == 0 {
		return "0"
	}
	var buf [20]byte
	pos := len(buf)
	for i > 0 {
		pos--
		buf[pos] = byte('0' + i%10)
		i /= 10
	}
	return string(buf[pos:])
}
