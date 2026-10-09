package api

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
)

// ----------------------------------------------------------------------------
// Email delivery queue.
//
// Every outbound email flows through email_jobs: callers enqueue a row and a
// background worker picks it up, calls the mailer, and marks it sent / failed
// with exponential-backoff retries. Benefits:
//   - A failing SMTP server doesn't 502 the user's request.
//   - Transient failures (greylisting, momentary network blip) retry.
//   - Every send is auditable from a UI table.
//   - Dedupe keys prevent duplicate welcome / reminder emails on event retries.
//
// Test sends (Settings → Test, Platform Email → Test) stay synchronous so the
// user gets immediate feedback that their SMTP creds work.
// ----------------------------------------------------------------------------

type emailEnqueue struct {
	Scope       string // "tenant" or "platform"
	CompanyID   string // empty for platform
	To          string
	Subject     string
	HTML        string
	Text        string
	Kind        string
	RelatedType string
	RelatedID   string
	DedupeKey   string
	MaxAttempts int
}

// enqueueEmail inserts an email_jobs row. Returns the new row id, or empty
// string with no error when a dedupe_key conflict skipped the enqueue.
func (s *Server) enqueueEmail(ctx context.Context, e emailEnqueue) (string, error) {
	e.To = strings.TrimSpace(e.To)
	if e.To == "" {
		return "", errors.New("to is required")
	}
	if e.Scope != "tenant" && e.Scope != "platform" {
		return "", errors.New("scope must be tenant or platform")
	}
	if e.Scope == "tenant" && e.CompanyID == "" {
		return "", errors.New("tenant scope requires company_id")
	}
	if e.Kind == "" {
		e.Kind = "custom"
	}
	if e.MaxAttempts <= 0 {
		e.MaxAttempts = 5
	}
	var cid any
	if e.CompanyID != "" {
		cid = e.CompanyID
	}
	// Dedupe: when a dedupe_key is set, look for an existing non-failed row
	// with the same (company_id, dedupe_key) first and skip the insert if
	// one is found. Not using a unique index/ON CONFLICT so the migration
	// stays portable across Postgres versions.
	if e.DedupeKey != "" {
		var existing string
		err := s.db.QueryRow(ctx, `SELECT id::text FROM email_jobs
			WHERE dedupe_key = $1
			  AND company_id IS NOT DISTINCT FROM $2::uuid
			  AND status IN ('pending', 'sending', 'sent')
			LIMIT 1`, e.DedupeKey, cid).Scan(&existing)
		if err == nil {
			return "", nil // duplicate silently skipped
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return "", err
		}
	}
	var id string
	err := s.db.QueryRow(ctx, `INSERT INTO email_jobs
		(company_id, scope, to_email, subject, body_html, body_text, kind,
		 related_type, related_id, dedupe_key, max_attempts)
		VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id::text`,
		cid, e.Scope, e.To, e.Subject, e.HTML, e.Text, e.Kind,
		e.RelatedType, e.RelatedID, e.DedupeKey, e.MaxAttempts,
	).Scan(&id)
	return id, err
}

// --------------------------- worker ----------------------------------------

var emailWorkerOnce sync.Once

// StartEmailJobWorker wakes every 15s to pick up due jobs. Safe to call
// multiple times.
func (s *Server) StartEmailJobWorker(ctx context.Context) {
	emailWorkerOnce.Do(func() {
		go func() {
			t := time.NewTicker(15 * time.Second)
			defer t.Stop()
			// Immediate first pass so a freshly-created job sends within seconds.
			s.runEmailJobBatch(ctx)
			for {
				select {
				case <-ctx.Done():
					return
				case <-t.C:
					s.runEmailJobBatch(ctx)
				}
			}
		}()
	})
}

// runEmailJobBatch picks up to 20 due jobs and sends them. Each row is claimed
// with SKIP LOCKED so concurrent workers (should the process scale out one
// day) don't double-send.
func (s *Server) runEmailJobBatch(ctx context.Context) {
	rows, err := s.db.Query(ctx, `SELECT id::text, coalesce(company_id::text, ''), scope,
		to_email, subject, body_html, body_text, attempts, max_attempts
		FROM email_jobs
		WHERE status = 'pending' AND next_attempt_at <= now()
		ORDER BY next_attempt_at ASC
		LIMIT 20
		FOR UPDATE SKIP LOCKED`)
	if err != nil {
		log.Printf("email worker: query failed: %v", err)
		return
	}
	type claim struct {
		ID, CID, Scope, To, Subject, HTML, Text string
		Attempts, MaxAttempts                   int
	}
	var batch []claim
	for rows.Next() {
		var c claim
		if err := rows.Scan(&c.ID, &c.CID, &c.Scope, &c.To, &c.Subject, &c.HTML, &c.Text, &c.Attempts, &c.MaxAttempts); err != nil {
			continue
		}
		batch = append(batch, c)
	}
	rows.Close()
	for _, c := range batch {
		s.processEmailJob(ctx, c.ID, c.CID, c.Scope, c.To, c.Subject, c.HTML, c.Text, c.Attempts, c.MaxAttempts)
	}
}

