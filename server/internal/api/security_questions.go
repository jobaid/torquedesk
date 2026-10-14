package api

// Shop-user security questions.
//
// Flow:
//   1. User picks 2 questions from the catalog + enters answers.
//      Answers are normalized (trim + lowercase) then Argon2id-hashed.
//   2. On login, after the password check succeeds, if the account has
//      questions set, companyLogin returns the two question texts and the
//      client must re-submit with answers to receive a token.

import (
	"net/http"
	"strings"
)

// Keep this list stable — the index is the stored value. Add new items at
// the end only; renumbering breaks every existing account.
var SecurityQuestionCatalog = []string{
	"What was the name of your first pet?",
	"What city were you born in?",
	"What is your mother's maiden name?",
	"What was the make of your first car?",
	"What is the name of your favorite teacher?",
	"What was the name of your elementary school?",
	"What street did you grow up on?",
	"What is the name of the hospital where you were born?",
	"What was your childhood nickname?",
	"What is the first name of your best friend in high school?",
}

func (s *Server) securityQuestionRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/security-questions/catalog", s.listSecurityQuestionCatalog)
	mux.HandleFunc("GET /api/me/security-questions", s.auth("", s.getMySecurityQuestions))
	mux.HandleFunc("POST /api/me/security-questions", s.auth("", s.setMySecurityQuestions))
	mux.HandleFunc("POST /api/me/security-questions/disable", s.auth("", s.disableMySecurityQuestions))
}

type catalogEntry struct {
	Index int    `json:"index"`
	Text  string `json:"text"`
}

func (s *Server) listSecurityQuestionCatalog(w http.ResponseWriter, r *http.Request) {
	out := make([]catalogEntry, len(SecurityQuestionCatalog))
	for i, q := range SecurityQuestionCatalog {
		out[i] = catalogEntry{Index: i, Text: q}
	}
	writeJSON(w, 200, out)
}

func (s *Server) getMySecurityQuestions(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var q1, q2 *int
	err := s.db.QueryRow(r.Context(),
		`SELECT security_q1, security_q2 FROM company_owners
		 WHERE lower(email) = lower($1) AND company_id::text = $2`,
		u.Email, u.CompanyID).Scan(&q1, &q2)
	if err != nil {
		handleErr(w, err)
		return
	}
	resp := map[string]any{"enabled": q1 != nil && q2 != nil, "catalog": SecurityQuestionCatalog}
	if q1 != nil {
		resp["question1"] = *q1
	}
	if q2 != nil {
		resp["question2"] = *q2
	}
	writeJSON(w, 200, resp)
}

type setQReq struct {
	Question1 int    `json:"question1"`
	Answer1   string `json:"answer1"`
	Question2 int    `json:"question2"`
	Answer2   string `json:"answer2"`
}

func (s *Server) setMySecurityQuestions(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var in setQReq
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	if !validQIdx(in.Question1) || !validQIdx(in.Question2) {
		writeErr(w, 400, "Pick two questions from the list.")
		return
	}
	if in.Question1 == in.Question2 {
		writeErr(w, 400, "Pick two different questions.")
		return
	}
	a1 := normalizeAnswer(in.Answer1)
	a2 := normalizeAnswer(in.Answer2)
	if len(a1) < 2 || len(a2) < 2 {
		writeErr(w, 400, "Each answer must be at least 2 characters.")
		return
	}
	h1, err := HashPassword(a1)
	if err != nil {
		handleErr(w, err)
		return
	}
	h2, err := HashPassword(a2)
	if err != nil {
		handleErr(w, err)
		return
	}
	if _, err := s.db.Exec(r.Context(), `
		UPDATE company_owners
		   SET security_q1 = $1, security_a1_hash = $2,
		       security_q2 = $3, security_a2_hash = $4
		 WHERE lower(email) = lower($5) AND company_id::text = $6`,
		in.Question1, h1, in.Question2, h2, u.Email, u.CompanyID); err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) disableMySecurityQuestions(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	if _, err := s.db.Exec(r.Context(), `
		UPDATE company_owners
		   SET security_q1 = NULL, security_a1_hash = '',
		       security_q2 = NULL, security_a2_hash = ''
		 WHERE lower(email) = lower($1) AND company_id::text = $2`,
		u.Email, u.CompanyID); err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func validQIdx(i int) bool { return i >= 0 && i < len(SecurityQuestionCatalog) }

func normalizeAnswer(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}
