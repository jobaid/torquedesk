package api

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/mail"
	"slices"
	"strings"
	"time"
)

// Permissions per role. The frontend receives this list at login and the API
// enforces it on every write.
var rolePerms = map[string][]string{
	"admin": {"*"},
	"advisor": {
		"settings.view", "document_settings.edit", "staff_settings.edit",
		"documents.edit", "documents.delete", "customers.edit", "print", "wiring.print",
		"reports.view", "sales_reports.view", "sales_reports.export",
		"financial_reports.view", "financial_reports.export",
	},
	"technician": {"settings.view", "documents.edit", "print", "wiring.print", "reports.view", "sales_reports.view"},
	"apprentice": {"settings.view"},

	// Multi-tenant shop roles (phase 3). shop_owner is the admin for a tenant;
	// manager mirrors advisor. technician/apprentice above also serve shop users.
	"shop_owner": {"*"},
	"manager": {
		"settings.view", "settings.edit", "shop.edit", "financial_settings.edit",
		"document_settings.edit", "staff_settings.edit",
		"documents.edit", "documents.delete", "customers.edit", "print", "wiring.print",
		"reports.view", "sales_reports.view", "sales_reports.export",
		"financial_reports.view", "financial_reports.export",
	},
}

var allPerms = []string{
	"settings.view", "settings.edit", "shop.edit", "financial_settings.edit", "document_settings.edit", "staff_settings.edit",
	"documents.edit", "documents.delete", "customers.edit", "print", "wiring.print",
	"reports.view", "sales_reports.view", "sales_reports.export", "financial_reports.view", "financial_reports.export",
}

