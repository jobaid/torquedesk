package api

// Session D: outbound customer reminder emails + authorization expiration job.
//
// A single background goroutine wakes every 5 minutes and does two things:
//   1. Flip pending/viewed authorizations whose expires_at has passed to
//      status 'expired' and append an audit event.
//   2. For each company with reminders enabled, find authorizations that are
//      still pending/viewed, requested more than reminder_days ago, and
//      haven't been reminded yet. Send one reminder email with the share link
//      and record reminder_sent_at.
//
// SMTP is a per-tenant setting. If a tenant hasn't configured SMTP, their
// reminders are silently skipped — never fall back to another tenant's
// credentials.
//
// Shop-facing settings endpoints (POST/GET) + a 'send a test email' button
// are also here so the Settings UI stays simple.

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/smtp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
)

func (s *Server) notificationRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/settings/notifications", s.auth("settings.view", s.getNotifSettings))
	mux.HandleFunc("PUT /api/settings/notifications", s.auth("shop.edit", s.updateNotifSettings))
	mux.HandleFunc("POST /api/settings/notifications/test", s.auth("shop.edit", s.sendTestEmail))
	// Generic authed send endpoint. Any shop user with documents.edit can send
	// a short email through the tenant's configured SMTP (used by Share link
	// modals, invoice email, inspection email, etc.).
	mux.HandleFunc("POST /api/mail/send", s.auth("documents.edit", s.mailSend))
}

type mailSendReq struct {
	To      string `json:"to"`
	Subject string `json:"subject"`
	HTML    string `json:"html"`
	Text    string `json:"text"`
}

