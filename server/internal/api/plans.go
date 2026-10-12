package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
)

// ----------------------------------------------------------------------------
// Owner-managed subscription plans. Replaces the hardcoded signupPlans map
// in signup.go. Backed by signup_plans table (migration 027). Shop-side
// public listing + signup activation code reads from here.
// ----------------------------------------------------------------------------

type planRow struct {
	Key          string   `json:"key"`
	Name         string   `json:"name"`
	Tagline      string   `json:"tagline"`
	MonthlyPrice float64  `json:"monthlyPrice"`
	AnnualPrice  float64  `json:"annualPrice"`
	TrialDays    int      `json:"trialDays"`
	Features     []string `json:"features"`
	Highlighted  bool     `json:"highlighted"`
	Published    bool     `json:"published"`
	DisplayOrder int      `json:"displayOrder"`
}

func (s *Server) planRoutes(mux *http.ServeMux) {
	// Owner CRUD
	mux.HandleFunc("GET /api/owner/plans",         s.ownerAuth(s.listOwnerPlans))
	mux.HandleFunc("POST /api/owner/plans",        s.ownerAuth(s.createPlan))
	mux.HandleFunc("PATCH /api/owner/plans/{key}", s.ownerAuth(s.updatePlan))
	mux.HandleFunc("DELETE /api/owner/plans/{key}",s.ownerAuth(s.deletePlan))
}

func (s *Server) listOwnerPlans(w http.ResponseWriter, r *http.Request) {
	plans, err := s.loadAllPlans(r.Context(), false)
	if err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, plans)
}

// loadAllPlans returns every plan ordered by display_order. publishedOnly
// filters to published=true (used by the public signup catalog).
func (s *Server) loadAllPlans(ctx context.Context, publishedOnly bool) ([]planRow, error) {
	where := ""
	if publishedOnly {
		where = " WHERE published = true"
	}
	rows, err := s.db.Query(ctx, `SELECT key, name, tagline, monthly_price::float, annual_price::float,
		trial_days, features, highlighted, published, display_order
		FROM signup_plans`+where+` ORDER BY display_order, key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []planRow{}
	for rows.Next() {
		var p planRow
		if err := rows.Scan(&p.Key, &p.Name, &p.Tagline, &p.MonthlyPrice, &p.AnnualPrice,
			&p.TrialDays, &p.Features, &p.Highlighted, &p.Published, &p.DisplayOrder); err != nil {
			continue
		}
		out = append(out, p)
	}
	return out, nil
}

// loadPlan returns a single plan by key, or (zero, false) if not found.
// Fire-and-forget — callers decide what to do with the miss.
func (s *Server) loadPlan(ctx context.Context, key string) (signupPlan, bool) {
	var p planRow
	err := s.db.QueryRow(ctx, `SELECT key, name, tagline, monthly_price::float, annual_price::float,
		trial_days, features, highlighted, published, display_order
		FROM signup_plans WHERE key = $1`, strings.ToLower(key)).
		Scan(&p.Key, &p.Name, &p.Tagline, &p.MonthlyPrice, &p.AnnualPrice,
			&p.TrialDays, &p.Features, &p.Highlighted, &p.Published, &p.DisplayOrder)
	if err != nil {
		return signupPlan{}, false
	}
	return signupPlan{
		Key: p.Key, Name: p.Name,
		MonthlyPrice: p.MonthlyPrice, AnnualPrice: p.AnnualPrice,
		TrialDays: p.TrialDays, Features: p.Features,
	}, true
}

type planInput struct {
	Key          string   `json:"key"`
	Name         string   `json:"name"`
	Tagline      string   `json:"tagline"`
	MonthlyPrice *float64 `json:"monthlyPrice"`
	AnnualPrice  *float64 `json:"annualPrice"`
	TrialDays    *int     `json:"trialDays"`
	Features     []string `json:"features"`
	Highlighted  *bool    `json:"highlighted"`
	Published    *bool    `json:"published"`
	DisplayOrder *int     `json:"displayOrder"`
}

var planKeyRE = regexp.MustCompile(`^[a-z][a-z0-9_]{1,30}$`)

func (s *Server) createPlan(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var in planInput
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	in.Key = strings.ToLower(strings.TrimSpace(in.Key))
	in.Name = strings.TrimSpace(in.Name)
	if !planKeyRE.MatchString(in.Key) {
		writeErr(w, 400, "Key must be 2-31 chars, lowercase letters / digits / underscores, starting with a letter.")
		return
	}
	if in.Name == "" {
		writeErr(w, 400, "Name is required.")
		return
	}
	if in.MonthlyPrice == nil || *in.MonthlyPrice < 0 {
		writeErr(w, 400, "Monthly price is required.")
		return
	}
	annual := 0.0
	if in.AnnualPrice != nil {
		annual = *in.AnnualPrice
	}
	trial := 7
	if in.TrialDays != nil {
		trial = *in.TrialDays
	}
	highlighted := false
	if in.Highlighted != nil {
		highlighted = *in.Highlighted
	}
	published := true
	if in.Published != nil {
		published = *in.Published
	}
	order := 100
	if in.DisplayOrder != nil {
		order = *in.DisplayOrder
	}
	if in.Features == nil {
		in.Features = []string{}
	}
	_, err := s.db.Exec(r.Context(), `INSERT INTO signup_plans
		(key, name, tagline, monthly_price, annual_price, trial_days, features, highlighted, published, display_order)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		in.Key, in.Name, in.Tagline, *in.MonthlyPrice, annual, trial, in.Features, highlighted, published, order)
	if err != nil {
		handleErr(w, err)
		return
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "plan_created", "plan", in.Key, nil,
		map[string]any{"name": in.Name, "monthly": *in.MonthlyPrice}, clientIP(r))
	s.listOwnerPlans(w, r)
}