func (s *Server) processEmailJob(ctx context.Context, id, cid, scope, to, subject, html, text string, attempts, max int) {
	var m mailer
	var pw string
	var err error
	switch scope {
	case "tenant":
		m, pw, err = s.loadMailer(ctx, cid)
	case "platform":
		m, pw, err = s.loadPlatformMailer(ctx)
	default:
		err = errors.New("unknown scope: " + scope)
	}
	if err == nil {
		err = m.send(pw, []string{to}, subject, html, text)
	}
	if err == nil {
		_, _ = s.db.Exec(ctx, `UPDATE email_jobs SET status='sent', sent_at=now(), updated_at=now(), last_error='' WHERE id::text=$1`, id)
		return
	}
	// Failed this attempt.
	attempts++
	msg := err.Error()
	if len(msg) > 2000 {
		msg = msg[:2000]
	}
	// Permanent errors — never retry. Covers SMTP auth failures (530, 535),
	// no-such-user bounces (550 5.1.1), from-address rejections (553),
	// invalid-recipient (501, 550 5.1.1), and local config errors we throw
	// in loadMailer. Users must fix the config and hit Retry in the UI;
	// burning 5 attempts over ~3 hours just hides the real problem.
	if isPermanentMailError(msg) {
		_, _ = s.db.Exec(ctx, `UPDATE email_jobs SET status='failed', attempts=$1, last_error=$2, updated_at=now() WHERE id::text=$3`, attempts, msg, id)
		log.Printf("email job %s failed permanently (no retry): %v", id, err)
		return
	}
	if attempts >= max {
		_, _ = s.db.Exec(ctx, `UPDATE email_jobs SET status='failed', attempts=$1, last_error=$2, updated_at=now() WHERE id::text=$3`, attempts, msg, id)
		log.Printf("email job %s failed permanently after %d attempts: %v", id, attempts, err)
		return
	}
	// Exponential backoff: 30s, 2m, 10m, 30m, 2h.
	backoffs := []time.Duration{30 * time.Second, 2 * time.Minute, 10 * time.Minute, 30 * time.Minute, 2 * time.Hour}
	bo := backoffs[len(backoffs)-1]
	if attempts-1 < len(backoffs) {
		bo = backoffs[attempts-1]
	}
	_, _ = s.db.Exec(ctx, `UPDATE email_jobs SET status='pending', attempts=$1, last_error=$2,
		next_attempt_at=now() + ($3 || ' seconds')::interval, updated_at=now()
		WHERE id::text=$4`, attempts, msg, int(bo.Seconds()), id)
	log.Printf("email job %s attempt %d/%d failed, retry in %s: %v", id, attempts, max, bo, err)
}

// isPermanentMailError returns true for errors that will never succeed by
// retrying — auth rejections, invalid credentials, invalid sender/recipient,
// and local config problems (mailer not configured). Transient errors
// (connection reset, 4xx greylisting, DNS flap) still retry.
func isPermanentMailError(msg string) bool {
	m := strings.ToLower(msg)
	needles := []string{
		"530 ", "535 ", "550 ", "551 ", "553 ", "554 ",     // SMTP 5xx permanent failures
		"authentication required", "authentication failed",
		"username and password not accepted",
		"invalid credentials", "bad credentials",
		"relay access denied", "no such user",
		"smtp host and from address are required",
		"platform mailer is disabled",
		"unknown scope",
	}
	for _, n := range needles {
		if strings.Contains(m, n) {
			return true
		}
	}
	return false
}

// --------------------------- API: log + retry ------------------------------

func (s *Server) emailJobRoutes(mux *http.ServeMux) {
	// Shop-side log (tenant scope only, scoped to the signed-in company).
	mux.HandleFunc("GET /api/settings/notifications/log", s.auth("settings.view", s.listTenantEmailLog))
	mux.HandleFunc("POST /api/settings/notifications/log/{id}/retry", s.auth("shop.edit", s.retryTenantEmailJob))
	// Owner-side log (platform scope).
	mux.HandleFunc("GET /api/owner/mail/log", s.ownerAuth(s.listPlatformEmailLog))
	mux.HandleFunc("POST /api/owner/mail/log/{id}/retry", s.ownerAuth(s.retryPlatformEmailJob))
}

