package api

import (
	"context"
	"crypto/rand"
	"encoding/base32"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ----------------------------------------------------------------------------
// CuraNex SaaS Owner Portal API (phase 1).
//
// Authentication: Argon2id passwords, same HMAC-signed token shell as the main
// app's demo auth, but a distinct role string ("saas_owner") that is NEVER
// granted by the main /api/auth/login endpoint. Owner endpoints verify both
// token validity AND role == "saas_owner".
//
// Phase 1 scope: companies, company owners, subscriptions, access status
// (suspend/activate/expire), audit log, dashboard counts. Tenant isolation on
// the main app's data arrives in a later phase.
// ----------------------------------------------------------------------------

var (
	companyStatuses      = []string{"trial", "active", "suspended", "expired", "cancelled", "pending"}
	subscriptionStatuses = []string{"trial", "active", "expired", "cancelled", "pending", "suspended"}
	subscriptionPlans    = []string{"starter", "professional", "business", "enterprise"}
	billingCycles        = []string{"monthly", "annual"}
	slugRE               = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	codeRE               = regexp.MustCompile(`^[A-Z0-9][A-Z0-9-]{0,47}$`)
)

const saasOwnerRole = "saas_owner"

func (s *Server) ownerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/owner/auth/login", loginLimit(s.ownerLogin))
	mux.HandleFunc("GET /api/owner/me", s.ownerAuth(s.ownerMe))
	mux.HandleFunc("POST /api/owner/me/change-password", s.ownerAuth(s.ownerChangePassword))
	mux.HandleFunc("POST /api/owner/me/change-email", s.ownerAuth(s.ownerChangeEmail))
	mux.HandleFunc("GET /api/owner/mfa/status", s.ownerAuth(s.ownerMfaStatus))
	mux.HandleFunc("POST /api/owner/mfa/setup", s.ownerAuth(s.ownerMfaSetup))
	mux.HandleFunc("POST /api/owner/mfa/enable", s.ownerAuth(s.ownerMfaEnable))
	mux.HandleFunc("POST /api/owner/mfa/disable", s.ownerAuth(s.ownerMfaDisable))
	mux.HandleFunc("GET /api/owner/dashboard", s.ownerAuth(s.ownerDashboard))
	mux.HandleFunc("GET /api/owner/companies", s.ownerAuth(s.listCompanies))
	mux.HandleFunc("POST /api/owner/companies", s.ownerAuth(s.createCompany))
	mux.HandleFunc("GET /api/owner/companies/{id}", s.ownerAuth(s.getCompany))
	mux.HandleFunc("PATCH /api/owner/companies/{id}", s.ownerAuth(s.updateCompany))
	mux.HandleFunc("PATCH /api/owner/companies/{id}/status", s.ownerAuth(s.changeCompanyStatus))
	mux.HandleFunc("GET /api/owner/subscriptions", s.ownerAuth(s.listSubscriptions))
	mux.HandleFunc("PATCH /api/owner/subscriptions/{id}", s.ownerAuth(s.updateSubscription))
	mux.HandleFunc("GET /api/owner/audit", s.ownerAuth(s.listSaasAudit))
	mux.HandleFunc("GET /api/owner/companies/{id}/backup", s.ownerAuth(s.ownerDownloadBackup))
	mux.HandleFunc("PATCH /api/owner/companies/{id}/owners/{ownerId}", s.ownerAuth(s.updateCompanyOwner))
}

// updateCompanyOwner lets the SaaS owner help a shop that lost its login:
// change the owner's email, reset their password, or toggle status. Audited.
type companyOwnerPatch struct {
	FirstName *string `json:"firstName"`
	LastName  *string `json:"lastName"`
	Email     *string `json:"email"`
	Phone     *string `json:"phone"`
	Username  *string `json:"username"`
	Password  *string `json:"password"`
	Status    *string `json:"status"`
}

func (s *Server) updateCompanyOwner(w http.ResponseWriter, r *http.Request) {
	companyID := r.PathValue("id")
	ownerID := r.PathValue("ownerId")
	u := userFrom(r.Context())
	var p companyOwnerPatch
	if err := readJSON(r, &p); err != nil {
		writeErr(w, 400, "Invalid request body.")
		return
	}
	sets, args := []string{"updated_at = now()"}, []any{}
	add := func(col string, v any) { args = append(args, v); sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args))) }
	changes := map[string]any{}
	if p.FirstName != nil {
		add("first_name", strings.TrimSpace(*p.FirstName))
		changes["firstName"] = *p.FirstName
	}
	if p.LastName != nil {
		add("last_name", strings.TrimSpace(*p.LastName))
		changes["lastName"] = *p.LastName
	}
	if p.Email != nil {
		e := strings.ToLower(strings.TrimSpace(*p.Email))
		if !validEmail(e) {
			writeErr(w, 400, "Enter a valid email.")
			return
		}
		add("email", e)
		changes["email"] = e
	}
	if p.Phone != nil {
		add("phone", strings.TrimSpace(*p.Phone))
	}
	if p.Username != nil {
		add("username", strings.ToLower(strings.TrimSpace(*p.Username)))
		changes["username"] = *p.Username
	}
	if p.Status != nil {
		if *p.Status != "active" && *p.Status != "inactive" {
			writeErr(w, 400, "Status must be active or inactive.")
			return
		}
		add("status", *p.Status)
		changes["status"] = *p.Status
	}
	if p.Password != nil {
		pw := strings.TrimSpace(*p.Password)
		if len(pw) < 8 {
			writeErr(w, 400, "Password must be at least 8 characters.")
			return
		}
		hash, err := HashPassword(pw)
		if err != nil {
			writeErr(w, 500, "Could not hash password.")
			return
		}
		add("password_hash", hash)
		// Record only that a password reset happened — never the password itself.
		changes["password"] = "reset"
	}
	if len(sets) == 1 {
		writeErr(w, 400, "Nothing to update.")
		return
	}
	args = append(args, ownerID, companyID)
	ct, err := s.db.Exec(r.Context(),
		fmt.Sprintf("UPDATE company_owners SET %s WHERE id::text = $%d AND company_id::text = $%d",
			strings.Join(sets, ", "), len(args)-1, len(args)),
		args...)
	if err != nil {
		handleErr(w, err)
		return
	}
	if ct.RowsAffected() == 0 {
		writeErr(w, 404, "Owner not found.")
		return
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "company_owner_updated", "company_owner",
		ownerID, &companyID, changes, clientIP(r))
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ownerAuth protects owner endpoints: valid HMAC token AND role=saas_owner.
func (s *Server) ownerAuth(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tok := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		u, ok := s.verify(tok)
		if !ok {
			writeErr(w, 401, "Your session has expired. Please sign in again.")
			return
		}
		if u.Role != saasOwnerRole {
			writeErr(w, 403, "This area is restricted to TorqueDesk SaaS owners.")
			return
		}
		h(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, u)))
	}
}

type ownerLoginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	MfaCode  string `json:"mfaCode"`
}

func (s *Server) ownerLogin(w http.ResponseWriter, r *http.Request) {
	var req ownerLoginReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" || req.Password == "" {
		writeErr(w, 400, "Email and password are required.")
		return
	}
	var (
		id, name, hash, mfaSecret string
		active, mfaEnabled        bool
	)
	err := s.db.QueryRow(r.Context(), `SELECT id::text, name, password_hash, active, coalesce(mfa_secret,''), mfa_enabled FROM saas_admin_users WHERE email = $1`, req.Email).
		Scan(&id, &name, &hash, &active, &mfaSecret, &mfaEnabled)
	okUser := err == nil && active
	if !okUser {
		hash = "$argon2id$v=19$m=65536,t=3,p=2$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
	}
	okPass := VerifyPassword(req.Password, hash)
	if !okUser || !okPass {
		_ = s.recordSaasAudit(r.Context(), nil, req.Email, "login_failed", "saas_admin", req.Email, nil, map[string]any{"email": req.Email}, clientIP(r))
		writeErr(w, 401, "Invalid email or password.")
		return
	}
	// MFA gate: if the account has MFA enabled, require a valid TOTP code too.
	if mfaEnabled {
		if req.MfaCode == "" {
			writeJSON(w, 401, map[string]any{"error": "Enter your authenticator code.", "mfaRequired": true})
			return
		}
		if !VerifyTOTP(mfaSecret, req.MfaCode) {
			_ = s.recordSaasAudit(r.Context(), &id, name, "login_mfa_failed", "saas_admin", id, nil, nil, clientIP(r))
			writeJSON(w, 401, map[string]any{"error": "Incorrect authenticator code.", "mfaRequired": true})
			return
		}
	}
	_, _ = s.db.Exec(r.Context(), `UPDATE saas_admin_users SET last_login_at = now() WHERE id::text = $1`, id)
	u := User{Name: name, Email: req.Email, Role: saasOwnerRole, Exp: time.Now().Add(12 * time.Hour).Unix()}
	_ = s.recordSaasAudit(r.Context(), &id, name, "login", "saas_admin", id, nil, map[string]any{"mfa": mfaEnabled}, clientIP(r))
	writeJSON(w, 200, map[string]any{"token": s.sign(u), "user": u})
}

// ---------- MFA setup / enable / disable ----------

type mfaEnableReq struct {
	Code string `json:"code"`
}

func (s *Server) ownerMfaStatus(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var enabled bool
	_ = s.db.QueryRow(r.Context(), `SELECT mfa_enabled FROM saas_admin_users WHERE lower(email) = $1`, strings.ToLower(u.Email)).Scan(&enabled)
	writeJSON(w, 200, map[string]any{"enabled": enabled})
}

// Generates a new TOTP secret and returns it + the otpauth:// URL for a QR
// code. Secret is persisted but mfa_enabled stays false until the user proves
// they scanned it by calling /enable with a working code.
func (s *Server) ownerMfaSetup(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	secret := GenerateTOTPSecret()
	if _, err := s.db.Exec(r.Context(), `UPDATE saas_admin_users SET mfa_secret = $1, mfa_enabled = false WHERE lower(email) = $2`, secret, strings.ToLower(u.Email)); err != nil {
		handleErr(w, err)
		return
	}
	url := TOTPURL("CuraNex Owner", u.Email, secret)
	writeJSON(w, 200, map[string]any{"secret": secret, "otpauthUrl": url})
}

func (s *Server) ownerMfaEnable(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var req mfaEnableReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	var secret string
	if err := s.db.QueryRow(r.Context(), `SELECT coalesce(mfa_secret,'') FROM saas_admin_users WHERE lower(email) = $1`, strings.ToLower(u.Email)).Scan(&secret); err != nil {
		handleErr(w, err)
		return
	}
	if secret == "" {
		writeErr(w, 400, "Start MFA setup first.")
		return
	}
	if !VerifyTOTP(secret, req.Code) {
		writeErr(w, 400, "That code is incorrect. Check the time on your phone and try again.")
		return
	}
	if _, err := s.db.Exec(r.Context(), `UPDATE saas_admin_users SET mfa_enabled = true WHERE lower(email) = $1`, strings.ToLower(u.Email)); err != nil {
		handleErr(w, err)
		return
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "mfa_enabled", "saas_admin", u.Email, nil, nil, clientIP(r))
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) ownerMfaDisable(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var req mfaEnableReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	var secret string
	if err := s.db.QueryRow(r.Context(), `SELECT coalesce(mfa_secret,'') FROM saas_admin_users WHERE lower(email) = $1`, strings.ToLower(u.Email)).Scan(&secret); err != nil {
		handleErr(w, err)
		return
	}
	if !VerifyTOTP(secret, req.Code) {
		writeErr(w, 400, "That code is incorrect.")
		return
	}
	if _, err := s.db.Exec(r.Context(), `UPDATE saas_admin_users SET mfa_enabled = false, mfa_secret = '' WHERE lower(email) = $1`, strings.ToLower(u.Email)); err != nil {
		handleErr(w, err)
		return
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "mfa_disabled", "saas_admin", u.Email, nil, nil, clientIP(r))
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) ownerMe(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	writeJSON(w, 200, map[string]any{"user": u})
}

