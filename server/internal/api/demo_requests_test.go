package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func postContact(t *testing.T, h http.HandlerFunc, ip, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/public/contact", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", ip)
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

func TestPublicContactValidation(t *testing.T) {
	s := &Server{}
	cases := []struct {
		name, body string
		want       int
	}{
		{"missing fields", `{"name":"","email":"","message":""}`, 400},
		{"bad email", `{"name":"A","email":"not-an-email","message":"hello there"}`, 400},
		{"too many links", `{"name":"A","email":"a@b.com","message":"http://x http://y http://z"}`, 400},
		{"bad json", `{`, 400},
	}
	for _, c := range cases {
		rec := postContact(t, s.publicContact, "203.0.113.1", c.body)
		if rec.Code != c.want {
			t.Errorf("%s: status %d, want %d (body %s)", c.name, rec.Code, c.want, rec.Body.String())
		}
	}
}

func TestContactLimit(t *testing.T) {
	calls := 0
	h := contactLimit(func(w http.ResponseWriter, r *http.Request) { calls++; w.WriteHeader(200) })
	ip := "198.51.100.77"
	for i := 0; i < contactMaxPosts; i++ {
		if rec := postContact(t, h, ip, `{}`); rec.Code != 200 {
			t.Fatalf("post %d: status %d, want 200", i+1, rec.Code)
		}
	}
	if rec := postContact(t, h, ip, `{}`); rec.Code != 429 {
		t.Fatalf("post over limit: status %d, want 429", rec.Code)
	}
	if calls != contactMaxPosts {
		t.Fatalf("handler ran %d times, want %d", calls, contactMaxPosts)
	}
}
