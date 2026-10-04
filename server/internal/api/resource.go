package api

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/mail"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Kind is the type of a settings field.
type Kind int

const (
	KString Kind = iota
	KBool
	KInt
	KDecimal     // numeric, NOT NULL
	KNullDecimal // numeric, nullable
	KDate        // date, nullable, "YYYY-MM-DD"
	KEnum
	KEnumArray
)

// Field describes one column exposed through the API. Adding a setting means
// adding a column and a Field — validation, reads, writes and audit follow.
type Field struct {
	JSON     string
	Col      string
	Kind     Kind
	Label    string
	Required bool
	Max      int     // max string length (default 500)
	Min      float64 // numeric min
	MaxNum   float64 // numeric max (0 = unbounded)
	Places   int     // decimal places to round to
	Enum     []string
	Format   string // "email", "phone", "url", "zip"
	ReadOnly bool   // computed column: returned, never written
}

// Resource is a settings table exposed as REST.
type Resource struct {
	Path      string // URL segment under /api/settings/
	Entity    string // audit entity name
	Table     string
	Perm      string // permission required to write
	Singleton bool   // single row with id = 1
	Fields    []Field
	OrderBy   string
	Label     func(row map[string]any) string // human label for audit
	// Check runs after per-field validation with the merged row (old + changes).
	Check func(merged map[string]any, ve ValidationError)
}

func (r *Resource) field(j string) *Field {
	for i := range r.Fields {
		if r.Fields[i].JSON == j {
			return &r.Fields[i]
		}
	}
	return nil
}

func selectExpr(f Field) string {
	switch f.Kind {
	case KDecimal, KNullDecimal:
		return f.Col + "::float8"
	case KDate:
		return "to_char(" + f.Col + ", 'YYYY-MM-DD')"
	}
	return f.Col
}

func (r *Resource) selectList() string {
	cols := []string{"id::text"}
	for _, f := range r.Fields {
		cols = append(cols, selectExpr(f))
	}
	cols = append(cols, "updated_at", "updated_by")
	return strings.Join(cols, ", ")
}

func (r *Resource) scanRows(rows pgx.Rows) ([]map[string]any, error) {
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			return nil, err
		}
		m := map[string]any{"id": vals[0]}
		for i, f := range r.Fields {
			v := vals[i+1]
			if f.Kind == KEnumArray {
				arr := []string{}
				if xs, ok := v.([]any); ok {
					for _, x := range xs {
						arr = append(arr, fmt.Sprint(x))
					}
				}
				v = arr
			}
			m[f.JSON] = v
		}
		m["updatedAt"] = vals[len(vals)-2]
		m["updatedBy"] = vals[len(vals)-1]
		if r.Singleton {
			delete(m, "id")
		} else if id, err := strconv.ParseInt(fmt.Sprint(vals[0]), 10, 64); err == nil {
			m["id"] = id
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *Resource) list(ctx context.Context, q pgx.Tx) ([]map[string]any, error) {
	order := r.OrderBy
	if order == "" {
		order = "id"
	}
	rows, err := q.Query(ctx, "SELECT "+r.selectList()+" FROM "+r.Table+" ORDER BY "+order)
	if err != nil {
		return nil, err
	}
	return r.scanRows(rows)
}

func (r *Resource) get(ctx context.Context, q pgx.Tx, id int64) (map[string]any, error) {
	rows, err := q.Query(ctx, "SELECT "+r.selectList()+" FROM "+r.Table+" WHERE id = $1", id)
	if err != nil {
		return nil, err
	}
	list, err := r.scanRows(rows)
	if err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return nil, pgx.ErrNoRows
	}
	return list[0], nil
}

// ---------------------------------------------------------------- validation