// ownerChangePassword rotates the signed-in SaaS owner's own password. Audited
// in saas_audit_log so password changes are traceable.
func (s *Server) ownerChangePassword(w http.ResponseWriter, r *http.Request) {
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
	var adminID, hash string
	err := s.db.QueryRow(r.Context(), `SELECT id::text, password_hash FROM saas_admin_users WHERE lower(email) = lower($1)`, u.Email).Scan(&adminID, &hash)
	if err != nil {
		writeErr(w, 404, "Owner account not found.")
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
	if _, err := s.db.Exec(r.Context(), `UPDATE saas_admin_users SET password_hash = $1 WHERE id::text = $2`, newHash, adminID); err != nil {
		handleErr(w, err)
		return
	}
	_ = s.recordSaasAudit(r.Context(), &adminID, u.Name, "owner_password_changed", "saas_admin", adminID, nil, nil, clientIP(r))
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ownerChangeEmail lets a signed-in SaaS owner change their own login email.
// Requires current password so a stolen session can't rebind the account.
type changeEmailReq struct {
	CurrentPassword string `json:"currentPassword"`
	NewEmail        string `json:"newEmail"`
}

func (s *Server) ownerChangeEmail(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var req changeEmailReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	newEmail := strings.ToLower(strings.TrimSpace(req.NewEmail))
	if newEmail == "" || !validEmail(newEmail) {
		writeErr(w, 400, "Enter a valid email.")
		return
	}
	if req.CurrentPassword == "" {
		writeErr(w, 400, "Current password is required to change the login email.")
		return
	}
	var adminID, hash string
	if err := s.db.QueryRow(r.Context(), `SELECT id::text, password_hash FROM saas_admin_users WHERE lower(email) = lower($1)`, u.Email).Scan(&adminID, &hash); err != nil {
		writeErr(w, 404, "Owner account not found.")
		return
	}
	if !VerifyPassword(req.CurrentPassword, hash) {
		writeErr(w, 401, "Current password is incorrect.")
		return
	}
	if _, err := s.db.Exec(r.Context(), `UPDATE saas_admin_users SET email = $1 WHERE id::text = $2`, newEmail, adminID); err != nil {
		handleErr(w, err)
		return
	}
	_ = s.recordSaasAudit(r.Context(), &adminID, u.Name, "owner_email_changed", "saas_admin", adminID, nil,
		map[string]any{"from": u.Email, "to": newEmail}, clientIP(r))
	// Return the new email so the frontend can refresh the signed-in user.
	// The old token still carries the old email; the user should sign out and
	// back in to pick up the new identity (password reset target also changes).
	writeJSON(w, 200, map[string]any{"ok": true, "email": newEmail, "signOutRequired": true})
}

// ---------------------------------------------------------------- dashboard

func (s *Server) ownerDashboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	out := map[string]any{}
	// Company counts
	counts := map[string]int64{}
	rows, err := s.db.Query(ctx, `SELECT status, count(*) FROM companies GROUP BY status`)
	if err != nil {
		handleErr(w, err)
		return
	}
	for rows.Next() {
		var k string
		var n int64
		rows.Scan(&k, &n)
		counts[k] = n
	}
	rows.Close()
	var total int64
	s.db.QueryRow(ctx, `SELECT count(*) FROM companies`).Scan(&total)
	out["companies"] = map[string]any{
		"total": total, "active": counts["active"], "trial": counts["trial"],
		"suspended": counts["suspended"], "expired": counts["expired"],
		"cancelled": counts["cancelled"], "pending": counts["pending"],
	}

	// Subscriptions
	subCounts := map[string]int64{}
	rows, _ = s.db.Query(ctx, `SELECT status, count(*) FROM subscriptions GROUP BY status`)
	for rows.Next() {
		var k string
		var n int64
		rows.Scan(&k, &n)
		subCounts[k] = n
	}
	rows.Close()
	var expiringSoon int64
	s.db.QueryRow(ctx, `SELECT count(*) FROM subscriptions WHERE status IN ('active','trial') AND end_date BETWEEN current_date AND current_date + 30`).Scan(&expiringSoon)
	out["subscriptions"] = map[string]any{
		"active": subCounts["active"], "trial": subCounts["trial"],
		"expired": subCounts["expired"], "cancelled": subCounts["cancelled"],
		"expiringSoon": expiringSoon,
	}

	// Users
	var ownerCount int64
	s.db.QueryRow(ctx, `SELECT count(*) FROM company_owners WHERE status = 'active'`).Scan(&ownerCount)
	out["users"] = map[string]any{
		"companyOwners": ownerCount,
	}

	// Revenue (phase 1: calculated from subscription prices; billing not yet wired)
	var mrr, arr string
	s.db.QueryRow(ctx, `SELECT
		coalesce(sum(CASE WHEN billing_cycle='monthly' THEN monthly_price ELSE annual_price / 12 END), 0)::text,
		coalesce(sum(CASE WHEN billing_cycle='annual' THEN annual_price ELSE monthly_price * 12 END), 0)::text
		FROM subscriptions WHERE status IN ('active','trial')`).Scan(&mrr, &arr)
	out["revenue"] = map[string]any{
		"mrr": dec(mrr), "arr": dec(arr),
		"billingIntegrated": false,
		"note":              "Billing integration pending; figures are derived from subscription plan prices.",
	}

	// Expiring list
	expList := []map[string]any{}
	rows, _ = s.db.Query(ctx, `SELECT c.id::text, c.name, s.end_date, s.plan FROM subscriptions s
		JOIN companies c ON c.id = s.company_id
		WHERE s.status IN ('active','trial') AND s.end_date BETWEEN current_date AND current_date + 30
		ORDER BY s.end_date ASC LIMIT 10`)
	for rows.Next() {
		var id, name, plan string
		var end time.Time
		rows.Scan(&id, &name, &end, &plan)
		expList = append(expList, map[string]any{"companyId": id, "name": name, "endDate": end.Format("2006-01-02"), "plan": plan})
	}
	rows.Close()
	out["expiringSoonList"] = expList

	writeJSON(w, 200, out)
}

// ---------------------------------------------------------------- companies

func scanCompanyRow(row pgx.Row) (map[string]any, error) {
	var (
		id, code, slug, name, legal, street, city, state, zip, country, phone, email,
		website, industry, tz, status, url, custom, notes string
		createdBy    *string
		created, updated time.Time
	)
	if err := row.Scan(&id, &code, &slug, &name, &legal, &street, &city, &state, &zip, &country,
		&phone, &email, &website, &industry, &tz, &status, &url, &custom, &notes,
		&createdBy, &created, &updated); err != nil {
		return nil, err
	}
	return map[string]any{
		"id": id, "companyCode": code, "slug": slug, "name": name, "legalName": legal,
		"address": map[string]any{"street": street, "city": city, "state": state, "zip": zip, "country": country},
		"phone": phone, "email": email, "website": website, "industry": industry, "timezone": tz,
		"status": status, "applicationUrl": url, "customDomain": custom, "notes": notes,
		"createdBy": createdBy, "createdAt": created.UnixMilli(), "updatedAt": updated.UnixMilli(),
	}, nil
}

const companyCols = `id::text, company_code, slug, name, legal_name,
	address_street, address_city, address_state, address_zip, address_country,
	phone, email, website, industry, timezone, status, application_url, custom_domain, notes,
	created_by::text, created_at, updated_at`

func (s *Server) listCompanies(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where := []string{"1=1"}
	args := []any{}
	add := func(sql string, v any) { args = append(args, v); where = append(where, fmt.Sprintf(sql, len(args))) }
	if q.Get("status") != "" {
		add("status = $%d", q.Get("status"))
	}
	if s := strings.TrimSpace(q.Get("search")); s != "" {
		add("(name ILIKE $%d OR email ILIKE $%d OR company_code ILIKE $%d OR slug ILIKE $%d)", "%"+s+"%")
		// Reuse the one arg for all four columns (append same value three more times)
		for i := 0; i < 3; i++ {
			args = append(args, "%"+s+"%")
		}
		// Fix the placeholders in the last where entry to use consecutive args
		last := len(where) - 1
		where[last] = fmt.Sprintf("(name ILIKE $%d OR email ILIKE $%d OR company_code ILIKE $%d OR slug ILIKE $%d)",
			len(args)-3, len(args)-2, len(args)-1, len(args))
	}
	rows, err := s.db.Query(r.Context(), `SELECT `+companyCols+` FROM companies WHERE `+strings.Join(where, " AND ")+` ORDER BY created_at DESC LIMIT 500`, args...)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		c, err := scanCompanyRow(rows)
		if err != nil {
			handleErr(w, err)
			return
		}
		// Attach subscription summary
		var plan, sstatus, endStr string
		var end *time.Time
		_ = s.db.QueryRow(r.Context(), `SELECT plan, status, end_date FROM subscriptions WHERE company_id::text = $1`, c["id"]).Scan(&plan, &sstatus, &end)
		if end != nil {
			endStr = end.Format("2006-01-02")
		}
		c["subscription"] = map[string]any{"plan": plan, "status": sstatus, "endDate": endStr}
		out = append(out, c)
	}
	writeJSON(w, 200, out)
}