type User struct {
	Name      string `json:"name"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	Exp       int64  `json:"exp"`
	CompanyID string `json:"companyId,omitempty"` // tenant for main-app users; empty for saas_owner
}

func (u User) Perms() []string {
	p := rolePerms[u.Role]
	if slices.Contains(p, "*") {
		return allPerms
	}
	return p
}

func (u User) Can(perm string) bool {
	if perm == "" {
		return true
	}
	return slices.Contains(u.Perms(), perm)
}

type ctxKey struct{}

func userFrom(ctx context.Context) User { u, _ := ctx.Value(ctxKey{}).(User); return u }

// jwtHeader is the RFC 7515 JOSE header for HS256 JWTs we issue.
var jwtHeader = base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))

// sign issues a standards-compliant JWT (RFC 7519) with HS256.
// Token shape: base64url(header) . base64url(payload) . base64url(hmac-sha256).
// Any standard JWT library can decode and verify these tokens.
func (s *Server) sign(u User) string {
	body, _ := json.Marshal(u)
	payload := base64.RawURLEncoding.EncodeToString(body)
	signing := jwtHeader + "." + payload
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(signing))
	return signing + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// verify accepts standard 3-part JWT. Validates header alg=HS256, HMAC
// signature in constant time, and exp. Rejects anything else.
func (s *Server) verify(tok string) (User, bool) {
	parts := strings.Split(tok, ".")
	if len(parts) != 3 {
		return User{}, false
	}
	hdrB, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return User{}, false
	}
	var hdr struct{ Alg, Typ string }
	if json.Unmarshal(hdrB, &hdr) != nil || hdr.Alg != "HS256" {
		return User{}, false
	}
	signing := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(signing))
	want := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(parts[2]), []byte(want)) {
		return User{}, false
	}
	body, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return User{}, false
	}
	var u User
	if json.Unmarshal(body, &u) != nil || u.Exp < time.Now().Unix() {
		return User{}, false
	}
	return u, true
}

// auth requires a valid token and, when perm is non-empty, that permission.
// It also rejects pre-tenancy tokens that lack a company_id so a stale session
// cannot bypass tenant scoping, and gates data endpoints behind an
// active-company check (suspended/expired/cancelled → 403).
func (s *Server) auth(perm string, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tok := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		u, ok := s.verify(tok)
		if !ok {
			writeErr(w, 401, "Your session has expired. Please sign in again.")
			return
		}
		if u.Role != saasOwnerRole && u.CompanyID == "" {
			writeErr(w, 401, "This session predates multi-tenancy. Please sign in again.")
			return
		}
		if !u.Can(perm) {
			// Make the message actionable so a stale/upgraded session doesn't
			// just show a dead-end "permission denied". Includes the role and
			// missing perm so the frontend can suggest signing in again.
			writeJSON(w, 403, map[string]any{
				"error":          "You don't have permission to do this (role: " + u.Role + ", missing: " + perm + "). Try signing out and back in.",
				"missingPerm":    perm,
				"role":           u.Role,
				"authRecoverable": true,
			})
			return
		}
		// Any main-app session is only accepted while its company is active.
		if u.CompanyID != "" {
			status, err := s.companyStatus(r.Context(), u.CompanyID)
			if err == nil && (status == "suspended" || status == "expired" || status == "cancelled") {
				writeJSON(w, 403, map[string]any{
					"error":         "Your TorqueDesk subscription is currently " + status + ". Please contact your TorqueDesk administrator.",
					"companyStatus": status,
				})
				return
			}
		}
		h(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, u)))
	}
}

type loginReq struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

// login is the legacy demo sign-in. It trusts the submitted identity + role
// and places the user inside the backfill "demo" tenant so pre-tenancy local
// workflows keep working. Real customer shops must use /api/auth/company-login,
// which authenticates against company_owners.password_hash and binds the token
// to that owner's company_id.
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	ve := ValidationError{}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len(req.Name) > 100 {
		ve["name"] = "Enter your name."
	}
	if _, err := mail.ParseAddress(req.Email); err != nil {
		ve["email"] = "Enter a valid email address."
	}
	if _, ok := rolePerms[req.Role]; !ok || req.Role == saasOwnerRole {
		ve["role"] = "Unknown role."
	}
	if len(ve) > 0 {
		handleErr(w, ve)
		return
	}
	cid, err := s.demoCompanyID(r.Context())
	if err != nil {
		handleErr(w, err)
		return
	}
	u := User{Name: req.Name, Email: req.Email, Role: req.Role, Exp: time.Now().Add(7 * 24 * time.Hour).Unix(), CompanyID: cid}
	writeJSON(w, 200, map[string]any{"token": s.sign(u), "user": u, "permissions": u.Perms()})
}

type companyLoginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	MfaCode  string `json:"mfaCode"`
}

// companyLogin authenticates a shop user against company_owners.password_hash
// and issues a token whose CompanyID is the owner's company. The company's
// status is checked here (and refreshed per-request by requireActiveTenant).
func (s *Server) companyLogin(w http.ResponseWriter, r *http.Request) {
	var req companyLoginReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" || req.Password == "" {
		writeErr(w, 400, "Email and password are required.")
		return
	}
	// Dummy hash kept to equalize response times when the user doesn't exist.
	const dummy = "$argon2id$v=19$m=65536,t=3,p=2$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
	var (
		ownerID, companyID, firstName, lastName, hash, status, role, cStatus, mfaSecret string
		mfaEnabled                                                                     bool
	)
	err := s.db.QueryRow(r.Context(), `
		SELECT o.id::text, o.company_id::text, o.first_name, o.last_name, o.password_hash, o.status, o.role, c.status,
		       coalesce(o.mfa_secret, ''), coalesce(o.mfa_enabled, false)
		FROM company_owners o
		JOIN companies c ON c.id = o.company_id
		WHERE o.email = $1`, req.Email).
		Scan(&ownerID, &companyID, &firstName, &lastName, &hash, &status, &role, &cStatus, &mfaSecret, &mfaEnabled)
	ok := err == nil && status == "active"
	if !ok {
		hash = dummy
	}
	if !VerifyPassword(req.Password, hash) || !ok {
		// Audit the failure under the matched company (if any) so a shop owner
		// can see suspicious attempts on their tenant.
		if companyID != "" {
			_, _ = s.db.Exec(r.Context(), `INSERT INTO settings_audit_log
				(company_id, user_name, user_role, entity, entity_id, action, field, old_value, new_value)
				VALUES ($1::uuid, $2, 'auth', 'login', $2, 'update', 'failed', '', $3)`,
				companyID, req.Email, clientIP(r))
		}
		writeErr(w, 401, "Invalid email or password.")
		return
	}
	if cStatus == "suspended" || cStatus == "expired" || cStatus == "cancelled" {
		writeJSON(w, 403, map[string]any{
			"error":         "Your TorqueDesk subscription is currently " + cStatus + ". Please contact your TorqueDesk administrator.",
			"companyStatus": cStatus,
		})
		return
	}
	// MFA gate for shop users (same TOTP flow as owners).
	if mfaEnabled {
		if req.MfaCode == "" {
			writeJSON(w, 401, map[string]any{"error": "Enter your authenticator code.", "mfaRequired": true})
			return
		}
		if !VerifyTOTP(mfaSecret, req.MfaCode) {
			_, _ = s.db.Exec(r.Context(), `INSERT INTO settings_audit_log
				(company_id, user_name, user_role, entity, entity_id, action, field, old_value, new_value)
				VALUES ($1::uuid, $2, $3, 'login', $4, 'update', 'mfa_failed', '', $5)`,
				companyID, req.Email, role, ownerID, clientIP(r))
			writeJSON(w, 401, map[string]any{"error": "Incorrect authenticator code.", "mfaRequired": true})
			return
		}
	}
	_, _ = s.db.Exec(r.Context(), `UPDATE company_owners SET last_login_at = now() WHERE id::text = $1`, ownerID)
	name := strings.TrimSpace(firstName + " " + lastName)
	if name == "" {
		name = req.Email
	}
	// Audit the successful sign-in into settings_audit_log so Settings → Audit
	// Log shows every session, with the client IP in new_value.
	_, _ = s.db.Exec(r.Context(), `INSERT INTO settings_audit_log
		(company_id, user_name, user_role, entity, entity_id, action, field, old_value, new_value)
		VALUES ($1::uuid, $2, $3, 'login', $4, 'update', 'ip', '', $5)`,
		companyID, name, role, ownerID, clientIP(r))
	u := User{Name: name, Email: req.Email, Role: role, Exp: time.Now().Add(7 * 24 * time.Hour).Unix(), CompanyID: companyID}
	writeJSON(w, 200, map[string]any{"token": s.sign(u), "user": u, "permissions": u.Perms()})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	writeJSON(w, 200, map[string]any{"user": u, "permissions": u.Perms()})
}

type changePasswordReq struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

type mfaCodeReq struct {
	Code string `json:"code"`
}

// shopMfaStatus returns whether the signed-in shop user has MFA enabled.
func (s *Server) shopMfaStatus(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	if u.CompanyID == "" {
		writeJSON(w, 200, map[string]any{"enabled": false, "available": false})
		return
	}
	var enabled bool
	_ = s.db.QueryRow(r.Context(), `SELECT coalesce(mfa_enabled,false) FROM company_owners WHERE lower(email) = lower($1) AND company_id::text = $2`,
		u.Email, u.CompanyID).Scan(&enabled)
	writeJSON(w, 200, map[string]any{"enabled": enabled, "available": true})
}

func (s *Server) shopMfaSetup(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	if u.CompanyID == "" {
		writeErr(w, 400, "MFA is only available for shop accounts.")
		return
	}
	secret := GenerateTOTPSecret()
	if _, err := s.db.Exec(r.Context(), `UPDATE company_owners SET mfa_secret = $1, mfa_enabled = false
		WHERE lower(email) = lower($2) AND company_id::text = $3`, secret, u.Email, u.CompanyID); err != nil {
		handleErr(w, err)
		return
	}
	url := TOTPURL("TorqueDesk ("+u.Name+")", u.Email, secret)
	writeJSON(w, 200, map[string]any{"secret": secret, "otpauthUrl": url})
}

func (s *Server) shopMfaEnable(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	if u.CompanyID == "" {
		writeErr(w, 400, "MFA is only available for shop accounts.")
		return
	}
	var req mfaCodeReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	var secret, ownerID string
	err := s.db.QueryRow(r.Context(), `SELECT id::text, coalesce(mfa_secret,'') FROM company_owners
		WHERE lower(email) = lower($1) AND company_id::text = $2`, u.Email, u.CompanyID).Scan(&ownerID, &secret)
	if err != nil || secret == "" {
		writeErr(w, 400, "Start MFA setup first.")
		return
	}
	if !VerifyTOTP(secret, req.Code) {
		writeErr(w, 400, "That code is incorrect. Check the time on your phone and try again.")
		return
	}
	if _, err := s.db.Exec(r.Context(), `UPDATE company_owners SET mfa_enabled = true WHERE id::text = $1`, ownerID); err != nil {
		handleErr(w, err)
		return
	}
	_, _ = s.db.Exec(r.Context(), `INSERT INTO settings_audit_log
		(company_id, user_name, user_role, entity, entity_id, action, field, old_value, new_value)
		VALUES ($1::uuid, $2, $3, 'mfa', $4, 'update', 'enabled', 'false', 'true')`,
		u.CompanyID, u.Name, u.Role, ownerID)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) shopMfaDisable(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	if u.CompanyID == "" {
		writeErr(w, 400, "MFA is only available for shop accounts.")
		return
	}
	var req mfaCodeReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	var secret, ownerID string
	err := s.db.QueryRow(r.Context(), `SELECT id::text, coalesce(mfa_secret,'') FROM company_owners
		WHERE lower(email) = lower($1) AND company_id::text = $2`, u.Email, u.CompanyID).Scan(&ownerID, &secret)
	if err != nil {
		writeErr(w, 404, "Shop account not found.")
		return
	}
	if !VerifyTOTP(secret, req.Code) {
		writeErr(w, 400, "That code is incorrect.")
		return
	}
	if _, err := s.db.Exec(r.Context(), `UPDATE company_owners SET mfa_enabled = false, mfa_secret = '' WHERE id::text = $1`, ownerID); err != nil {
		handleErr(w, err)
		return
	}
	_, _ = s.db.Exec(r.Context(), `INSERT INTO settings_audit_log
		(company_id, user_name, user_role, entity, entity_id, action, field, old_value, new_value)
		VALUES ($1::uuid, $2, $3, 'mfa', $4, 'update', 'enabled', 'true', 'false')`,
		u.CompanyID, u.Name, u.Role, ownerID)
	writeJSON(w, 200, map[string]any{"ok": true})
}

// changeOwnPassword lets a signed-in shop user rotate their own password. Only
// works for shop sign-ins (company_owners rows) — demo-mode logins aren't
// backed by a password row, so they get a clear 400.
func (s *Server) changeOwnPassword(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var req changePasswordReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	if req.CurrentPassword == "" || req.NewPassword == "" {
		writeErr(w, 400, "Current and new password are required.")
		return
	}
	if len(req.NewPassword) < 8 {
		writeErr(w, 400, "New password must be at least 8 characters.")
		return
	}
	if u.CompanyID == "" {
		writeErr(w, 400, "This account does not have a password. Sign in with the shop account instead.")
		return
	}
	var ownerID, hash string
	err := s.db.QueryRow(r.Context(), `SELECT id::text, password_hash FROM company_owners
		WHERE lower(email) = lower($1) AND company_id::text = $2`, u.Email, u.CompanyID).Scan(&ownerID, &hash)
	if err != nil {
		writeErr(w, 400, "This account does not have a password. Sign in with the shop account instead.")
		return
	}
	if !VerifyPassword(req.CurrentPassword, hash) {
		writeErr(w, 401, "Current password is incorrect.")
		return
	}
	newHash, err := HashPassword(req.NewPassword)
	if err != nil {
		writeErr(w, 500, "Could not hash the new password.")
		return
	}
	if _, err := s.db.Exec(r.Context(), `UPDATE company_owners SET password_hash = $1, updated_at = now() WHERE id::text = $2`, newHash, ownerID); err != nil {
		handleErr(w, err)
		return
	}
	// Audit the password change (never log the password itself).
	_, _ = s.db.Exec(r.Context(), `INSERT INTO settings_audit_log
		(company_id, user_name, user_role, entity, entity_id, action, field, old_value, new_value)
		VALUES ($1::uuid, $2, $3, 'password', $4, 'update', 'password', '', $5)`,
		u.CompanyID, u.Name, u.Role, ownerID, clientIP(r))
	writeJSON(w, 200, map[string]any{"ok": true})
}