var (
	phoneRe = regexp.MustCompile(`^[0-9 ()+.\-x]{7,25}$`)
	urlRe   = regexp.MustCompile(`^(https?://)?[a-z0-9.-]+\.[a-z]{2,}(/.*)?$`)
	zipRe   = regexp.MustCompile(`^[A-Za-z0-9 \-]{3,10}$`)
)

func label(f Field) string {
	if f.Label != "" {
		return f.Label
	}
	return f.JSON
}

func toFloat(v any) (float64, bool) {
	switch n := v.(type) {
	case json.Number:
		x, err := n.Float64()
		return x, err == nil
	case float64:
		return n, true
	case string:
		x, err := strconv.ParseFloat(strings.TrimSpace(n), 64)
		return x, err == nil && strings.TrimSpace(n) != ""
	}
	return 0, false
}

// normalize validates one incoming value and returns the value to store.
func normalize(f Field, v any) (any, string) {
	switch f.Kind {
	case KString:
		s, ok := v.(string)
		if !ok && v != nil {
			return nil, label(f) + " must be text."
		}
		s = strings.TrimSpace(s)
		max := f.Max
		if max == 0 {
			max = 500
		}
		if len(s) > max {
			return nil, fmt.Sprintf("%s must be %d characters or fewer.", label(f), max)
		}
		if f.Required && s == "" {
			return nil, label(f) + " is required."
		}
		if s != "" {
			switch f.Format {
			case "email":
				if a, err := mail.ParseAddress(s); err != nil || a.Address != s {
					return nil, "Enter a valid email address."
				}
			case "phone":
				if !phoneRe.MatchString(s) {
					return nil, "Enter a valid phone number."
				}
			case "url":
				if !urlRe.MatchString(strings.ToLower(s)) {
					return nil, "Enter a valid website, like example.com."
				}
			case "zip":
				if !zipRe.MatchString(s) {
					return nil, "Enter a valid ZIP / postal code."
				}
			}
		}
		return s, ""
	case KBool:
		b, ok := v.(bool)
		if !ok {
			return nil, label(f) + " must be on or off."
		}
		return b, ""
	case KInt, KDecimal, KNullDecimal:
		if f.Kind == KNullDecimal && (v == nil || v == "") {
			return nil, ""
		}
		x, ok := toFloat(v)
		if !ok || math.IsNaN(x) || math.IsInf(x, 0) {
			return nil, label(f) + " must be a number."
		}
		if f.Kind == KInt && x != math.Trunc(x) {
			return nil, label(f) + " must be a whole number."
		}
		if x < f.Min {
			return nil, fmt.Sprintf("%s must be at least %s.", label(f), trimNum(f.Min))
		}
		if f.MaxNum > 0 && x > f.MaxNum {
			return nil, fmt.Sprintf("%s must be %s or less.", label(f), trimNum(f.MaxNum))
		}
		if f.Kind == KInt {
			return int64(x), ""
		}
		p := math.Pow(10, float64(max(f.Places, 2)))
		return math.Round(x*p) / p, ""
	case KDate:
		s, _ := v.(string)
		if s == "" {
			if f.Required {
				return nil, label(f) + " is required."
			}
			return nil, ""
		}
		if _, err := time.Parse("2006-01-02", s); err != nil {
			return nil, label(f) + " must be a valid date."
		}
		return s, ""
	case KEnum:
		s, _ := v.(string)
		if !slices.Contains(f.Enum, s) {
			return nil, label(f) + " has an invalid value."
		}
		return s, ""
	case KEnumArray:
		xs, ok := v.([]any)
		if !ok {
			return nil, label(f) + " must be a list."
		}
		out := []string{}
		for _, x := range xs {
			s, _ := x.(string)
			if !slices.Contains(f.Enum, s) {
				return nil, label(f) + " has an invalid value."
			}
			if !slices.Contains(out, s) {
				out = append(out, s)
			}
		}
		return out, ""
	}
	return nil, "unsupported field"
}

func trimNum(x float64) string { return strconv.FormatFloat(x, 'f', -1, 64) }