func (s *Server) getCompany(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	c, err := scanCompanyRow(s.db.QueryRow(r.Context(), `SELECT `+companyCols+` FROM companies WHERE id::text = $1`, id))
	if err != nil {
		handleErr(w, err)
		return
	}
	// Subscription
	var subID, plan, sstatus, cycle, payStatus string
	var monthly, annual string
	var start, end, trialStart, trialEnd *time.Time
	var autoR bool
	err = s.db.QueryRow(r.Context(), `SELECT id::text, plan, status, billing_cycle, monthly_price::text, annual_price::text,
		start_date, end_date, trial_start, trial_end, auto_renewal, payment_status
		FROM subscriptions WHERE company_id::text = $1`, id).
		Scan(&subID, &plan, &sstatus, &cycle, &monthly, &annual, &start, &end, &trialStart, &trialEnd, &autoR, &payStatus)
	if err == nil {
		c["subscription"] = map[string]any{
			"id": subID, "plan": plan, "status": sstatus, "billingCycle": cycle,
			"monthlyPrice": dec(monthly), "annualPrice": dec(annual),
			"startDate": fmtDate(start), "endDate": fmtDate(end),
			"trialStart": fmtDate(trialStart), "trialEnd": fmtDate(trialEnd),
			"autoRenewal": autoR, "paymentStatus": payStatus,
			"daysUntilExpiration": daysUntil(end),
		}
	}
	// Owners
	owners := []map[string]any{}
	rows, _ := s.db.Query(r.Context(), `SELECT id::text, first_name, last_name, email, phone, username, status, last_login_at, created_at
		FROM company_owners WHERE company_id::text = $1 ORDER BY created_at`, id)
	for rows.Next() {
		var oid, fn, ln, oe, ph, un, st string
		var ll *time.Time
		var cr time.Time
		rows.Scan(&oid, &fn, &ln, &oe, &ph, &un, &st, &ll, &cr)
		var llMS any
		if ll != nil {
			llMS = ll.UnixMilli()
		}
		owners = append(owners, map[string]any{
			"id": oid, "firstName": fn, "lastName": ln, "email": oe, "phone": ph,
			"username": un, "status": st, "lastLoginAt": llMS, "createdAt": cr.UnixMilli(),
		})
	}
	rows.Close()
	c["owners"] = owners
	// Add-on subscriptions this shop has purchased through the marketplace.
	addons := []map[string]any{}
	aRows, _ := s.db.Query(r.Context(), `SELECT s.feature_key, a.name, a.monthly_price::text, a.currency,
		s.status, s.cancel_at_period_end,
		coalesce(to_char(s.current_period_end, 'YYYY-MM-DD'), '') AS period_end,
		coalesce(to_char(s.trial_end,          'YYYY-MM-DD'), '') AS trial_end,
		s.stripe_subscription_id, s.created_at
		FROM shop_addon_subscriptions s
		JOIN addon_catalog a ON a.id = s.addon_id
		WHERE s.company_id::text = $1
		ORDER BY s.created_at DESC`, id)
	for aRows.Next() {
		var fk, aname, price, cur, st, pe, te, stripeID string
		var cancel bool
		var created time.Time
		if err := aRows.Scan(&fk, &aname, &price, &cur, &st, &cancel, &pe, &te, &stripeID, &created); err != nil {
			continue
		}
		addons = append(addons, map[string]any{
			"featureKey":           fk,
			"name":                 aname,
			"monthlyPrice":         dec(price),
			"currency":             cur,
			"status":               st,
			"cancelAtPeriodEnd":    cancel,
			"currentPeriodEnd":     pe,
			"trialEnd":             te,
			"stripeSubscriptionId": stripeID,
			"createdAt":            created.UnixMilli(),
		})
	}
	aRows.Close()
	c["addons"] = addons
	writeJSON(w, 200, c)
}