type emailJobRow struct {
	ID          string `json:"id"`
	Scope       string `json:"scope"`
	CompanyID   string `json:"companyId,omitempty"`
	CompanyName string `json:"companyName,omitempty"`
	To          string `json:"to"`
	Subject     string `json:"subject"`
	Kind        string `json:"kind"`
	Status      string `json:"status"`
	Attempts    int    `json:"attempts"`
	MaxAttempts int    `json:"maxAttempts"`
	LastError   string `json:"lastError"`
	CreatedAt   int64  `json:"createdAt"`
	SentAt      *int64 `json:"sentAt"`
	NextAt      int64  `json:"nextAttemptAt"`
}

func scanEmailJobs(rows pgx.Rows, withCompany bool) []emailJobRow {
	out := []emailJobRow{}
	for rows.Next() {
		var r emailJobRow
		var sentAt *time.Time
		var createdAt, nextAt time.Time
		if withCompany {
			var cname *string
			if err := rows.Scan(&r.ID, &r.Scope, &r.CompanyID, &cname, &r.To, &r.Subject, &r.Kind,
				&r.Status, &r.Attempts, &r.MaxAttempts, &r.LastError, &createdAt, &sentAt, &nextAt); err != nil {
				continue
			}
			if cname != nil {
				r.CompanyName = *cname
			}
		} else {
			if err := rows.Scan(&r.ID, &r.Scope, &r.To, &r.Subject, &r.Kind,
				&r.Status, &r.Attempts, &r.MaxAttempts, &r.LastError, &createdAt, &sentAt, &nextAt); err != nil {
				continue
			}
		}
		r.CreatedAt = createdAt.UnixMilli()
		r.NextAt = nextAt.UnixMilli()
		if sentAt != nil {
			ms := sentAt.UnixMilli()
			r.SentAt = &ms
		}
		out = append(out, r)
	}
	return out
}

func (s *Server) listTenantEmailLog(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	where := []string{"company_id::text = $1"}
	args := []any{cid}
	if st := q.Get("status"); st != "" {
		args = append(args, st)
		where = append(where, "status = $"+strconv.Itoa(len(args)))
	}
	args = append(args, limit)
	rows, err := s.db.Query(r.Context(), `SELECT id::text, scope, to_email, subject, kind,
		status, attempts, max_attempts, last_error, created_at, sent_at, next_attempt_at
		FROM email_jobs WHERE `+strings.Join(where, " AND ")+`
		ORDER BY created_at DESC LIMIT $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	writeJSON(w, 200, scanEmailJobs(rows, false))
}

func (s *Server) retryTenantEmailJob(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	id := r.PathValue("id")
	ct, err := s.db.Exec(r.Context(), `UPDATE email_jobs
		SET status='pending', attempts=0, next_attempt_at=now(), last_error='', updated_at=now()
		WHERE id::text=$1 AND company_id::text=$2 AND status IN ('failed','pending')`, id, cid)
	if err != nil {
		handleErr(w, err)
		return
	}
	if ct.RowsAffected() == 0 {
		writeErr(w, 404, "Email job not found.")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) listPlatformEmailLog(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	where := []string{"1=1"}
	args := []any{}
	if st := q.Get("status"); st != "" {
		args = append(args, st)
		where = append(where, "j.status = $"+strconv.Itoa(len(args)))
	}
	if sc := q.Get("scope"); sc != "" {
		args = append(args, sc)
		where = append(where, "j.scope = $"+strconv.Itoa(len(args)))
	}
	args = append(args, limit)
	rows, err := s.db.Query(r.Context(), `SELECT j.id::text, j.scope,
		coalesce(j.company_id::text, ''), c.name,
		j.to_email, j.subject, j.kind,
		j.status, j.attempts, j.max_attempts, j.last_error,
		j.created_at, j.sent_at, j.next_attempt_at
		FROM email_jobs j LEFT JOIN companies c ON c.id = j.company_id
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY j.created_at DESC LIMIT $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	writeJSON(w, 200, scanEmailJobs(rows, true))
}

func (s *Server) retryPlatformEmailJob(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ct, err := s.db.Exec(r.Context(), `UPDATE email_jobs
		SET status='pending', attempts=0, next_attempt_at=now(), last_error='', updated_at=now()
		WHERE id::text=$1 AND status IN ('failed','pending')`, id)
	if err != nil {
		handleErr(w, err)
		return
	}
	if ct.RowsAffected() == 0 {
		writeErr(w, 404, "Email job not found.")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}
