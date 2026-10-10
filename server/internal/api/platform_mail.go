package api

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

// ----------------------------------------------------------------------------
// Platform (SaaS owner) outbound email.
//
// This is a SEPARATE mailer from the per-tenant notification_settings used by
// shops to email their customers. It represents the SaaS vendor's own sender
// identity (noreply@torquedesk.com, support@torquedesk.com, etc.) and is used
// to notify shop owners when platform-level events happen: new shop created,
// company suspended/reactivated, subscription renewed, subscription expiring.
//
// Config lives in platform_mail_settings (singleton row). Password is stored
// AES-GCM encrypted with TORQUEDESK_SECRET_KEY. All endpoints are
// SaaS-owner-only (role=saas_owner). Shop owners cannot read or write these.
// ----------------------------------------------------------------------------

type platformMailDTO struct {
	Enabled              bool   `json:"enabled"`
	SMTPHost             string `json:"smtpHost"`
	SMTPPort             int    `json:"smtpPort"`
	SMTPUser             string `json:"smtpUser"`
	SMTPUseTLS           bool   `json:"smtpUseTLS"`
	HasPassword          bool   `json:"hasPassword"`
	FromEmail            string `json:"fromEmail"`
	FromName             string `json:"fromName"`
	ReplyTo              string `json:"replyTo"`
	NotifyNewCompany     bool   `json:"notifyNewCompany"`
	NotifyStatusChange   bool   `json:"notifyStatusChange"`
	NotifySubscription   bool   `json:"notifySubscription"`
	UpdatedAt            int64  `json:"updatedAt"`
}

type platformMailPatch struct {
	Enabled              *bool   `json:"enabled"`
	SMTPHost             *string `json:"smtpHost"`
	SMTPPort             *int    `json:"smtpPort"`
	SMTPUser             *string `json:"smtpUser"`
	SMTPPassword         *string `json:"smtpPassword"`
	ClearPassword        bool    `json:"clearPassword"`
	SMTPUseTLS           *bool   `json:"smtpUseTLS"`
	FromEmail            *string `json:"fromEmail"`
	FromName             *string `json:"fromName"`
	ReplyTo              *string `json:"replyTo"`
	NotifyNewCompany     *bool   `json:"notifyNewCompany"`
	NotifyStatusChange   *bool   `json:"notifyStatusChange"`
	NotifySubscription   *bool   `json:"notifySubscription"`
}

const platformMailCols = `enabled, smtp_host, smtp_port, smtp_user, smtp_password_enc, smtp_use_tls,
	from_email, from_name, reply_to,
	notify_new_company, notify_status_change, notify_subscription, updated_at`

func (s *Server) platformMailRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/owner/mail", s.ownerAuth(s.getPlatformMail))
	mux.HandleFunc("PUT /api/owner/mail", s.ownerAuth(s.updatePlatformMail))
	mux.HandleFunc("POST /api/owner/mail/test", s.ownerAuth(s.testPlatformMail))
}

func (s *Server) scanPlatformMail(ctx context.Context) (platformMailDTO, []byte, error) {
	// Seed defensive singleton if the migration didn't run yet.
	_, _ = s.db.Exec(ctx, `INSERT INTO platform_mail_settings (singleton) VALUES (true) ON CONFLICT DO NOTHING`)
	var dto platformMailDTO
	var pw []byte
	var updated time.Time
	err := s.db.QueryRow(ctx, `SELECT `+platformMailCols+` FROM platform_mail_settings WHERE singleton = true`).
		Scan(&dto.Enabled, &dto.SMTPHost, &dto.SMTPPort, &dto.SMTPUser, &pw, &dto.SMTPUseTLS,
			&dto.FromEmail, &dto.FromName, &dto.ReplyTo,
			&dto.NotifyNewCompany, &dto.NotifyStatusChange, &dto.NotifySubscription, &updated)
	if err != nil {
		return dto, nil, err
	}
	dto.HasPassword = len(pw) > 0
	dto.UpdatedAt = updated.UnixMilli()
	return dto, pw, nil
}

func (s *Server) getPlatformMail(w http.ResponseWriter, r *http.Request) {
	dto, _, err := s.scanPlatformMail(r.Context())
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, dto)
}