type addressInput struct {
	Street, City, State, Zip, Country string
}

type companyInput struct {
	Name            string       `json:"name"`
	LegalName       string       `json:"legalName"`
	CompanyCode     string       `json:"companyCode"`
	Slug            string       `json:"slug"`
	Address         addressInput `json:"address"`
	Phone           string       `json:"phone"`
	Email           string       `json:"email"`
	Website         string       `json:"website"`
	Industry        string       `json:"industry"`
	Timezone        string       `json:"timezone"`
	ApplicationURL  string       `json:"applicationUrl"`
	Notes           string       `json:"notes"`
	Owner           ownerInput   `json:"owner"`
	Subscription    subInput     `json:"subscription"`
}

type ownerInput struct {
	FirstName, LastName, Email, Phone, Username, Password string
}

type subInput struct {
	Plan          string
	BillingCycle  string
	MonthlyPrice  json.Number
	AnnualPrice   json.Number
	StartDate     string
	EndDate       string
	TrialEnd      string
	AutoRenewal   bool
}

func (s *Server) createCompany(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var in companyInput
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request body.")
		return
	}
	ve := ValidationError{}
	in.Name = strings.TrimSpace(in.Name)
	in.Slug = strings.ToLower(strings.TrimSpace(in.Slug))
	in.CompanyCode = strings.ToUpper(strings.TrimSpace(in.CompanyCode))
	if in.Name == "" || len(in.Name) > 200 {
		ve["name"] = "Enter the company name."
	}
	if !slugRE.MatchString(in.Slug) || len(in.Slug) > 60 {
		ve["slug"] = "Slug must be lowercase letters, numbers, and hyphens."
	}
	if !codeRE.MatchString(in.CompanyCode) {
		ve["companyCode"] = "Code must be uppercase letters, numbers, and hyphens (e.g. ABC-AUTO-001)."
	}
	if in.Owner.Email == "" || !validEmail(in.Owner.Email) {
		ve["owner.email"] = "Enter a valid owner email."
	}
	if len(in.Owner.Password) < 8 {
		ve["owner.password"] = "Owner password must be at least 8 characters."
	}
	if in.Owner.Username == "" {
		in.Owner.Username = strings.Split(in.Owner.Email, "@")[0]
	}
	if in.Subscription.Plan == "" {
		in.Subscription.Plan = "starter"
	}
	if !slices.Contains(subscriptionPlans, in.Subscription.Plan) {
		ve["subscription.plan"] = "Invalid plan."
	}
	if in.Subscription.BillingCycle == "" {
		in.Subscription.BillingCycle = "monthly"
	}
	if !slices.Contains(billingCycles, in.Subscription.BillingCycle) {
		ve["subscription.billingCycle"] = "Invalid billing cycle."
	}
	if len(ve) > 0 {
		handleErr(w, ve)
		return
	}

	ownerHash, err := HashPassword(in.Owner.Password)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}

	startD, _ := parseOptDate(in.Subscription.StartDate)
	endD, _ := parseOptDate(in.Subscription.EndDate)
	trialEndD, _ := parseOptDate(in.Subscription.TrialEnd)
	// Default start = today
	if startD == nil {
		t := time.Now().UTC()
		startD = &t
	}
	// Default end = 1 year from start (annual default)
	if endD == nil {
		t := startD.AddDate(1, 0, 0)
		endD = &t
	}

	var newCompanyID string
	err = s.tx(r.Context(), func(tx pgx.Tx) error {
		adminID, _ := saasAdminIDFromName(r.Context(), tx, u.Name)
		// New shops start active so the owner the SaaS admin just set up can
		// sign in immediately. Owners can downgrade to trial, suspend, or
		// cancel from the company detail page afterward.
		if err := tx.QueryRow(r.Context(), `INSERT INTO companies
			(company_code, slug, name, legal_name,
			 address_street, address_city, address_state, address_zip, address_country,
			 phone, email, website, industry, timezone, status, application_url, notes, created_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'active',$15,$16,$17::uuid)
			RETURNING id::text`,
			in.CompanyCode, in.Slug, in.Name, in.LegalName,
			in.Address.Street, in.Address.City, in.Address.State, in.Address.Zip, defaultStr(in.Address.Country, "US"),
			in.Phone, in.Email, in.Website, defaultStr(in.Industry, "Automotive"),
			defaultStr(in.Timezone, "America/New_York"),
			defaultAppURL(in.ApplicationURL, in.Slug), in.Notes, nullable(adminID),
		).Scan(&newCompanyID); err != nil {
			return err
		}
		if _, err := tx.Exec(r.Context(), `INSERT INTO company_owners
			(company_id, first_name, last_name, email, phone, username, password_hash)
			VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)`,
			newCompanyID, in.Owner.FirstName, in.Owner.LastName,
			strings.ToLower(strings.TrimSpace(in.Owner.Email)), in.Owner.Phone,
			strings.ToLower(strings.TrimSpace(in.Owner.Username)), ownerHash,
		); err != nil {
			return err
		}
		monthly, _ := strconv.ParseFloat(in.Subscription.MonthlyPrice.String(), 64)
		annual, _ := strconv.ParseFloat(in.Subscription.AnnualPrice.String(), 64)
		if _, err := tx.Exec(r.Context(), `INSERT INTO subscriptions
			(company_id, plan, status, billing_cycle, monthly_price, annual_price, start_date, end_date, trial_end, auto_renewal)
			VALUES ($1::uuid, $2, 'active', $3, $4, $5, $6, $7, $8, $9)`,
			newCompanyID, in.Subscription.Plan, in.Subscription.BillingCycle,
			monthly, annual, startD, endD, trialEndD, in.Subscription.AutoRenewal,
		); err != nil {
			return err
		}
		// Seed default settings so the shop owner can sign in and immediately
		// create estimates/invoices without hitting "no active labor rate".
		if err := s.InitCompanyDefaults(r.Context(), tx, newCompanyID); err != nil {
			return err
		}
		return s.recordSaasAuditTx(r.Context(), tx, &adminID, u.Name, "company_created", "company", newCompanyID, &newCompanyID,
			map[string]any{"companyCode": in.CompanyCode, "slug": in.Slug, "ownerEmail": in.Owner.Email}, clientIP(r))
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	c, _ := scanCompanyRow(s.db.QueryRow(r.Context(), `SELECT `+companyCols+` FROM companies WHERE id::text = $1`, newCompanyID))
	// Fire-and-forget welcome email from the platform mailer. A disabled or
	// misconfigured platform mailer logs and no-ops; it does NOT block creation.
	ownerFullName := strings.TrimSpace(in.Owner.FirstName + " " + in.Owner.LastName)
	go s.NotifyCompanyCreated(context.Background(), in.Owner.Email, ownerFullName, in.Name, defaultAppURL(in.ApplicationURL, in.Slug))
	writeJSON(w, 201, c)
}

type companyPatch struct {
	Name           *string      `json:"name"`
	LegalName      *string      `json:"legalName"`
	Address        *addressInput `json:"address"`
	Phone          *string      `json:"phone"`
	Email          *string      `json:"email"`
	Website        *string      `json:"website"`
	Industry       *string      `json:"industry"`
	Timezone       *string      `json:"timezone"`
	ApplicationURL *string      `json:"applicationUrl"`
	CustomDomain   *string      `json:"customDomain"`
	Notes          *string      `json:"notes"`
}

func (s *Server) updateCompany(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	u := userFrom(r.Context())
	var p companyPatch
	if err := readJSON(r, &p); err != nil {
		writeErr(w, 400, "Invalid request body.")
		return
	}
	sets, args := []string{"updated_at = now()"}, []any{}
	add := func(col string, v any) { args = append(args, v); sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args))) }
	if p.Name != nil { add("name", strings.TrimSpace(*p.Name)) }
	if p.LegalName != nil { add("legal_name", strings.TrimSpace(*p.LegalName)) }
	if p.Address != nil {
		add("address_street", p.Address.Street)
		add("address_city", p.Address.City)
		add("address_state", p.Address.State)
		add("address_zip", p.Address.Zip)
		if p.Address.Country != "" { add("address_country", p.Address.Country) }
	}
	if p.Phone != nil { add("phone", strings.TrimSpace(*p.Phone)) }
	if p.Email != nil { add("email", strings.TrimSpace(*p.Email)) }
	if p.Website != nil { add("website", strings.TrimSpace(*p.Website)) }
	if p.Industry != nil { add("industry", strings.TrimSpace(*p.Industry)) }
	if p.Timezone != nil { add("timezone", strings.TrimSpace(*p.Timezone)) }
	if p.ApplicationURL != nil { add("application_url", strings.TrimSpace(*p.ApplicationURL)) }
	if p.CustomDomain != nil { add("custom_domain", strings.TrimSpace(*p.CustomDomain)) }
	if p.Notes != nil { add("notes", *p.Notes) }
	if len(sets) == 1 {
		writeErr(w, 400, "Nothing to update.")
		return
	}
	args = append(args, id)
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), fmt.Sprintf("UPDATE companies SET %s WHERE id::text = $%d", strings.Join(sets, ", "), len(args)), args...); err != nil {
			return err
		}
		return s.recordSaasAuditTx(r.Context(), tx, nil, u.Name, "company_updated", "company", id, &id, nil, clientIP(r))
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	s.getCompany(w, r)
}