func (s *Server) mailSend(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	var in mailSendReq
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	in.To = strings.TrimSpace(in.To)
	if in.To == "" {
		writeErr(w, 400, "Enter a recipient email.")
		return
	}
	if strings.TrimSpace(in.Subject) == "" {
		writeErr(w, 400, "Subject is required.")
		return
	}
	if strings.TrimSpace(in.HTML) == "" && strings.TrimSpace(in.Text) == "" {
		writeErr(w, 400, "Message body is empty.")
		return
	}
	// Guard against runaway size.
	if len(in.HTML) > 200000 || len(in.Text) > 200000 {
		writeErr(w, 413, "Message is too large.")
		return
	}
	cfg, pw, err := s.loadMailer(r.Context(), cid)
	if err != nil {
		writeErr(w, 400, "Email is not configured for this shop. Set it up in Settings → Notifications.")
		return
	}
	text := in.Text
	if text == "" {
		text = "Please view this message in an HTML-capable email client."
	}
	html := in.HTML
	if html == "" {
		html = "<pre style=\"font: 13px/1.5 -apple-system,BlinkMacSystemFont,sans-serif\">" + htmlEscape(in.Text) + "</pre>"
	}
	if err := cfg.send(pw, []string{in.To}, in.Subject, html, text); err != nil {
		writeErr(w, 502, "Could not send: "+err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func htmlEscape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;", "'", "&#39;")
	return r.Replace(s)
}

type notifSettingsDTO struct {
	SMTPHost         string `json:"smtpHost"`
	SMTPPort         int    `json:"smtpPort"`
	SMTPUser         string `json:"smtpUser"`
	SMTPUseTLS       bool   `json:"smtpUseTLS"`
	HasPassword      bool   `json:"hasPassword"`
	FromEmail        string `json:"fromEmail"`
	FromName         string `json:"fromName"`
	ReplyTo          string `json:"replyTo"`
	RemindersEnabled bool   `json:"remindersEnabled"`
	ReminderDays     int    `json:"reminderDays"`
	UpdatedAt        int64  `json:"updatedAt"`
}

type notifSettingsPatch struct {
	SMTPHost         *string `json:"smtpHost"`
	SMTPPort         *int    `json:"smtpPort"`
	SMTPUser         *string `json:"smtpUser"`
	SMTPPassword     *string `json:"smtpPassword"` // empty = keep stored
	ClearPassword    bool    `json:"clearPassword"`
	SMTPUseTLS       *bool   `json:"smtpUseTLS"`
	FromEmail        *string `json:"fromEmail"`
	FromName         *string `json:"fromName"`
	ReplyTo          *string `json:"replyTo"`
	RemindersEnabled *bool   `json:"remindersEnabled"`
	ReminderDays     *int    `json:"reminderDays"`
}

func scanNotif(row pgx.Row) (notifSettingsDTO, []byte, error) {
	var dto notifSettingsDTO
	var pw []byte
	var updated time.Time
	err := row.Scan(&dto.SMTPHost, &dto.SMTPPort, &dto.SMTPUser, &pw, &dto.SMTPUseTLS,
		&dto.FromEmail, &dto.FromName, &dto.ReplyTo, &dto.RemindersEnabled, &dto.ReminderDays, &updated)
	if err != nil {
		return dto, nil, err
	}
	dto.HasPassword = len(pw) > 0
	dto.UpdatedAt = updated.UnixMilli()
	return dto, pw, nil
}

const notifCols = `smtp_host, smtp_port, smtp_user, smtp_password_enc, smtp_use_tls,
	from_email, from_name, reply_to, reminders_enabled, reminder_days, updated_at`

func (s *Server) getNotifSettings(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	// Seed row if missing (defence in depth; the migration already seeds).
	_, _ = s.db.Exec(r.Context(), `INSERT INTO notification_settings (company_id) VALUES ($1::uuid) ON CONFLICT DO NOTHING`, cid)
	dto, _, err := scanNotif(s.db.QueryRow(r.Context(), `SELECT `+notifCols+` FROM notification_settings WHERE company_id::text = $1`, cid))
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, dto)
}

func (s *Server) updateNotifSettings(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	var p notifSettingsPatch
	if err := readJSON(r, &p); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	_, existingPW, _ := scanNotif(s.db.QueryRow(r.Context(), `SELECT `+notifCols+` FROM notification_settings WHERE company_id::text = $1`, cid))
	sets, args := []string{"updated_at = now()"}, []any{}
	add := func(col string, v any) { args = append(args, v); sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args))) }
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
	if p.RemindersEnabled != nil {
		add("reminders_enabled", *p.RemindersEnabled)
	}
	if p.ReminderDays != nil {
		if *p.ReminderDays < 1 || *p.ReminderDays > 60 {
			writeErr(w, 400, "Reminder days must be between 1 and 60.")
			return
		}
		add("reminder_days", *p.ReminderDays)
	}
	// Password: blank = keep existing, non-blank = replace, clearPassword = wipe.
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
	} else {
		// Keep existing (no-op); referenced here only to suppress unused warning on existingPW.
		_ = existingPW
	}
	if len(sets) == 1 {
		writeErr(w, 400, "Nothing to update.")
		return
	}
	args = append(args, cid)
	if _, err := s.db.Exec(r.Context(),
		fmt.Sprintf("UPDATE notification_settings SET %s WHERE company_id::text = $%d", strings.Join(sets, ", "), len(args)),
		args...); err != nil {
		handleErr(w, err)
		return
	}
	s.getNotifSettings(w, r)
}

type testEmailReq struct {
	To string `json:"to"`
}