func (s *Server) updatePlan(w http.ResponseWriter, r *http.Request) {
	key := strings.ToLower(r.PathValue("key"))
	u := userFrom(r.Context())
	var in planInput
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	sets := []string{"updated_at = now()"}
	args := []any{}
	add := func(c string, v any) { args = append(args, v); sets = append(sets, fmt.Sprintf("%s = $%d", c, len(args))) }
	if in.Name != "" {
		add("name", strings.TrimSpace(in.Name))
	}
	if in.Tagline != "" {
		add("tagline", in.Tagline)
	}
	if in.MonthlyPrice != nil {
		if *in.MonthlyPrice < 0 {
			writeErr(w, 400, "Monthly price must be ≥ 0.")
			return
		}
		add("monthly_price", *in.MonthlyPrice)
	}
	if in.AnnualPrice != nil {
		if *in.AnnualPrice < 0 {
			writeErr(w, 400, "Annual price must be ≥ 0.")
			return
		}
		add("annual_price", *in.AnnualPrice)
	}
	if in.TrialDays != nil {
		if *in.TrialDays < 0 || *in.TrialDays > 365 {
			writeErr(w, 400, "Trial days must be 0-365.")
			return
		}
		add("trial_days", *in.TrialDays)
	}
	if in.Features != nil {
		add("features", in.Features)
	}
	if in.Highlighted != nil {
		add("highlighted", *in.Highlighted)
	}
	if in.Published != nil {
		add("published", *in.Published)
	}
	if in.DisplayOrder != nil {
		add("display_order", *in.DisplayOrder)
	}
	if len(sets) == 1 {
		writeErr(w, 400, "Nothing to update.")
		return
	}
	args = append(args, key)
	ct, err := s.db.Exec(r.Context(),
		fmt.Sprintf("UPDATE signup_plans SET %s WHERE key = $%d", strings.Join(sets, ", "), len(args)),
		args...)
	if err != nil {
		handleErr(w, err)
		return
	}
	if ct.RowsAffected() == 0 {
		writeErr(w, 404, "Plan not found.")
		return
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "plan_updated", "plan", key, nil, nil, clientIP(r))
	s.listOwnerPlans(w, r)
}

func (s *Server) deletePlan(w http.ResponseWriter, r *http.Request) {
	key := strings.ToLower(r.PathValue("key"))
	u := userFrom(r.Context())
	var count int
	_ = s.db.QueryRow(r.Context(), `SELECT count(*) FROM subscriptions WHERE plan = $1 AND status NOT IN ('cancelled','expired')`, key).Scan(&count)
	if count > 0 {
		writeErr(w, 409, fmt.Sprintf("%d active subscription(s) are still on this plan. Migrate them to another plan first or unpublish instead of deleting.", count))
		return
	}
	ct, err := s.db.Exec(r.Context(), `DELETE FROM signup_plans WHERE key = $1`, key)
	if err != nil {
		handleErr(w, err)
		return
	}
	if ct.RowsAffected() == 0 {
		writeErr(w, 404, "Plan not found.")
		return
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "plan_deleted", "plan", key, nil, nil, clientIP(r))
	s.listOwnerPlans(w, r)
}

// Guards against unused imports when iterating.
var _ = pgx.ErrNoRows
var _ = errors.New
var _ = json.Marshal