type statusChange struct {
	Status string `json:"status"`
	Reason string `json:"reason"`
}

func (s *Server) changeCompanyStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	u := userFrom(r.Context())
	var p statusChange
	if err := readJSON(r, &p); err != nil {
		writeErr(w, 400, "Invalid request body.")
		return
	}
	if !slices.Contains(companyStatuses, p.Status) {
		writeErr(w, 400, "Invalid status.")
		return
	}
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		var oldStatus string
		if err := tx.QueryRow(r.Context(), `SELECT status FROM companies WHERE id::text = $1 FOR UPDATE`, id).Scan(&oldStatus); err != nil {
			return err
		}
		if _, err := tx.Exec(r.Context(), `UPDATE companies SET status = $1, updated_at = now() WHERE id::text = $2`, p.Status, id); err != nil {
			return err
		}
		// Keep subscription status roughly in sync
		mirror := map[string]string{"suspended": "suspended", "cancelled": "cancelled", "expired": "expired", "active": "active", "trial": "trial"}
		if ss, ok := mirror[p.Status]; ok {
			_, _ = tx.Exec(r.Context(), `UPDATE subscriptions SET status = $1, updated_at = now() WHERE company_id::text = $2`, ss, id)
		}
		action := "company_status_" + p.Status
		return s.recordSaasAuditTx(r.Context(), tx, nil, u.Name, action, "company", id, &id,
			map[string]any{"from": oldStatus, "to": p.Status, "reason": p.Reason}, clientIP(r))
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	// Make the new status take effect on the very next data request.
	invalidateCompanyStatus(id)
	// Fire-and-forget status-change email to the primary owner.
	var companyName string
	_ = s.db.QueryRow(r.Context(), `SELECT name FROM companies WHERE id::text = $1`, id).Scan(&companyName)
	if email, _ := s.primaryOwnerEmail(r.Context(), id); email != "" {
		go s.NotifyCompanyStatusChange(context.Background(), email, companyName, p.Status, p.Reason)
	}
	s.getCompany(w, r)
}

