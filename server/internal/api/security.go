package api

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ----------------------------------------------------------------------------
// HTTP security hardening.
//
// 1) securityHeaders adds the headers OWASP recommends for a JSON+SPA app.
// 2) loginLimiter rate-limits authentication endpoints per client IP to blunt
//    credential-stuffing. In-process, token bucket style.
// Both are deliberately lightweight (no Redis, no external deps) so they work
// out of the box on a single-node VPS deploy.
// ----------------------------------------------------------------------------

// securityHeaders wraps a handler with hardening headers. The CSP is kept
// deliberately loose (the SPA uses inline styles and self-hosted JS); tighten
// later if we move all CSS to external files and remove inline styles.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		// CSP: allow self + inline styles (the SPA uses many inline styles).
		// Scripts are self-only. Fetches/XHR to self. Images self + data:
		// (favicons, uploaded logos served via /api). frame-ancestors 'none'
		// repeats X-Frame-Options for CSP-only browsers.
		h.Set("Content-Security-Policy",
			"default-src 'self'; "+
				"script-src 'self'; "+
				"style-src 'self' 'unsafe-inline'; "+
				"img-src 'self' data: blob:; "+
				"font-src 'self' data:; "+
				"connect-src 'self'; "+
				"frame-ancestors 'none'; "+
				"base-uri 'self'; "+
				"form-action 'self'")
		next.ServeHTTP(w, r)
	})
}

// ---------- login rate limiter ----------

type loginBucket struct {
	count  int
	resetAt time.Time
}

type ipLimiter struct {
	sync.Mutex
	m map[string]*loginBucket
}

var loginLim = &ipLimiter{m: map[string]*loginBucket{}}

const (
	loginWindow   = 5 * time.Minute
	loginMaxTries = 10
)

// loginLimit returns a middleware that caps POST attempts from one IP to a
// window. Successful logins don't reset the counter — the window is deliberate
// so a passing attacker gets throttled too.
func loginLimit(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			h(w, r)
			return
		}
		ip := clientIPForLimit(r)
		if ip == "" {
			h(w, r)
			return
		}
		loginLim.Lock()
		b, ok := loginLim.m[ip]
		now := time.Now()
		if !ok || now.After(b.resetAt) {
			b = &loginBucket{count: 0, resetAt: now.Add(loginWindow)}
			loginLim.m[ip] = b
		}
		b.count++
		over := b.count > loginMaxTries
		remaining := int(time.Until(b.resetAt).Seconds())
		loginLim.Unlock()
		if over {
			w.Header().Set("Retry-After", intToStr(remaining))
			writeErr(w, 429, "Too many sign-in attempts. Please wait a few minutes and try again.")
			return
		}
		h(w, r)
	}
}

// Garbage-collect buckets older than the window every hour so the map doesn't
// grow unbounded. Called once from Server.New via a goroutine.
func startLoginLimiterGC() {
	go func() {
		t := time.NewTicker(time.Hour)
		defer t.Stop()
		for range t.C {
			loginLim.Lock()
			now := time.Now()
			for ip, b := range loginLim.m {
				if now.After(b.resetAt) {
					delete(loginLim.m, ip)
				}
			}
			loginLim.Unlock()
		}
	}()
}

func clientIPForLimit(r *http.Request) string {
	if x := r.Header.Get("X-Forwarded-For"); x != "" {
		return strings.TrimSpace(strings.Split(x, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func intToStr(n int) string {
	if n <= 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}
