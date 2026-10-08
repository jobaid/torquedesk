package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/smtp"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ----------------------------------------------------------------------------
// Password reset flow.
//
// On request: generate a 32-byte random token, hash it with SHA-256, store the
// HASH in password_reset_tokens with a 1-hour expiry. Only the plaintext token
// goes out in the reset link (via SMTP email, with a console-log fallback when
// SMTP isn't configured so you can still test locally).
//
// On confirm: hash the submitted token, look up the row, verify not-used and
// not-expired, update password_hash, mark the token used so it can't be reused.
// ----------------------------------------------------------------------------

const resetTokenTTL = time.Hour

type resetTargetKind string

const (
	kindSaasAdmin    resetTargetKind = "saas_admin"
	kindCompanyOwner resetTargetKind = "company_owner"
)

func newResetToken() (plain, h string) {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	plain = base64.RawURLEncoding.EncodeToString(b)
	sum := sha256.Sum256([]byte(plain))
	h = hex.EncodeToString(sum[:])
	return
}

func hashResetToken(plain string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(plain)))
	return hex.EncodeToString(sum[:])
}

// sendResetEmail: if SMTP_* env vars are set, actually sends the email. If
// not, logs the reset link to the server log so you can hand it to the user
// manually (fine for a single-tenant dev deploy; configure SMTP for prod).
func sendResetEmail(toEmail, link string) error {
	host := strings.TrimSpace(os.Getenv("SMTP_HOST"))
	if host == "" {
		log.Printf("---- password-reset link for %s ----\n  %s\n  (configure SMTP_HOST/PORT/USER/PASS/FROM to email this automatically)",
			toEmail, link)
		return nil
	}
	port := strings.TrimSpace(os.Getenv("SMTP_PORT"))
	if port == "" {
		port = "587"
	}
	user := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")
	from := strings.TrimSpace(os.Getenv("SMTP_FROM"))
	if from == "" {
		from = user
	}
	auth := smtp.PlainAuth("", user, pass, host)
	msg := []byte("From: " + from + "\r\nTo: " + toEmail + "\r\nSubject: Reset your TorqueDesk password\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n\r\n" +
		"Click the link below to reset your password. It expires in 1 hour.\r\n\r\n" + link + "\r\n")
	return smtp.SendMail(host+":"+port, auth, from, []string{toEmail}, msg)
}

// resetBaseURL is used to build the reset link. Set RESET_BASE_URL=https://apps.2set.com
// so the email link goes to your real deployment; defaults to a localhost URL.
func resetBaseURL() string {
	if u := strings.TrimSpace(os.Getenv("RESET_BASE_URL")); u != "" {
		return strings.TrimRight(u, "/")
	}
	return "http://localhost:5173"
}

// ---------- HTTP handlers (public — no auth) ----------

type resetRequest struct {
	Email string `json:"email"`
	Kind  string `json:"kind"` // "owner" (saas admin) or "shop" (company owner)
}

func (s *Server) resetRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/password-reset/request", loginLimit(s.requestPasswordReset))
	mux.HandleFunc("POST /api/password-reset/confirm", loginLimit(s.confirmPasswordReset))
}

func (s *Server) requestPasswordReset(w http.ResponseWriter, r *http.Request) {
	var req resetRequest
	if err := readJSON(r, &req); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" {
		writeErr(w, 400, "Email is required.")
		return
	}
	kind := kindCompanyOwner
	pathHint := "reset-password"
	if req.Kind == "owner" {
		kind = kindSaasAdmin
		pathHint = "owner-reset-password"
	}
	// Always return 200 so an attacker can't enumerate accounts via timing.
	// If the email exists, issue a token and email/log the link.
	_ = s.issueResetToken(r.Context(), kind, req.Email, pathHint)
	writeJSON(w, 200, map[string]any{"ok": true, "message": "If that email exists, a reset link has been sent."})
}