// ---------------------------------------------------------------- subscriptions

func (s *Server) listSubscriptions(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where := []string{"1=1"}
	args := []any{}
	add := func(sql string, v any) { args = append(args, v); where = append(where, fmt.Sprintf(sql, len(args))) }
	if q.Get("status") != "" {
		add("s.status = $%d", q.Get("status"))
	}
	if q.Get("plan") != "" {
		add("s.plan = $%d", q.Get("plan"))
	}
	if q.Get("expiring_soon") == "true" {
		where = append(where, "s.end_date BETWEEN current_date AND current_date + 30")
	}
	rows, err := s.db.Query(r.Context(), `SELECT s.id::text, s.company_id::text, c.name, s.plan, s.status, s.billing_cycle,
		s.monthly_price::text, s.annual_price::text, s.start_date, s.end_date,
		s.trial_end, s.auto_renewal, s.payment_status, s.updated_at
		FROM subscriptions s JOIN companies c ON c.id = s.company_id
		WHERE `+strings.Join(where, " AND ")+` ORDER BY s.end_date NULLS LAST LIMIT 500`, args...)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var sid, cid, cname, plan, status, cycle, pay string
		var monthly, annual string
		var start, end, trialEnd *time.Time
		var autoR bool
		var updated time.Time
		rows.Scan(&sid, &cid, &cname, &plan, &status, &cycle, &monthly, &annual, &start, &end, &trialEnd, &autoR, &pay, &updated)
		out = append(out, map[string]any{
			"id": sid, "companyId": cid, "companyName": cname,
			"plan": plan, "status": status, "billingCycle": cycle,
			"monthlyPrice": dec(monthly), "annualPrice": dec(annual),
			"startDate": fmtDate(start), "endDate": fmtDate(end), "trialEnd": fmtDate(trialEnd),
			"autoRenewal": autoR, "paymentStatus": pay,
			"daysUntilExpiration": daysUntil(end), "updatedAt": updated.UnixMilli(),
		})
	}
	writeJSON(w, 200, out)
}

type subPatch struct {
	Plan          *string      `json:"plan"`
	Status        *string      `json:"status"`
	BillingCycle  *string      `json:"billingCycle"`
	MonthlyPrice  *json.Number `json:"monthlyPrice"`
	AnnualPrice   *json.Number `json:"annualPrice"`
	StartDate     *string      `json:"startDate"`
	EndDate       *string      `json:"endDate"`
	TrialEnd      *string      `json:"trialEnd"`
	AutoRenewal   *bool        `json:"autoRenewal"`
	PaymentStatus *string      `json:"paymentStatus"`
	ExtendDays    *int         `json:"extendDays"`
}