func (s *Server) updatePlatformMail(w http.ResponseWriter, r *http.Request) {
	var p platformMailPatch
	if err := readJSON(r, &p); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	sets, args := []string{"updated_at = now()"}, []any{}
	add := func(col string, v any) { args = append(args, v); sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args))) }
	if p.Enabled != nil {
		add("enabled", *p.Enabled)
	}
	if p.SMTPHost != nil {
		add("smtp_host", strings.TrimSpace(*p.SMTPHost))
	}
	if p.SMTPPort != nil {
		if *p.SMTPPort < 1 || *p.SMTPPort > 65535 {
			writeErr(w, 400, "Port must be between 1 and 65535.")
			return
		}
		add("smtp_port", *p.SMTPPort)
	}
	if p.SMTPUser != nil {
		add("smtp_user", strings.TrimSpace(*p.SMTPUser))
	}
	if p.SMTPUseTLS != nil {
		add("smtp_use_tls", *p.SMTPUseTLS)
	}
	if p.FromEmail != nil {
		add("from_email", strings.TrimSpace(*p.FromEmail))
	}
	if p.FromName != nil {
		add("from_name", strings.TrimSpace(*p.FromName))
	}
	if p.ReplyTo != nil {
		add("reply_to", strings.TrimSpace(*p.ReplyTo))
	}
	if p.NotifyNewCompany != nil {
		add("notify_new_company", *p.NotifyNewCompany)
	}
	if p.NotifyStatusChange != nil {
		add("notify_status_change", *p.NotifyStatusChange)
	}
	if p.NotifySubscription != nil {
		add("notify_subscription", *p.NotifySubscription)
	}
	if p.ClearPassword {
		add("smtp_password_enc", nil)
	} else if p.SMTPPassword != nil && strings.TrimSpace(*p.SMTPPassword) != "" {
		key, err := LoadDataKey(s.secret)
		if err != nil {
			handleErr(w, err)
			return
		}
		enc, err := Encrypt(key, []byte(strings.TrimSpace(*p.SMTPPassword)))
		if err != nil {
			handleErr(w, err)
			return
		}
		add("smtp_password_enc", enc)
	}
	if len(sets) == 1 {
		writeErr(w, 400, "Nothing to update.")
		return
	}
	if _, err := s.db.Exec(r.Context(),
		fmt.Sprintf("UPDATE platform_mail_settings SET %s WHERE singleton = true", strings.Join(sets, ", ")),
		args...); err != nil {
		handleErr(w, err)
		return
	}
	s.getPlatformMail(w, r)
}

type platformTestReq struct {
	To string `json:"to"`
}