// validate checks an incoming body. On create, required fields must be present.
func (r *Resource) validate(body map[string]any, old map[string]any, creating bool) (map[string]any, error) {
	ve := ValidationError{}
	vals := map[string]any{}
	for _, f := range r.Fields {
		if f.ReadOnly {
			continue
		}
		raw, present := body[f.JSON]
		if !present {
			if creating && f.Required {
				ve[f.JSON] = label(f) + " is required."
			}
			continue
		}
		v, msg := normalize(f, raw)
		if msg != "" {
			ve[f.JSON] = msg
			continue
		}
		vals[f.JSON] = v
	}
	if r.Check != nil && len(ve) == 0 {
		merged := map[string]any{}
		for k, v := range old {
			merged[k] = v
		}
		for k, v := range vals {
			merged[k] = v
		}
		r.Check(merged, ve)
	}
	if len(ve) > 0 {
		return nil, ve
	}
	return vals, nil
}

// ---------------------------------------------------------------- handlers

func (s *Server) tx(ctx context.Context, fn func(pgx.Tx) error) error {
	return pgx.BeginFunc(ctx, s.db, fn)
}

func (s *Server) registerResource(mux *http.ServeMux, r *Resource) {
	base := "/api/settings/" + r.Path
	if r.Singleton {
		mux.HandleFunc("GET "+base, s.auth("settings.view", func(w http.ResponseWriter, req *http.Request) {
			var row map[string]any
			err := s.tx(req.Context(), func(tx pgx.Tx) (err error) { row, err = r.get(req.Context(), tx, 1); return })
			if err != nil {
				handleErr(w, err)
				return
			}
			writeJSON(w, 200, row)
		}))
		mux.HandleFunc("PUT "+base, s.auth(r.Perm, func(w http.ResponseWriter, req *http.Request) {
			s.updateRow(w, req, r, 1)
		}))
		return
	}
	mux.HandleFunc("GET "+base, s.auth("settings.view", func(w http.ResponseWriter, req *http.Request) {
		var rows []map[string]any
		err := s.tx(req.Context(), func(tx pgx.Tx) (err error) { rows, err = r.list(req.Context(), tx); return })
		if err != nil {
			handleErr(w, err)
			return
		}
		writeJSON(w, 200, rows)
	}))
	mux.HandleFunc("GET "+base+"/{id}", s.auth("settings.view", func(w http.ResponseWriter, req *http.Request) {
		id, ok := pathID(w, req)
		if !ok {
			return
		}
		var row map[string]any
		err := s.tx(req.Context(), func(tx pgx.Tx) (err error) { row, err = r.get(req.Context(), tx, id); return })
		if err != nil {
			handleErr(w, err)
			return
		}
		writeJSON(w, 200, row)
	}))
	mux.HandleFunc("POST "+base, s.auth(r.Perm, func(w http.ResponseWriter, req *http.Request) { s.createRow(w, req, r) }))
	mux.HandleFunc("PUT "+base+"/{id}", s.auth(r.Perm, func(w http.ResponseWriter, req *http.Request) {
		if id, ok := pathID(w, req); ok {
			s.updateRow(w, req, r, id)
		}
	}))
	mux.HandleFunc("PATCH "+base+"/{id}", s.auth(r.Perm, func(w http.ResponseWriter, req *http.Request) {
		if id, ok := pathID(w, req); ok {
			s.updateRow(w, req, r, id)
		}
	}))
	mux.HandleFunc("DELETE "+base+"/{id}", s.auth(r.Perm, func(w http.ResponseWriter, req *http.Request) {
		id, ok := pathID(w, req)
		if !ok {
			return
		}
		u := userFrom(req.Context())
		err := s.tx(req.Context(), func(tx pgx.Tx) error {
			old, err := r.get(req.Context(), tx, id)
			if err != nil {
				return err
			}
			if _, err := tx.Exec(req.Context(), "DELETE FROM "+r.Table+" WHERE id = $1", id); err != nil {
				return err
			}
			return audit(req.Context(), tx, u, r.Entity, id, "delete", "", r.labelOf(old), "")
		})
		if err != nil {
			handleErr(w, err)
			return
		}
		w.WriteHeader(204)
	}))
}

func pathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeErr(w, 400, "Invalid id.")
		return 0, false
	}
	return id, true
}

func (r *Resource) labelOf(row map[string]any) string {
	if r.Label != nil {
		return r.Label(row)
	}
	if n, ok := row["name"].(string); ok {
		return n
	}
	return ""
}

func (s *Server) createRow(w http.ResponseWriter, req *http.Request, r *Resource) {
	var body map[string]any
	if err := readJSON(req, &body); err != nil {
		writeErr(w, 400, "Invalid JSON body.")
		return
	}
	vals, err := r.validate(body, nil, true)
	if err != nil {
		handleErr(w, err)
		return
	}
	u := userFrom(req.Context())
	var row map[string]any
	err = s.tx(req.Context(), func(tx pgx.Tx) error {
		cols, ph, args := []string{"created_by", "updated_by"}, []string{"$1", "$1"}, []any{u.Name}
		for _, f := range r.Fields {
			if v, ok := vals[f.JSON]; ok {
				args = append(args, v)
				cols = append(cols, f.Col)
				ph = append(ph, "$"+strconv.Itoa(len(args)))
			}
		}
		var id int64
		if err := tx.QueryRow(req.Context(), fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s) RETURNING id", r.Table, strings.Join(cols, ", "), strings.Join(ph, ", ")), args...).Scan(&id); err != nil {
			return err
		}
		var err error
		if row, err = r.get(req.Context(), tx, id); err != nil {
			return err
		}
		return audit(req.Context(), tx, u, r.Entity, id, "create", "", "", r.labelOf(row))
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 201, row)
}

func (s *Server) updateRow(w http.ResponseWriter, req *http.Request, r *Resource, id int64) {
	var body map[string]any
	if err := readJSON(req, &body); err != nil {
		writeErr(w, 400, "Invalid JSON body.")
		return
	}
	u := userFrom(req.Context())
	var row map[string]any
	err := s.tx(req.Context(), func(tx pgx.Tx) error {
		// Lock the row so concurrent edits serialize and the audit diff is accurate.
		if _, err := tx.Exec(req.Context(), "SELECT 1 FROM "+r.Table+" WHERE id = $1 FOR UPDATE", id); err != nil {
			return err
		}
		old, err := r.get(req.Context(), tx, id)
		if err != nil {
			return err
		}
		vals, err := r.validate(body, old, false)
		if err != nil {
			return err
		}
		sets, args := []string{"updated_at = now()", "updated_by = $1"}, []any{u.Name}
		changed := false
		for _, f := range r.Fields {
			v, ok := vals[f.JSON]
			if !ok || sameValue(old[f.JSON], v) {
				continue
			}
			changed = true
			args = append(args, v)
			sets = append(sets, f.Col+" = $"+strconv.Itoa(len(args)))
			if err := audit(req.Context(), tx, u, r.Entity, id, "update", label(f), show(old[f.JSON]), show(v)); err != nil {
				return err
			}
		}
		if changed {
			args = append(args, id)
			if _, err := tx.Exec(req.Context(), fmt.Sprintf("UPDATE %s SET %s WHERE id = $%d", r.Table, strings.Join(sets, ", "), len(args)), args...); err != nil {
				return err
			}
		}
		row, err = r.get(req.Context(), tx, id)
		return err
	})
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, row)
}

func show(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case bool:
		if x {
			return "On"
		}
		return "Off"
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case []string:
		return strings.Join(x, ", ")
	}
	return fmt.Sprint(v)
}

func sameValue(a, b any) bool { return show(a) == show(b) }
