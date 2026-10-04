package api

import (
	"context"
	"fmt"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
)

// audit records one settings change inside the caller's transaction.
func audit(ctx context.Context, tx pgx.Tx, u User, entity string, id any, action, field, oldV, newV string) error {
	_, err := tx.Exec(ctx, `INSERT INTO settings_audit_log (user_name, user_role, entity, entity_id, action, field, old_value, new_value)
		VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''), NULLIF($8, ''))`,
		u.Name, u.Role, entity, fmt.Sprint(id), action, field, oldV, newV)
	return err
}

func (s *Server) listAudit(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	entity := r.URL.Query().Get("entity")
	rows, err := s.db.Query(r.Context(), `SELECT id, user_name, user_role, entity, entity_id, action, field,
		coalesce(old_value, ''), coalesce(new_value, ''), created_at
		FROM settings_audit_log WHERE ($1 = '' OR entity = $1) ORDER BY created_at DESC, id DESC LIMIT $2`, entity, limit)
	if err != nil {
		handleErr(w, err)
		return
	}
	type entry struct {
		ID       int64  `json:"id"`
		User     string `json:"user"`
		Role     string `json:"role"`
		Entity   string `json:"entity"`
		EntityID string `json:"entityId"`
		Action   string `json:"action"`
		Field    string `json:"field"`
		Old      string `json:"old"`
		New      string `json:"new"`
		At       any    `json:"at"`
	}
	out := []entry{}
	for rows.Next() {
		var e entry
		if err := rows.Scan(&e.ID, &e.User, &e.Role, &e.Entity, &e.EntityID, &e.Action, &e.Field, &e.Old, &e.New, &e.At); err != nil {
			handleErr(w, err)
			return
		}
		out = append(out, e)
	}
	writeJSON(w, 200, out)
}