func (s *Server) sendTestEmail(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	var in testEmailReq
	_ = readJSON(r, &in)
	in.To = strings.TrimSpace(in.To)
	if in.To == "" {
		writeErr(w, 400, "Enter a recipient email.")
		return
	}
	cfg, pw, err := s.loadMailer(r.Context(), cid)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	err = cfg.send(pw, []string{in.To}, "TorqueDesk test email",
		"<p>This is a test email from your TorqueDesk notification settings. If you received this, SMTP is working correctly.</p>",
		"This is a test email from your TorqueDesk notification settings. If you received this, SMTP is working correctly.\n")
	if err != nil {
		writeErr(w, 502, "Could not send: "+err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// --------------------------- mailer struct ----------------------------------

type mailer struct {
	Host, User, FromEmail, FromName, ReplyTo string
	Port                                     int
	UseTLS                                   bool
}

func (s *Server) loadMailer(ctx context.Context, cid string) (mailer, string, error) {
	dto, pwBlob, err := scanNotif(s.db.QueryRow(ctx, `SELECT `+notifCols+` FROM notification_settings WHERE company_id::text = $1`, cid))
	if err != nil {
		return mailer{}, "", err
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

// send is deliberately dependency-free: net/smtp from stdlib. Supports STARTTLS
// (default) and plain. Does NOT support DKIM signing — rely on the SMTP
// provider's own DKIM (SendGrid, SES, Postmark all sign for you).
func (m mailer) send(password string, to []string, subject, htmlBody, textBody string) error {
	addr := fmt.Sprintf("%s:%d", m.Host, m.Port)
	from := m.FromEmail
	if m.FromName != "" {
		from = fmt.Sprintf("%s <%s>", m.FromName, m.FromEmail)
	}
	headers := map[string]string{
		"From":         from,
		"To":           strings.Join(to, ", "),
		"Subject":      subject,
		"MIME-Version": "1.0",
	}
	if m.ReplyTo != "" {
		headers["Reply-To"] = m.ReplyTo
	}
	boundary := "===torquedesk_" + strconv.FormatInt(time.Now().UnixNano(), 36) + "==="
	headers["Content-Type"] = `multipart/alternative; boundary="` + boundary + `"`
	var b strings.Builder
	for k, v := range headers {
		b.WriteString(k + ": " + v + "\r\n")
	}
	b.WriteString("\r\n")
	b.WriteString("--" + boundary + "\r\n")
	b.WriteString("Content-Type: text/plain; charset=UTF-8\r\n\r\n")
	b.WriteString(textBody)
	b.WriteString("\r\n--" + boundary + "\r\n")
	b.WriteString("Content-Type: text/html; charset=UTF-8\r\n\r\n")
	b.WriteString(htmlBody)
	b.WriteString("\r\n--" + boundary + "--\r\n")

	var auth smtp.Auth
	if m.User != "" && password != "" {
		auth = smtp.PlainAuth("", m.User, password, m.Host)
	}
	if m.UseTLS {
		// Dial, STARTTLS and send. net/smtp doesn't have a one-shot helper.
		c, err := smtp.Dial(addr)
		if err != nil {
			return err
		}
		defer c.Close()
		if err := c.StartTLS(&tls.Config{ServerName: m.Host, MinVersion: tls.VersionTLS12}); err != nil {
			return err
		}
		if auth != nil {
			if err := c.Auth(auth); err != nil {
				return err
			}
		}
		if err := c.Mail(m.FromEmail); err != nil {
			return err
		}
		for _, r := range to {
			if err := c.Rcpt(r); err != nil {
				return err
			}
		}
		wc, err := c.Data()
		if err != nil {
			return err
		}
		if _, err := wc.Write([]byte(b.String())); err != nil {
			return err
		}
		if err := wc.Close(); err != nil {
			return err
		}
		return c.Quit()
	}
	return smtp.SendMail(addr, auth, m.FromEmail, to, []byte(b.String()))
}

// --------------------------- ticker + reminders -----------------------------

var tickerOnce sync.Once

// StartNotificationTicker wakes every 5 minutes to expire past-due
// authorizations and send pending reminders. Safe to call multiple times —
// subsequent calls are no-ops. Dies with the process (fine for single-
// instance deployments; swap for a cron / leader election later).
func (s *Server) StartNotificationTicker(ctx context.Context) {
	tickerOnce.Do(func() {
		go func() {
			t := time.NewTicker(5 * time.Minute)
			defer t.Stop()
			// Fire once immediately on boot so a long-dead ticker catches up.
			s.runNotificationTick(ctx)
			for {
				select {
				case <-ctx.Done():
					return
				case <-t.C:
					s.runNotificationTick(ctx)
				}
			}
		}()
	})
}

func (s *Server) runNotificationTick(ctx context.Context) {
	// 1. Flip expired.
	rows, err := s.db.Query(ctx, `SELECT id::text, document_id::text, company_id::text
		FROM document_authorizations
		WHERE status IN ('pending','viewed') AND expires_at IS NOT NULL AND expires_at < now()`)
	if err == nil {
		type exp struct{ id, doc, cid string }
		var exps []exp
		for rows.Next() {
			var e exp
			if err := rows.Scan(&e.id, &e.doc, &e.cid); err == nil {
				exps = append(exps, e)
			}
		}
		rows.Close()
		for _, e := range exps {
			_ = s.tx(ctx, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `UPDATE document_authorizations
					SET status = 'expired', updated_at = now() WHERE id::text = $1 AND status IN ('pending','viewed')`, e.id); err != nil {
					return err
				}
				_, err := tx.Exec(ctx, `INSERT INTO document_auth_events
					(authorization_id, document_id, company_id, kind, actor_role, note)
					VALUES ($1::uuid, $2::uuid, $3::uuid, 'expired', 'system', 'reached expiration date')`,
					e.id, e.doc, e.cid)
				return err
			})
		}
	}

	// 2. Send reminders. Join against notification_settings so a tenant with
	// reminders disabled is skipped at the query level, not per-row.
	rem, err := s.db.Query(ctx, `
		SELECT a.id::text, a.document_id::text, a.company_id::text, d.display_number, d.customer_snapshot
		FROM document_authorizations a
		JOIN notification_settings n ON n.company_id = a.company_id
		JOIN documents d ON d.id = a.document_id
		WHERE a.status IN ('pending','viewed')
		  AND a.reminder_sent_at IS NULL
		  AND n.reminders_enabled = true
		  AND n.smtp_host <> ''
		  AND n.from_email <> ''
		  AND a.requested_at < (now() - make_interval(days => n.reminder_days))`)
	if err != nil {
		log.Printf("notification tick: query reminders: %v", err)
		return
	}
	type rowT struct {
		authID, docID, cid, docNum string
		custSnap                   []byte
	}
	var toSend []rowT
	for rem.Next() {
		var row rowT
		if err := rem.Scan(&row.authID, &row.docID, &row.cid, &row.docNum, &row.custSnap); err == nil {
			toSend = append(toSend, row)
		}
	}
	rem.Close()
	for _, r := range toSend {
		email := extractCustEmail(r.custSnap)
		if email == "" {
			continue
		}
		if err := s.sendAuthorizationReminder(ctx, r.cid, r.docID, r.docNum, email); err != nil {
			log.Printf("reminder for auth %s: %v", r.authID, err)
			continue
		}
		_, _ = s.db.Exec(ctx, `UPDATE document_authorizations SET reminder_sent_at = now() WHERE id::text = $1`, r.authID)
	}
}

func extractCustEmail(raw []byte) string {
	if len(raw) == 0 {
		return ""
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return ""
	}
	if s, ok := m["email"].(string); ok && s != "" {
		return s
	}
	return ""
}

func (s *Server) sendAuthorizationReminder(ctx context.Context, cid, docID, docNum, to string) error {
	cfg, pw, err := s.loadMailer(ctx, cid)
	if err != nil {
		return err
	}
	// Reuse the current active share token so the link matches what the
	// customer already received.
	var tok string
	_ = s.db.QueryRow(ctx, `SELECT token FROM document_share_tokens
		WHERE document_id::text = $1 AND revoked_at IS NULL
		ORDER BY created_at DESC LIMIT 1`, docID).Scan(&tok)
	if tok == "" {
		return errors.New("no active share link to remind about")
	}
	// Build URL from the shop setting if available; else fall back to a
	// relative URL that at least gives the customer the token to use.
	url := "/share/doc/" + tok
	// Shop name for the subject/body.
	var shopName string
	_ = s.db.QueryRow(ctx, `SELECT coalesce(shop_name,'') FROM shop_settings WHERE company_id::text = $1`, cid).Scan(&shopName)
	if shopName == "" {
		shopName = "Your shop"
	}
	subject := fmt.Sprintf("Reminder: please review %s #%s", docNum, docNum)
	plain := fmt.Sprintf("Hi,\n\n%s is still waiting on your authorization for document #%s.\n\nOpen it here: %s\n\nThanks.\n", shopName, docNum, url)
	html := fmt.Sprintf(`<p>Hi,</p><p><b>%s</b> is still waiting on your authorization for document <b>#%s</b>.</p><p><a href="%s">Open the document</a></p>`, shopName, docNum, url)
	return cfg.send(pw, []string{to}, subject, html, plain)
}

// Suppress a potentially-unused import warning when the file is sliced.
var _ = http.StatusOK