func (s *Server) testPlatformMail(w http.ResponseWriter, r *http.Request) {
	var in platformTestReq
	_ = readJSON(r, &in)
	in.To = strings.TrimSpace(in.To)
	if in.To == "" {
		writeErr(w, 400, "Enter a recipient email.")
		return
	}
	m, pw, err := s.loadPlatformMailer(r.Context())
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	err = m.send(pw, []string{in.To}, "TorqueDesk platform test email",
		"<p>This is a test email from the TorqueDesk platform mailer. If you received this, platform-level emails to shop owners are configured correctly.</p>",
		"This is a test email from the TorqueDesk platform mailer.\n")
	if err != nil {
		writeErr(w, 502, "Could not send: "+err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// loadPlatformMailer returns the platform mailer configuration and decrypted
// password. Returns an error if the platform mailer is not enabled or
// configured — callers should treat that as "skip the send" rather than fail
// the originating request.
func (s *Server) loadPlatformMailer(ctx context.Context) (mailer, string, error) {
	dto, pwBlob, err := s.scanPlatformMail(ctx)
	if err != nil {
		return mailer{}, "", err
	}
	if !dto.Enabled {
		return mailer{}, "", errors.New("platform mailer is disabled")
	}
	if dto.SMTPHost == "" || dto.FromEmail == "" {
		return mailer{}, "", errors.New("SMTP host and From address are required")
	}
	pw := ""
	if len(pwBlob) > 0 {
		key, err := LoadDataKey(s.secret)
		if err != nil {
			return mailer{}, "", err
		}
		pw, err = Decrypt(key, pwBlob)
		if err != nil {
			return mailer{}, "", err
		}
	}
	return mailer{
		Host: dto.SMTPHost, Port: dto.SMTPPort, User: dto.SMTPUser,
		FromEmail: dto.FromEmail, FromName: dto.FromName, ReplyTo: dto.ReplyTo,
		UseTLS: dto.SMTPUseTLS,
	}, pw, nil
}

// SendPlatformEmail is the public helper the owner-side flows call. It
// enqueues one email_jobs row per recipient; the background worker handles
// the actual send with retries. If the platform mailer is disabled it still
// enqueues — the worker will mark the attempt failed and surface it in the
// delivery log. kind/dedupeKey/related* are optional context passed through
// to the job row.
func (s *Server) SendPlatformEmail(ctx context.Context, to []string, subject, htmlBody, textBody, kind, dedupeKey string) {
	if len(to) == 0 {
		return
	}
	for _, addr := range to {
		dk := dedupeKey
		if dk != "" && len(to) > 1 {
			dk = dedupeKey + ":" + addr
		}
		if _, err := s.enqueueEmail(ctx, emailEnqueue{
			Scope: "platform", To: addr,
			Subject: subject, HTML: htmlBody, Text: textBody,
			Kind: kind, DedupeKey: dk,
		}); err != nil {
			log.Printf("platform mail enqueue failed (%s → %s): %v", subject, addr, err)
		}
	}
}

// shouldSend returns true when the platform mailer is enabled AND the named
// notification toggle is on.
func (s *Server) platformNotifyEnabled(ctx context.Context, kind string) bool {
	dto, _, err := s.scanPlatformMail(ctx)
	if err != nil || !dto.Enabled {
		return false
	}
	switch kind {
	case "new_company":
		return dto.NotifyNewCompany
	case "status_change":
		return dto.NotifyStatusChange
	case "subscription":
		return dto.NotifySubscription
	}
	return false
}

// --------------------------- transactional templates -----------------------

// platformEmailShell wraps the body in a branded HTML frame.
func platformEmailShell(fromName, title, body, footerNote string) string {
	if fromName == "" {
		fromName = "TorqueDesk"
	}
	var b strings.Builder
	b.WriteString(`<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111">`)
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0"><tr><td align="center">`)
	b.WriteString(`<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)">`)
	b.WriteString(`<tr><td style="padding:22px 28px;background:linear-gradient(90deg,#2a6cf0,#5b8def);color:#fff;font-size:18px;font-weight:700">`)
	b.WriteString(htmlEscape(fromName))
	b.WriteString(`</td></tr>`)
	b.WriteString(`<tr><td style="padding:28px">`)
	b.WriteString(`<div style="font-size:17px;font-weight:700;margin:0 0 12px">` + htmlEscape(title) + `</div>`)
	b.WriteString(`<div style="font-size:14px;line-height:1.55;color:#333">` + body + `</div>`)
	b.WriteString(`</td></tr>`)
	if footerNote != "" {
		b.WriteString(`<tr><td style="padding:14px 28px;background:#fafafa;border-top:1px solid #eee;font-size:11px;color:#666">` + htmlEscape(footerNote) + `</td></tr>`)
	}
	b.WriteString(`</table></td></tr></table></body></html>`)
	return b.String()
}

// NotifyCompanyCreated fires when a SaaS admin creates a new shop account.
func (s *Server) NotifyCompanyCreated(ctx context.Context, ownerEmail, ownerName, companyName, applicationURL string) {
	if ownerEmail == "" || !s.platformNotifyEnabled(ctx, "new_company") {
		return
	}
	fromName := s.platformFromName(ctx)
	hello := strings.TrimSpace(ownerName)
	if hello == "" {
		hello = "there"
	}
	vars := map[string]string{
		"owner_name":      htmlEscape(hello),
		"company_name":    htmlEscape(companyName),
		"application_url": htmlEscape(strings.TrimSpace(applicationURL)),
		"from_name":       htmlEscape(fromName),
	}
	subject, html, text := s.renderTemplate(ctx, "platform", "", "welcome", vars)
	s.SendPlatformEmail(ctx, []string{ownerEmail},
		subject,
		platformEmailShell(fromName, "Welcome to TorqueDesk", html, "You are receiving this because your shop was just activated on TorqueDesk."),
		text,
		"welcome", "welcome:"+strings.ToLower(ownerEmail),
	)
}

// NotifyCompanyStatusChange fires when a company moves between
// active/suspended/expired/cancelled/reactivated.
func (s *Server) NotifyCompanyStatusChange(ctx context.Context, ownerEmail, companyName, newStatus, reason string) {
	if ownerEmail == "" || !s.platformNotifyEnabled(ctx, "status_change") {
		return
	}
	fromName := s.platformFromName(ctx)
	phrase := map[string]string{
		"active":    "has been reactivated and is now live again",
		"trial":     "has been returned to trial status",
		"suspended": "has been suspended",
		"expired":   "has expired",
		"cancelled": "has been cancelled",
	}[newStatus]
	if phrase == "" {
		phrase = "has had its status changed to " + newStatus
	}
	vars := map[string]string{
		"company_name":  htmlEscape(companyName),
		"status":        htmlEscape(newStatus),
		"status_phrase": htmlEscape(phrase),
		"reason":        htmlEscape(strings.TrimSpace(reason)),
	}
	subject, html, text := s.renderTemplate(ctx, "platform", "", "status_change", vars)
	s.SendPlatformEmail(ctx, []string{ownerEmail},
		subject,
		platformEmailShell(fromName, "Account status updated", html, ""),
		text,
		"status_change", "",
	)
}

// NotifySubscriptionChange covers plan upgrades, renewals, and expirations.
// kind is a short label (renewed, extended, expiring_soon, expired, plan_changed).
func (s *Server) NotifySubscriptionChange(ctx context.Context, ownerEmail, companyName, kind string, details map[string]string) {
	if ownerEmail == "" || !s.platformNotifyEnabled(ctx, "subscription") {
		return
	}
	fromName := s.platformFromName(ctx)
	title := "Subscription update"
	intro := "Your TorqueDesk subscription for <strong>" + htmlEscape(companyName) + "</strong> was updated."
	switch kind {
	case "renewed":
		title = "Subscription renewed"
		intro = "Your TorqueDesk subscription for <strong>" + htmlEscape(companyName) + "</strong> has been renewed."
	case "extended":
		title = "Subscription extended"
		intro = "Your TorqueDesk subscription for <strong>" + htmlEscape(companyName) + "</strong> has been extended."
	case "expiring_soon":
		title = "Subscription expiring soon"
		intro = "Your TorqueDesk subscription for <strong>" + htmlEscape(companyName) + "</strong> is about to expire."
	case "expired":
		title = "Subscription expired"
		intro = "Your TorqueDesk subscription for <strong>" + htmlEscape(companyName) + "</strong> has expired."
	case "plan_changed":
		title = "Subscription plan changed"
		intro = "Your TorqueDesk subscription plan for <strong>" + htmlEscape(companyName) + "</strong> has been changed."
	case "trial_set":
		title = "Trial period started"
		intro = "Your TorqueDesk subscription for <strong>" + htmlEscape(companyName) + "</strong> has been placed into a trial period."
	case "pending_set":
		title = "Subscription pending"
		intro = "Your TorqueDesk subscription for <strong>" + htmlEscape(companyName) + "</strong> is now pending — the TorqueDesk team is reviewing the account."
	case "suspended_set":
		title = "Subscription suspended"
		intro = "Your TorqueDesk subscription for <strong>" + htmlEscape(companyName) + "</strong> has been suspended. Contact support for details."
	case "cancelled_set":
		title = "Subscription cancelled"
		intro = "Your TorqueDesk subscription for <strong>" + htmlEscape(companyName) + "</strong> has been cancelled."
	}
	var rows strings.Builder
	for _, k := range []string{"plan", "billingCycle", "endDate", "monthlyPrice", "annualPrice"} {
		if v, ok := details[k]; ok && v != "" {
			rows.WriteString(`<tr><td style="padding:4px 10px 4px 0;color:#666;font-size:12px">` + htmlEscape(k) + `</td><td style="padding:4px 0;font-size:13px"><strong>` + htmlEscape(v) + `</strong></td></tr>`)
		}
	}
	table := ""
	if rows.Len() > 0 {
		table = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 4px">` + rows.String() + `</table>`
	}
	vars := map[string]string{
		"company_name": htmlEscape(companyName),
		"title":        htmlEscape(title),
		"intro":        intro,
		"detail_table": table,
	}
	subject, html, text := s.renderTemplate(ctx, "platform", "", "subscription", vars)
	s.SendPlatformEmail(ctx, []string{ownerEmail},
		subject,
		platformEmailShell(fromName, title, html, ""),
		text,
		"subscription_"+kind, "",
	)
}

func (s *Server) platformFromName(ctx context.Context) string {
	dto, _, err := s.scanPlatformMail(ctx)
	if err != nil || dto.FromName == "" {
		return "TorqueDesk"
	}
	return dto.FromName
}

// primaryOwnerEmail returns the first active owner's email for a company, or
// empty if none. Used by platform notifications to pick a recipient.
func (s *Server) primaryOwnerEmail(ctx context.Context, companyID string) (email, name string) {
	_ = s.db.QueryRow(ctx, `SELECT lower(email), trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
		FROM company_owners
		WHERE company_id::text = $1 AND status = 'active'
		ORDER BY created_at ASC LIMIT 1`, companyID).Scan(&email, &name)
	return
}
