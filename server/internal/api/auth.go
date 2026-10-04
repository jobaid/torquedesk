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
}

var allPerms = []string{
	"settings.view", "settings.edit", "shop.edit", "financial_settings.edit", "document_settings.edit", "staff_settings.edit",
	"documents.edit", "documents.delete", "customers.edit", "print", "wiring.print",
	"reports.view", "sales_reports.view", "sales_reports.export", "financial_reports.view", "financial_reports.export",
}

type User struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	Role  string `json:"role"`
	Exp   int64  `json:"exp"`
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
func (s *Server) auth(perm string, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tok := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		u, ok := s.verify(tok)
		if !ok {
			writeErr(w, 401, "Your session has expired. Please sign in again.")
			return
		}
		if !u.Can(perm) {
			writeErr(w, 403, "You don't have permission to do this.")
			return
		}
		h(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, u)))
	}
}

type loginReq struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

// login is a demo sign-in: it trusts the submitted identity and role. Replace with
// a real identity provider before production use; permission checks stay the same.
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
	if _, ok := rolePerms[req.Role]; !ok {
		ve["role"] = "Unknown role."
	}
	if len(ve) > 0 {
		handleErr(w, ve)
		return
	}
	u := User{Name: req.Name, Email: req.Email, Role: req.Role, Exp: time.Now().Add(30 * 24 * time.Hour).Unix()}
	writeJSON(w, 200, map[string]any{"token": s.sign(u), "user": u, "permissions": u.Perms()})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	writeJSON(w, 200, map[string]any{"user": u, "permissions": u.Perms()})
}
