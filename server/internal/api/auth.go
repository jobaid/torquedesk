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

func (s *Server) sign(u User) string {
	body, _ := json.Marshal(u)
	p := base64.RawURLEncoding.EncodeToString(body)
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(p))
	return p + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s *Server) verify(tok string) (User, bool) {
	p, sig, ok := strings.Cut(tok, ".")
	if !ok {
		return User{}, false
	}
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(p))
	want := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(sig), []byte(want)) {
		return User{}, false
	}
	body, err := base64.RawURLEncoding.DecodeString(p)
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
	u := User{Name: req.Name, Email: req.Email, Role: req.Role, Exp: time.Now().Add(30 * 24 * time.Hour).Unix(), CompanyID: cid}
	writeJSON(w, 200, map[string]any{"token": s.sign(u), "user": u, "permissions": u.Perms()})
}

type companyLoginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
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
		ownerID, companyID, firstName, lastName, hash, status, role, cStatus string
	)
	err := s.db.QueryRow(r.Context(), `
		SELECT o.id::text, o.company_id::text, o.first_name, o.last_name, o.password_hash, o.status, o.role, c.status
		FROM company_owners o
		JOIN companies c ON c.id = o.company_id
		WHERE o.email = $1`, req.Email).
		Scan(&ownerID, &companyID, &firstName, &lastName, &hash, &status, &role, &cStatus)
	ok := err == nil && status == "active"
	if !ok {
		hash = dummy
	}
	if !VerifyPassword(req.Password, hash) || !ok {
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
	_, _ = s.db.Exec(r.Context(), `UPDATE company_owners SET last_login_at = now() WHERE id::text = $1`, ownerID)
	name := strings.TrimSpace(firstName + " " + lastName)
	if name == "" {
		name = req.Email
	}
	u := User{Name: name, Email: req.Email, Role: role, Exp: time.Now().Add(30 * 24 * time.Hour).Unix(), CompanyID: companyID}
	writeJSON(w, 200, map[string]any{"token": s.sign(u), "user": u, "permissions": u.Perms()})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	writeJSON(w, 200, map[string]any{"user": u, "permissions": u.Perms()})
}