func (s *Server) updateSubscription(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	u := userFrom(r.Context())
	var p subPatch
	if err := readJSON(r, &p); err != nil {
		writeErr(w, 400, "Invalid request body.")
		return
	}
	sets, args := []string{"updated_at = now()"}, []any{}
	add := func(col string, v any) { args = append(args, v); sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args))) }
	if p.Plan != nil {
		if !slices.Contains(subscriptionPlans, *p.Plan) {
			writeErr(w, 400, "Invalid plan.")
			return
		}
		add("plan", *p.Plan)
	}
	if p.Status != nil {
		if !slices.Contains(subscriptionStatuses, *p.Status) {
			writeErr(w, 400, "Invalid status.")
			return
		}
		add("status", *p.Status)
	}
	if p.BillingCycle != nil {
		if !slices.Contains(billingCycles, *p.BillingCycle) {
			writeErr(w, 400, "Invalid billing cycle.")
			return
		}
		add("billing_cycle", *p.BillingCycle)
	}
	if p.MonthlyPrice != nil {
		x, _ := strconv.ParseFloat(p.MonthlyPrice.String(), 64)
		add("monthly_price", x)
	}
	if p.AnnualPrice != nil {
		x, _ := strconv.ParseFloat(p.AnnualPrice.String(), 64)
		add("annual_price", x)
	}
	if p.StartDate != nil {
		d, _ := parseOptDate(*p.StartDate)
		add("start_date", d)
	}
	if p.EndDate != nil {
		d, _ := parseOptDate(*p.EndDate)
		add("end_date", d)
	}
	if p.TrialEnd != nil {
		d, _ := parseOptDate(*p.TrialEnd)
		add("trial_end", d)
	}
	if p.AutoRenewal != nil {
		add("auto_renewal", *p.AutoRenewal)
	}
	if p.PaymentStatus != nil {
		add("payment_status", *p.PaymentStatus)
	}

	// Extend by N days from current end_date
	if p.ExtendDays != nil {
		days := *p.ExtendDays
		if days < 1 || days > 3650 {
			writeErr(w, 400, "extendDays must be between 1 and 3650.")
			return
		}
		args = append(args, days)
		sets = append(sets, fmt.Sprintf("end_date = coalesce(end_date, current_date) + ($%d || ' days')::interval", len(args)))
	}
	if len(sets) == 1 {
		writeErr(w, 400, "Nothing to update.")
		return
	}
	args = append(args, id)
	err := s.tx(r.Context(), func(tx pgx.Tx) error {
		var companyID string
		if err := tx.QueryRow(r.Context(), `SELECT company_id::text FROM subscriptions WHERE id::text = $1 FOR UPDATE`, id).Scan(&companyID); err != nil {
			return err
		}
		if _, err := tx.Exec(r.Context(), fmt.Sprintf("UPDATE subscriptions SET %s WHERE id::text = $%d", strings.Join(sets, ", "), len(args)), args...); err != nil {
			return err
		}
		return s.recordSaasAuditTx(r.Context(), tx, nil, u.Name, "subscription_updated", "subscription", id, &companyID, nil, clientIP(r))
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	// Fire-and-forget subscription-change notification. Kind is best-effort:
	// an ExtendDays patch is "extended", a plan patch is "plan_changed", a
	// status flip to active is "renewed", to expired is "expired".
	kind := ""
	switch {
	case p.ExtendDays != nil:
		kind = "extended"
	case p.Plan != nil:
		kind = "plan_changed"
	case p.Status != nil:
		// Email on every status change the owner makes so the shop always
		// hears about it. Each status maps to a kind the template layer
		// knows how to phrase.
		switch *p.Status {
		case "active":
			kind = "renewed"
		case "trial":
			kind = "trial_set"
		case "pending":
			kind = "pending_set"
		case "suspended":
			kind = "suspended_set"
		case "expired":
			kind = "expired"
		case "cancelled":
			kind = "cancelled_set"
		}
	}
	if kind != "" {
		var cid, cname, plan, cycle, endStr string
		_ = s.db.QueryRow(r.Context(), `SELECT s.company_id::text, c.name, s.plan, s.billing_cycle, coalesce(to_char(s.end_date, 'YYYY-MM-DD'), '')
			FROM subscriptions s JOIN companies c ON c.id = s.company_id WHERE s.id::text = $1`, id).
			Scan(&cid, &cname, &plan, &cycle, &endStr)
		if email, _ := s.primaryOwnerEmail(r.Context(), cid); email != "" {
			go s.NotifySubscriptionChange(context.Background(), email, cname, kind, map[string]string{
				"plan": plan, "billingCycle": cycle, "endDate": endStr,
			})
		}
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ---------------------------------------------------------------- audit log

func (s *Server) listSaasAudit(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	where := []string{"1=1"}
	args := []any{}
	if cid := q.Get("company_id"); cid != "" {
		args = append(args, cid)
		where = append(where, fmt.Sprintf("company_id::text = $%d", len(args)))
	}
	args = append(args, limit)
	rows, err := s.db.Query(r.Context(), `SELECT id, admin_user_id::text, admin_name, action, target_type, target_id, company_id::text, details, ip, created_at
		FROM saas_audit_log WHERE `+strings.Join(where, " AND ")+` ORDER BY created_at DESC, id DESC LIMIT $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var adminID, companyID *string
		var adminName, action, tType, tID, ip string
		var details []byte
		var at time.Time
		rows.Scan(&id, &adminID, &adminName, &action, &tType, &tID, &companyID, &details, &ip, &at)
		var det any
		if len(details) > 0 {
			_ = json.Unmarshal(details, &det)
		}
		out = append(out, map[string]any{
			"id": id, "adminId": adminID, "adminName": adminName,
			"action": action, "targetType": tType, "targetId": tID,
			"companyId": companyID, "details": det, "ip": ip,
			"at": at.UnixMilli(),
		})
	}
	writeJSON(w, 200, out)
}

// recordSaasAudit writes outside any transaction (for login success/failure).
func (s *Server) recordSaasAudit(ctx context.Context, adminID *string, adminName, action, tType, tID string, companyID *string, details map[string]any, ip string) error {
	b, _ := json.Marshal(details)
	_, err := s.db.Exec(ctx, `INSERT INTO saas_audit_log (admin_user_id, admin_name, action, target_type, target_id, company_id, details, ip)
		VALUES (nullif($1,'')::uuid, $2, $3, $4, $5, nullif($6,'')::uuid, $7, $8)`,
		strVal(adminID), adminName, action, tType, tID, strVal(companyID), b, ip)
	return err
}

func (s *Server) recordSaasAuditTx(ctx context.Context, tx pgx.Tx, adminID *string, adminName, action, tType, tID string, companyID *string, details map[string]any, ip string) error {
	b, _ := json.Marshal(details)
	_, err := tx.Exec(ctx, `INSERT INTO saas_audit_log (admin_user_id, admin_name, action, target_type, target_id, company_id, details, ip)
		VALUES (nullif($1,'')::uuid, $2, $3, $4, $5, nullif($6,'')::uuid, $7, $8)`,
		strVal(adminID), adminName, action, tType, tID, strVal(companyID), b, ip)
	return err
}

// ---------------------------------------------------------------- helpers

func clientIP(r *http.Request) string {
	if x := r.Header.Get("X-Forwarded-For"); x != "" {
		return strings.TrimSpace(strings.Split(x, ",")[0])
	}
	return r.RemoteAddr
}

func parseOptDate(s string) (*time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, nil
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func fmtDate(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.Format("2006-01-02")
}

func daysUntil(t *time.Time) any {
	if t == nil {
		return nil
	}
	d := int(time.Until(*t).Hours() / 24)
	return d
}

func defaultStr(s, d string) string {
	if strings.TrimSpace(s) == "" {
		return d
	}
	return s
}

func defaultAppURL(given, slug string) string {
	if strings.TrimSpace(given) != "" {
		return given
	}
	return "/t/" + slug // placeholder path-based URL; real routing comes in a later phase
}

func validEmail(s string) bool {
	_, err := mail.ParseAddress(s)
	return err == nil
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func strVal(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// GenerateRandomPassword returns a human-friendly temporary password (base32).
// Unused in phase 1 (owner creates their own at setup) but reserved for a
// future "send invite with temp password" flow.
func GenerateRandomPassword(bytes int) string {
	if bytes < 8 {
		bytes = 8
	}
	b := make([]byte, bytes)
	_, _ = rand.Read(b)
	return strings.TrimRight(base32.StdEncoding.EncodeToString(b), "=")
}

// saasAdminIDFromName looks up the saas admin's uuid by display name — used so
// audit log entries that come from a token (which doesn't carry the uuid) can
// still attribute changes to a real admin row.
func saasAdminIDFromName(ctx context.Context, tx pgx.Tx, name string) (string, error) {
	var id string
	err := tx.QueryRow(ctx, `SELECT id::text FROM saas_admin_users WHERE name = $1 LIMIT 1`, name).Scan(&id)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	return id, nil
}