func (s *Server) issueResetToken(ctx context.Context, kind resetTargetKind, email, pathHint string) error {
	var userID, companyID string
	var err error
	switch kind {
	case kindSaasAdmin:
		err = s.db.QueryRow(ctx, `SELECT id::text FROM saas_admin_users WHERE lower(email) = $1 AND active`, email).Scan(&userID)
	case kindCompanyOwner:
		// Pull company_id too so we can send through the tenant's connected
		// email account (notification_settings SMTP) when configured.
		err = s.db.QueryRow(ctx, `SELECT id::text, company_id::text FROM company_owners WHERE lower(email) = $1 AND status = 'active' LIMIT 1`, email).Scan(&userID, &companyID)
	}
	if err != nil {
		// No such user — don't surface this to the caller.
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	}
	plain, hash := newResetToken()
	expires := time.Now().Add(resetTokenTTL)
	if _, err := s.db.Exec(ctx, `INSERT INTO password_reset_tokens (user_kind, user_id, token_hash, expires_at)
		VALUES ($1, $2::uuid, $3, $4)`, kind, userID, hash, expires); err != nil {
		return err
	}
	link := fmt.Sprintf("%s/%s?token=%s&email=%s", resetBaseURL(), pathHint, plain, email)

	// Preferred path: send through the shop's connected email account
	// (Settings → Notifications). Falls back to env-var SMTP / log for the
	// SaaS admin reset or when the tenant hasn't configured a mailer yet.
	if kind == kindCompanyOwner && companyID != "" {
		if cfg, pw, err := s.loadMailer(ctx, companyID); err == nil {
			var shopName string
			_ = s.db.QueryRow(ctx, `SELECT coalesce(shop_name,'') FROM shop_settings WHERE company_id::text = $1`, companyID).Scan(&shopName)
			if shopName == "" {
				shopName = "TorqueDesk"
			}
			subject := "Reset your " + shopName + " password"
			plainBody := "You asked to reset your password at " + shopName + ".\r\n\r\n" +
				"Click the link below (expires in 1 hour):\r\n\r\n" + link + "\r\n\r\n" +
				"If you didn't ask for this, ignore this email."
			htmlBody := "<p>You asked to reset your password at <b>" + shopName + "</b>.</p>" +
				"<p><a href=\"" + link + "\">Reset your password</a> (expires in 1 hour)</p>" +
				"<p style=\"color:#6b7280;font-size:12px\">If you didn't ask for this, ignore this email.</p>"
			if sErr := cfg.send(pw, []string{email}, subject, htmlBody, plainBody); sErr == nil {
				return nil
			} else {
				log.Printf("reset: tenant SMTP for %s failed (%v); falling back to env SMTP / log", email, sErr)
			}
		}
	}
	return sendResetEmail(email, link)
}

type resetConfirm struct {
	Token       string `json:"token"`
	NewPassword string `json:"newPassword"`
}

func (s *Server) confirmPasswordReset(w http.ResponseWriter, r *http.Request) {
	var req resetConfirm
	if err := readJSON(r, &req); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	if req.Token == "" || len(req.NewPassword) < 8 {
		writeErr(w, 400, "Token is required and new password must be at least 8 characters.")
		return
	}
	hash := hashResetToken(req.Token)
	var id int64
	var kind, userID string
	var used *time.Time
	var exp time.Time
	err := s.db.QueryRow(r.Context(), `SELECT id, user_kind, user_id::text, used_at, expires_at FROM password_reset_tokens WHERE token_hash = $1`, hash).
		Scan(&id, &kind, &userID, &used, &exp)
	if err != nil || used != nil || time.Now().After(exp) {
		writeErr(w, 400, "This reset link is invalid or has expired. Request a new one.")
		return
	}
	newHash, err := HashPassword(req.NewPassword)
	if err != nil {
		writeErr(w, 500, "Could not hash the new password.")
		return
	}
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		switch kind {
		case "saas_admin":
			if _, err := tx.Exec(r.Context(), `UPDATE saas_admin_users SET password_hash = $1 WHERE id::text = $2`, newHash, userID); err != nil {
				return err
			}
		case "company_owner":
			if _, err := tx.Exec(r.Context(), `UPDATE company_owners SET password_hash = $1, updated_at = now() WHERE id::text = $2`, newHash, userID); err != nil {
				return err
			}
		default:
			return fmt.Errorf("unknown user kind")
		}
		_, err := tx.Exec(r.Context(), `UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, id)
		return err
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}
