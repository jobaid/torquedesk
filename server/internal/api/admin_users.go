package api

// SaaS admin-user management. Owner creates teammates (manager / support /
// owner) with their own email + password; each one signs in through the
// standard Owner Portal login. Role is purely metadata today — every active
// admin can still see the whole portal — but the field is in place for a
// future permission pass.

import (
	"net/http"
	"strconv"
	"strings"
	"time"
)

var adminRoles = map[string]bool{"owner": true, "manager": true, "support": true}

func (s *Server) adminUserRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/owner/admin-users", s.ownerAuth(s.listAdminUsers))
	mux.HandleFunc("POST /api/owner/admin-users", s.ownerAuth(s.createAdminUser))
	mux.HandleFunc("PATCH /api/owner/admin-users/{id}", s.ownerAuth(s.updateAdminUser))
	mux.HandleFunc("DELETE /api/owner/admin-users/{id}", s.ownerAuth(s.deleteAdminUser))
}

func (s *Server) listAdminUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `
		SELECT id::text, email, name, coalesce(role,'owner'), active, created_at, last_login_at
		  FROM saas_admin_users ORDER BY created_at`)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, email, name, role string
		var active bool
		var created time.Time
		var lastLogin *time.Time
		if err := rows.Scan(&id, &email, &name, &role, &active, &created, &lastLogin); err != nil {
			handleErr(w, err)
			return
		}
		out = append(out, map[string]any{
			"id": id, "email": email, "name": name, "role": role,
			"active": active, "createdAt": created, "lastLoginAt": lastLogin,
		})
	}
	writeJSON(w, 200, out)
}

type createAdminReq struct {
	Email    string `json:"email"`
	Name     string `json:"name"`
	Role     string `json:"role"`
	Password string `json:"password"`
}

func (s *Server) createAdminUser(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var in createAdminReq
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.Name = strings.TrimSpace(in.Name)
	if in.Email == "" || in.Name == "" || len(in.Password) < 8 {
		writeErr(w, 400, "Email, name, and a password of at least 8 characters are required.")
		return
	}
	if !adminRoles[in.Role] {
		in.Role = "support"
	}
	hash, err := HashPassword(in.Password)
	if err != nil {
		handleErr(w, err)
		return
	}
	var id string
	err = s.db.QueryRow(r.Context(), `
		INSERT INTO saas_admin_users (email, name, password_hash, role, active)
		VALUES ($1, $2, $3, $4, true) RETURNING id::text`,
		in.Email, in.Name, hash, in.Role).Scan(&id)
	if err != nil {
		handleErr(w, err)
		return
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "admin_user_created", "saas_admin", id, nil,
		map[string]any{"email": in.Email, "role": in.Role}, clientIP(r))
	writeJSON(w, 201, map[string]any{"id": id})
}

type updateAdminReq struct {
	Name     *string `json:"name"`
	Role     *string `json:"role"`
	Active   *bool   `json:"active"`
	Password *string `json:"password"`
}

func (s *Server) updateAdminUser(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	id := r.PathValue("id")
	var in updateAdminReq
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	sets := []string{}
	args := []any{}
	add := func(expr string, v any) {
		args = append(args, v)
		sets = append(sets, expr+" = $"+strconv.Itoa(len(args)))
	}
	if in.Name != nil && strings.TrimSpace(*in.Name) != "" {
		add("name", strings.TrimSpace(*in.Name))
	}
	if in.Role != nil && adminRoles[*in.Role] {
		add("role", *in.Role)
	}
	if in.Active != nil {
		add("active", *in.Active)
	}
	if in.Password != nil && *in.Password != "" {
		if len(*in.Password) < 8 {
			writeErr(w, 400, "Password must be at least 8 characters.")
			return
		}
		hash, err := HashPassword(*in.Password)
		if err != nil {
			handleErr(w, err)
			return
		}
		add("password_hash", hash)
	}
	if len(sets) == 0 {
		writeJSON(w, 200, map[string]any{"ok": true, "noop": true})
		return
	}
	args = append(args, id)
	sql := "UPDATE saas_admin_users SET " + strings.Join(sets, ", ") + " WHERE id::text = $" + strconv.Itoa(len(args))
	if _, err := s.db.Exec(r.Context(), sql, args...); err != nil {
		handleErr(w, err)
		return
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "admin_user_updated", "saas_admin", id, nil, nil, clientIP(r))
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) deleteAdminUser(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	id := r.PathValue("id")
	// Refuse to delete the last remaining active admin, so you can't lock
	// yourself out of the portal.
	var active int
	if err := s.db.QueryRow(r.Context(),
		`SELECT count(*) FROM saas_admin_users WHERE active AND id::text <> $1`, id).Scan(&active); err != nil {
		handleErr(w, err)
		return
	}
	if active == 0 {
		writeErr(w, 400, "Cannot remove the last active admin user.")
		return
	}
	var email, role string
	_ = s.db.QueryRow(r.Context(),
		`SELECT email, coalesce(role,'') FROM saas_admin_users WHERE id::text = $1`, id).Scan(&email, &role)
	if _, err := s.db.Exec(r.Context(), `DELETE FROM saas_admin_users WHERE id::text = $1`, id); err != nil {
		handleErr(w, err)
		return
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "admin_user_deleted", "saas_admin", id, nil,
		map[string]any{"email": email, "role": role}, clientIP(r))
	writeJSON(w, 200, map[string]any{"ok": true})
}

