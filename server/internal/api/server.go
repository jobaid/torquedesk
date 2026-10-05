// Package api implements the TorqueDesk REST API.
package api

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Server struct {
	db     *pgxpool.Pool
	secret []byte
}

func New(ctx context.Context, pool *pgxpool.Pool) (*Server, error) {
	s := &Server{db: pool}
	// Token-signing secret persists in the database so sessions survive restarts.
	err := pool.QueryRow(ctx, `SELECT value FROM app_secrets WHERE name = 'token'`).Scan(&s.secret)
	if errors.Is(err, pgx.ErrNoRows) {
		s.secret = make([]byte, 32)
		if _, err := rand.Read(s.secret); err != nil {
			return nil, err
		}
		_, err = pool.Exec(ctx, `INSERT INTO app_secrets (name, value) VALUES ('token', $1)`, s.secret)
	}
	if err != nil {
		return nil, err
	}
	startLoginLimiterGC()
	return s, nil
}

// Handler wires all routes. staticDir, when it exists, is served as the SPA.
func (s *Server) Handler(staticDir string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/login", loginLimit(s.login))
	mux.HandleFunc("POST /api/auth/company-login", loginLimit(s.companyLogin))
	mux.HandleFunc("GET /api/me", s.auth("", s.me))
	mux.HandleFunc("POST /api/me/change-password", s.auth("", s.changeOwnPassword))
	mux.HandleFunc("GET /api/me/mfa/status", s.auth("", s.shopMfaStatus))
	mux.HandleFunc("POST /api/me/mfa/setup", s.auth("", s.shopMfaSetup))
	mux.HandleFunc("POST /api/me/mfa/enable", s.auth("", s.shopMfaEnable))
	mux.HandleFunc("POST /api/me/mfa/disable", s.auth("", s.shopMfaDisable))
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]string{"status": "ok"}) })

	s.settingsRoutes(mux)
	s.documentRoutes(mux)
	s.paymentRoutes(mux)
	s.reportRoutes(mux)
	s.ownerRoutes(mux)
	s.backupRoutes(mux)
	s.resetRoutes(mux)

	if st, err := os.Stat(staticDir); err == nil && st.IsDir() {
		fsrv := http.FileServer(http.Dir(staticDir))
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/") {
				writeErr(w, 404, "not found")
				return
			}
			if _, err := os.Stat(filepath.Join(staticDir, filepath.Clean(r.URL.Path))); err != nil {
				http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
				return
			}
			fsrv.ServeHTTP(w, r)
		})
	}
	return securityHeaders(logRequests(mux))
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &statusWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(rw, r)
		if strings.HasPrefix(r.URL.Path, "/api/") {
			log.Printf("%s %s %d %s", r.Method, r.URL.Path, rw.status, time.Since(start).Round(time.Millisecond))
		}
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) { w.status = code; w.ResponseWriter.WriteHeader(code) }

// ---------------------------------------------------------------- JSON helpers

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

type apiError struct {
	Error  string            `json:"error"`
	Fields map[string]string `json:"fields,omitempty"`
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, apiError{Error: msg})
}

// ValidationError carries per-field messages back to the form.
type ValidationError map[string]string

func (v ValidationError) Error() string { return "validation failed" }

func readJSON(r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, 2<<20)
	dec := json.NewDecoder(r.Body)
	dec.UseNumber()
	return dec.Decode(v)
}

// Friendly messages for named constraints.
var constraintMessages = map[string]string{
	"shop_service_writers_employee_id": "Another service writer already uses this employee ID.",
	"shop_technicians_employee_id":     "Another technician already uses this employee ID.",
	"shop_technicians_technician_id":   "Another technician already uses this technician ID.",
	"tax_rates_name":                   "A tax rate with this name already exists.",
	"shop_fees_name":                   "A shop fee with this name already exists.",
	"markup_settings_one_active":       "Only one markup per category can be active. Deactivate the existing one first.",
	"labor_rates_one_active":           "Only one labor rate can be active.",
	"shop_licenses_check":              "Expiration date must be on or after the issue date.",
	"shop_fees_check":                  "Minimum cannot be greater than maximum.",
	"documents_display_number_key":     "That document number is already in use.",
	"documents_number_type_number_key": "That document number is already in use.",
}

// handleErr maps database and validation errors to HTTP responses.
func handleErr(w http.ResponseWriter, err error) {
	var ve ValidationError
	if errors.As(err, &ve) {
		writeJSON(w, 400, apiError{Error: "Please fix the highlighted fields.", Fields: ve})
		return
	}
	var he httpError
	if errors.As(err, &he) {
		writeErr(w, he.status, he.msg)
		return
	}
	if errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, 404, "Not found.")
		return
	}
	var pe *pgconn.PgError
	if errors.As(err, &pe) {
		msg := constraintMessages[pe.ConstraintName]
		switch pe.Code {
		case "23505":
			if msg == "" {
				msg = "This value already exists."
			}
			writeErr(w, 409, msg)
			return
		case "23503":
			writeErr(w, 409, "This record is used by existing documents. Deactivate it instead of deleting.")
			return
		case "23514", "23502", "22P02", "22007", "22008":
			if msg == "" {
				msg = "A value is out of the allowed range."
			}
			writeErr(w, 400, msg)
			return
		}
	}
	log.Printf("internal error: %v", err)
	writeErr(w, 500, "Something went wrong on the server.")
}

type httpError struct {
	status int
	msg    string
}

func (e httpError) Error() string { return e.msg }

func errStatus(status int, msg string) error { return httpError{status, msg} }
