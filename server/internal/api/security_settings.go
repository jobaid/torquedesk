package api

import (
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ----------------------------------------------------------------------------
// Security & UI Protection.
//
// The SaaS owner toggles each protection independently from
// /portal/admin/security. Settings live in the DB and are read through a
// short in-memory cache, so changes apply without a restart: the browser
// shield re-fetches /api/security/config on its refresh interval.
//
// Resolution rules (also shown in the admin UI):
//   UI deterrence feature on page P =
//       master switch OFF            -> off
//       page override for P exists   -> override value
//       otherwise                    -> global value
//   Monitoring features (logging, IP, country, alerts...) use the global
//   value only and ignore the master switch.
//
// Browser deterrence (screenshots, devtools, copy) is best-effort and is
// never used to punish anyone automatically. Real protection is the backend:
// auth, tenant scoping, rate limits, CSP — none of which this file can turn off.
// ----------------------------------------------------------------------------

type secFeature struct {
	Key     string `json:"key"`
	Label   string `json:"label"`
	Desc    string `json:"description"`
	Kind    string `json:"kind"` // "ui" (browser deterrence, per page) | "monitor"
	Default bool   `json:"default"`
}

var securityCatalog = []secFeature{
	{"screenshot_deterrence", "Screenshot Deterrence", "Hides content briefly and warns when a screenshot shortcut (PrintScreen, Win+Shift+S, Cmd+Shift+3/4/5) is detected. OS screenshots cannot be fully blocked by a browser.", "ui", true},
	{"screen_recording_deterrence", "Screen Recording Deterrence", "Shows a protection overlay and logs when screen capture is started through the browser's screen-sharing API. External recorders cannot be detected.", "ui", true},
	{"right_click_restriction", "Right-Click Restriction", "Disables the context menu on protected content. Form fields keep their normal menu.", "ui", true},
	{"text_selection_restriction", "Text Selection Restriction", "Prevents selecting page text. Inputs and text areas stay fully selectable.", "ui", true},
	{"copy_paste_restriction", "Copy Restriction", "Blocks copying/cutting page content. Pasting into form fields always works.", "ui", true},
	{"drag_drop_restriction", "Drag-and-Drop Restriction", "Prevents dragging images and text out of protected pages.", "ui", true},
	{"devtools_detection", "Developer Tools Detection", "Detects docked developer tools by window-size heuristics and logs the event. Never freezes the page.", "ui", true},
	{"browser_inspection_warning", "Browser Inspection Warning", "Shows a warning banner when developer tools or inspection shortcuts are detected.", "ui", true},
	{"dynamic_watermark", "Dynamic Watermark", "Overlays a faint watermark with the user, tenant, time and a non-secret session tag.", "ui", true},
	{"print_restriction", "Print Restriction", "Blocks browser print / print-to-PDF of app screens. The app's own Print buttons (invoices, reports) keep working.", "ui", true},
	{"security_event_logging", "Security Event Logging", "Records security events (logins, detections, captures) to the security log.", "monitor", true},
	{"suspicious_activity_alerts", "Suspicious Activity Alerts", "Emails SaaS admins when a high-severity event occurs (brute force, multi-location login).", "monitor", true},
	{"session_monitoring", "Session Monitoring", "Logs every successful and failed sign-in for shop and admin accounts.", "monitor", true},
	{"ip_address_logging", "IP Address Logging", "Stores the client IP address on security events.", "monitor", true},
	{"country_detection", "Country Detection", "Stores the visitor country when available (CF-IPCountry header from Cloudflare).", "monitor", true},
	{"multiple_login_monitoring", "Multiple Login Monitoring", "Flags an account that signs in from different IP addresses within an hour.", "monitor", true},
}

type secPage struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

var securityPages = []secPage{
	{"shop_login", "Shop Manager Login"},
	{"shop_dashboard", "Shop Manager Dashboard"},
	{"orders", "Repair Orders & Sales"},
	{"customers", "Customer Management"},
	{"inspections", "Inspections"},
	{"reports", "Reports & Analytics"},
	{"settings", "Settings & Financial"},
	{"broadcast", "Customer Broadcast"},
	{"shop_other", "Other Shop Pages"},
	{"admin_login", "Admin Login"},
	{"admin_dashboard", "Admin Dashboard"},
}

const secMasterKey = "master_switch"

type watermarkCfg struct {
	Opacity        float64 `json:"opacity"`
	FontSize       int     `json:"fontSize"`
	Rotation       int     `json:"rotation"`
	Position       string  `json:"position"` // tiled | center | bottom-right
	RefreshSeconds int     `json:"refreshSeconds"`
}

var defaultWatermark = watermarkCfg{Opacity: 0.08, FontSize: 14, Rotation: -24, Position: "tiled", RefreshSeconds: 60}

type secRow struct {
	Enabled   bool            `json:"enabled"`
	Value     json.RawMessage `json:"value,omitempty"`
	UpdatedBy string          `json:"updatedBy"`
	UpdatedAt *time.Time      `json:"updatedAt"`
}

type secState struct {
	global map[string]secRow
	pages  map[string]map[string]bool
}

var secCache struct {
	sync.RWMutex
	state    *secState
	loadedAt time.Time
}

func (s *Server) invalidateSecurityCache() {
	secCache.Lock()
	secCache.state = nil
	secCache.Unlock()
}

// loadSecurityState returns the cached DB state (15s TTL).
func (s *Server) loadSecurityState(ctx context.Context) *secState {
	secCache.RLock()
	if secCache.state != nil && time.Since(secCache.loadedAt) < 15*time.Second {
		st := secCache.state
		secCache.RUnlock()
		return st
	}
	secCache.RUnlock()

	st := &secState{global: map[string]secRow{}, pages: map[string]map[string]bool{}}
	if rows, err := s.db.Query(ctx, `SELECT setting_key, is_enabled, setting_value, updated_by, updated_at FROM security_settings`); err == nil {
		for rows.Next() {
			var k string
			var r secRow
			var at time.Time
			if rows.Scan(&k, &r.Enabled, &r.Value, &r.UpdatedBy, &at) == nil {
				r.UpdatedAt = &at
				st.global[k] = r
			}
		}
		rows.Close()
	}
	if rows, err := s.db.Query(ctx, `SELECT page_key, setting_key, is_enabled FROM security_page_settings`); err == nil {
		for rows.Next() {
			var p, k string
			var on bool
			if rows.Scan(&p, &k, &on) == nil {
				if st.pages[p] == nil {
					st.pages[p] = map[string]bool{}
				}
				st.pages[p][k] = on
			}
		}
		rows.Close()
	}
	secCache.Lock()
	secCache.state, secCache.loadedAt = st, time.Now()
	secCache.Unlock()
	return st
}

func (st *secState) master() (bool, int) {
	refresh := 60
	r, ok := st.global[secMasterKey]
	if !ok {
		return true, refresh
	}
	var v struct {
		RefreshSeconds int `json:"refreshSeconds"`
	}
	if json.Unmarshal(r.Value, &v) == nil && v.RefreshSeconds >= 15 {
		refresh = v.RefreshSeconds
	}
	return r.Enabled, refresh
}

func (st *secState) globalOn(f secFeature) bool {
	if r, ok := st.global[f.Key]; ok {
		return r.Enabled
	}
	return f.Default
}

// monitorOn reports a monitoring feature's global state.
func (s *Server) monitorOn(ctx context.Context, key string) bool {
	st := s.loadSecurityState(ctx)
	for _, f := range securityCatalog {
		if f.Key == key {
			return st.globalOn(f)
		}
	}
	return false
}

func (st *secState) watermark() watermarkCfg {
	w := defaultWatermark
	if r, ok := st.global["dynamic_watermark"]; ok && len(r.Value) > 0 {
		_ = json.Unmarshal(r.Value, &w)
	}
	if w.Opacity <= 0 || w.Opacity > 0.6 {
		w.Opacity = defaultWatermark.Opacity
	}
	if w.FontSize < 8 || w.FontSize > 48 {
		w.FontSize = defaultWatermark.FontSize
	}
	if w.Rotation < -90 || w.Rotation > 90 {
		w.Rotation = defaultWatermark.Rotation
	}
	if w.Position != "center" && w.Position != "bottom-right" {
		w.Position = "tiled"
	}
	if w.RefreshSeconds < 10 {
		w.RefreshSeconds = defaultWatermark.RefreshSeconds
	}
	return w
}

// effective resolves every UI feature for one page using the rules above.
func (st *secState) effective(page string) map[string]bool {
	master, _ := st.master()
	out := map[string]bool{}
	for _, f := range securityCatalog {
		if f.Kind != "ui" {
			continue
		}
		on := st.globalOn(f)
		if ov, ok := st.pages[page][f.Key]; ok {
			on = ov
		}
		out[f.Key] = master && on
	}
	return out
}

func validPage(p string) bool {
	for _, x := range securityPages {
		if x.Key == p {
			return true
		}
	}
	return false
}

func catalogFeature(k string) (secFeature, bool) {
	for _, f := range securityCatalog {
		if f.Key == k {
			return f, true
		}
	}
	return secFeature{}, false
}

// ---------------------------------------------------------------- routes

func (s *Server) securityRoutes(mux *http.ServeMux) {
	// Public: the browser shield needs its config before login too.
	mux.HandleFunc("GET /api/security/config", s.securityConfig)
	mux.HandleFunc("POST /api/security/events", s.securityClientEvent)

	mux.HandleFunc("GET /api/owner/security/settings", s.ownerAuth(s.securityGetSettings))
	mux.HandleFunc("PUT /api/owner/security/settings", s.ownerAuth(s.securitySaveSettings))
	mux.HandleFunc("POST /api/owner/security/settings/reset", s.ownerAuth(s.securityResetSettings))
	mux.HandleFunc("GET /api/owner/security/summary", s.ownerAuth(s.securitySummary))
	mux.HandleFunc("GET /api/owner/security/events", s.ownerAuth(s.securityListEvents))
	mux.HandleFunc("POST /api/owner/security/sessions/revoke", s.ownerAuth(s.securityRevokeSessions))
	mux.HandleFunc("POST /api/owner/security/accounts/suspend", s.ownerAuth(s.securitySuspendAccount))
}

// optionalUser returns the caller if a valid token was sent, else zero User.
func (s *Server) optionalUser(r *http.Request) (User, string) {
	tok := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if tok == "" {
		return User{}, ""
	}
	u, ok := s.verify(tok)
	if !ok {
		return User{}, ""
	}
	return u, tok
}

func sessionTag(tok string) string {
	sum := sha256.Sum256([]byte(tok))
	return strings.ToUpper(hex.EncodeToString(sum[:])[:8])
}

func (s *Server) securityConfig(w http.ResponseWriter, r *http.Request) {
	page := r.URL.Query().Get("page")
	if !validPage(page) {
		page = "shop_other"
	}
	st := s.loadSecurityState(r.Context())
	master, refresh := st.master()
	resp := map[string]any{
		"page":           page,
		"master":         master,
		"refreshSeconds": refresh,
		"features":       st.effective(page),
		"watermark":      st.watermark(),
		"logEvents":      st.globalOn(secFeature{Default: true, Key: "security_event_logging"}),
	}
	if u, tok := s.optionalUser(r); tok != "" {
		resp["identity"] = map[string]any{
			"name":       u.Name,
			"email":      u.Email,
			"companyId":  u.CompanyID,
			"role":       u.Role,
			"sessionTag": sessionTag(tok),
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, 200, resp)
}

// ---------------------------------------------------------------- events

type secEvent struct {
	CompanyID string
	Email     string
	Role      string
	Type      string
	Severity  string
	Page      string
	Details   map[string]any
}

func parseUA(ua string) (browser, osName string) {
	l := strings.ToLower(ua)
	switch {
	case strings.Contains(l, "edg/"):
		browser = "Edge"
	case strings.Contains(l, "opr/") || strings.Contains(l, "opera"):
		browser = "Opera"
	case strings.Contains(l, "firefox/"):
		browser = "Firefox"
	case strings.Contains(l, "chrome/"):
		browser = "Chrome"
	case strings.Contains(l, "safari/"):
		browser = "Safari"
	case ua == "":
		browser = ""
	default:
		browser = "Other"
	}
	switch {
	case strings.Contains(l, "windows"):
		osName = "Windows"
	case strings.Contains(l, "android"):
		osName = "Android"
	case strings.Contains(l, "iphone") || strings.Contains(l, "ipad"):
		osName = "iOS"
	case strings.Contains(l, "mac os"):
		osName = "macOS"
	case strings.Contains(l, "linux"):
		osName = "Linux"
	case ua == "":
		osName = ""
	default:
		osName = "Other"
	}
	return
}

// logSecurityEvent records an event if logging is enabled. Fire-and-forget:
// a logging failure never breaks the request that triggered it.
func (s *Server) logSecurityEvent(ctx context.Context, r *http.Request, e secEvent) {
	if !s.monitorOn(ctx, "security_event_logging") {
		return
	}
	if e.Severity == "" {
		e.Severity = "info"
	}
	ip, country, ua := "", "", ""
	if r != nil {
		ua = r.UserAgent()
		if s.monitorOn(ctx, "ip_address_logging") {
			ip = clientIPForLimit(r)
		}
		if s.monitorOn(ctx, "country_detection") {
			country = strings.ToUpper(strings.TrimSpace(r.Header.Get("CF-IPCountry")))
			if len(country) != 2 {
				country = ""
			}
		}
	}
	if len(ua) > 400 {
		ua = ua[:400]
	}
	browser, osName := parseUA(ua)
	det, _ := json.Marshal(e.Details)
	if len(det) == 0 || string(det) == "null" {
		det = []byte("{}")
	}
	_, err := s.db.Exec(ctx, `INSERT INTO security_events
		(company_id, user_email, user_role, event_type, severity, page_key, ip_address, country, browser, operating_system, user_agent, event_details)
		VALUES (nullif($1,'')::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
		e.CompanyID, strings.ToLower(e.Email), e.Role, e.Type, e.Severity, e.Page, ip, country, browser, osName, ua, det)
	if err != nil {
		log.Printf("security event %s: %v", e.Type, err)
		return
	}
	if e.Severity == "high" {
		s.sendSecurityAlert(ctx, e, ip)
	}
}

func (s *Server) sendSecurityAlert(ctx context.Context, e secEvent, ip string) {
	if !s.monitorOn(ctx, "suspicious_activity_alerts") {
		return
	}
	rows, err := s.db.Query(ctx, `SELECT email FROM saas_admin_users WHERE active`)
	if err != nil {
		return
	}
	var to []string
	for rows.Next() {
		var em string
		if rows.Scan(&em) == nil && em != "" {
			to = append(to, em)
		}
	}
	rows.Close()
	if len(to) == 0 {
		return
	}
	subject := "Fixora security alert: " + strings.ReplaceAll(e.Type, "_", " ")
	body := `<p>A high-severity security event was recorded.</p><table style="font-size:13px">` +
		`<tr><td><b>Event</b></td><td>` + htmlEscape(e.Type) + `</td></tr>` +
		`<tr><td><b>Account</b></td><td>` + htmlEscape(e.Email) + `</td></tr>` +
		`<tr><td><b>IP</b></td><td>` + htmlEscape(ip) + `</td></tr>` +
		`<tr><td><b>Time</b></td><td>` + time.Now().UTC().Format(time.RFC1123) + `</td></tr></table>` +
		`<p>Review it under Admin → Security → Events. No automatic action was taken.</p>`
	hour := time.Now().UTC().Format("2006010215")
	s.SendPlatformEmail(ctx, to, subject,
		platformEmailShell(s.platformFromName(ctx), "Security alert", body, ""),
		"A high-severity security event ("+e.Type+") was recorded for "+e.Email+" from "+ip+".",
		"security_alert", "secalert:"+e.Type+":"+strings.ToLower(e.Email)+":"+ip+":"+hour)
}

// recordLoginEvent is called from the shop and owner login handlers.
func (s *Server) recordLoginEvent(r *http.Request, ok bool, email, companyID, role, page string) {
	ctx := r.Context()
	if !s.monitorOn(ctx, "session_monitoring") {
		return
	}
	typ := "login_success"
	if !ok {
		typ = "login_failed"
	}
	s.logSecurityEvent(ctx, r, secEvent{CompanyID: companyID, Email: email, Role: role, Type: typ, Page: page})

	ip := clientIPForLimit(r)
	if !ok {
		// Brute-force signal: every 5th failure from one IP in 10 minutes.
		var n int
		_ = s.db.QueryRow(ctx, `SELECT count(*) FROM security_events
			WHERE event_type = 'login_failed' AND ip_address = $1 AND created_at > now() - interval '10 minutes'`, ip).Scan(&n)
		if n > 0 && n%5 == 0 {
			s.logSecurityEvent(ctx, r, secEvent{CompanyID: companyID, Email: email, Role: role, Type: "brute_force_suspected",
				Severity: "high", Page: page, Details: map[string]any{"failedAttempts": n, "window": "10m"}})
		}
		return
	}
	if !s.monitorOn(ctx, "multiple_login_monitoring") || !s.monitorOn(ctx, "ip_address_logging") {
		return
	}
	rows, err := s.db.Query(ctx, `SELECT DISTINCT ip_address FROM security_events
		WHERE event_type = 'login_success' AND lower(user_email) = lower($1)
		  AND coalesce(company_id::text,'') = $2 AND ip_address <> '' AND ip_address <> $3
		  AND created_at > now() - interval '1 hour'`, email, companyID, ip)
	if err != nil {
		return
	}
	var others []string
	for rows.Next() {
		var x string
		if rows.Scan(&x) == nil {
			others = append(others, x)
		}
	}
	rows.Close()
	if len(others) > 0 {
		s.logSecurityEvent(ctx, r, secEvent{CompanyID: companyID, Email: email, Role: role, Type: "multiple_login",
			Severity: "high", Page: page, Details: map[string]any{"otherIps": others, "window": "1h"}})
	}
}

// Client events are whitelisted and rate-limited per IP.
var clientEventTypes = map[string]string{
	"screenshot_attempt":     "warning",
	"screen_capture_started": "warning",
	"devtools_opened":        "warning",
	"inspection_shortcut":    "info",
	"print_attempt":          "info",
	"copy_attempt":           "info",
	"right_click":            "info",
}

var clientEventLim struct {
	sync.Mutex
	m map[string]*struct {
		n     int
		reset time.Time
	}
}

func allowClientEvent(ip string) bool {
	clientEventLim.Lock()
	defer clientEventLim.Unlock()
	if clientEventLim.m == nil {
		clientEventLim.m = map[string]*struct {
			n     int
			reset time.Time
		}{}
	}
	now := time.Now()
	b := clientEventLim.m[ip]
	if b == nil || now.After(b.reset) {
		if len(clientEventLim.m) > 10000 {
			clientEventLim.m = map[string]*struct {
				n     int
				reset time.Time
			}{}
		}
		b = &struct {
			n     int
			reset time.Time
		}{0, now.Add(time.Minute)}
		clientEventLim.m[ip] = b
	}
	b.n++
	return b.n <= 30
}

func (s *Server) securityClientEvent(w http.ResponseWriter, r *http.Request) {
	if !allowClientEvent(clientIPForLimit(r)) {
		w.WriteHeader(http.StatusTooManyRequests)
		return
	}
	var in struct {
		Type    string         `json:"type"`
		Page    string         `json:"page"`
		Details map[string]any `json:"details"`
	}
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	sev, ok := clientEventTypes[in.Type]
	if !ok {
		writeErr(w, 400, "Unknown event type.")
		return
	}
	if !validPage(in.Page) {
		in.Page = "shop_other"
	}
	// Keep client-supplied details small and flat.
	clean := map[string]any{}
	for k, v := range in.Details {
		if len(clean) >= 8 || len(k) > 40 {
			break
		}
		if str, isStr := v.(string); isStr && len(str) > 200 {
			v = str[:200]
		}
		clean[k] = v
	}
	u, _ := s.optionalUser(r)
	s.logSecurityEvent(r.Context(), r, secEvent{CompanyID: u.CompanyID, Email: u.Email, Role: u.Role,
		Type: in.Type, Severity: sev, Page: in.Page, Details: clean})
	w.WriteHeader(http.StatusNoContent)
}

// ---------------------------------------------------------------- owner: settings

func (s *Server) securityGetSettings(w http.ResponseWriter, r *http.Request) {
	s.invalidateSecurityCache()
	st := s.loadSecurityState(r.Context())
	master, refresh := st.master()
	features := []map[string]any{}
	for _, f := range securityCatalog {
		row := st.global[f.Key]
		features = append(features, map[string]any{
			"key": f.Key, "label": f.Label, "description": f.Desc, "kind": f.Kind, "default": f.Default,
			"enabled": st.globalOn(f), "updatedBy": row.UpdatedBy, "updatedAt": row.UpdatedAt,
		})
	}
	mrow := st.global[secMasterKey]
	pages := map[string]map[string]bool{}
	for p, m := range st.pages {
		pages[p] = m
	}
	writeJSON(w, 200, map[string]any{
		"master":    map[string]any{"enabled": master, "refreshSeconds": refresh, "updatedBy": mrow.UpdatedBy, "updatedAt": mrow.UpdatedAt},
		"features":  features,
		"pages":     securityPages,
		"overrides": pages,
		"watermark": st.watermark(),
	})
}

type secSaveReq struct {
	Master *struct {
		Enabled        bool `json:"enabled"`
		RefreshSeconds int  `json:"refreshSeconds"`
	} `json:"master"`
	Features  map[string]bool             `json:"features"`
	Watermark *watermarkCfg               `json:"watermark"`
	Overrides map[string]map[string]*bool `json:"overrides"` // page -> key -> true/false/null(inherit)
}

func (s *Server) securitySaveSettings(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var in secSaveReq
	if err := readJSON(r, &in); err != nil {
		writeErr(w, 400, "Invalid request.")
		return
	}
	ctx := r.Context()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer tx.Rollback(ctx)
	changes := map[string]any{}
	upsert := func(key string, on bool, val []byte) error {
		if val == nil {
			val = []byte("{}")
		}
		_, err := tx.Exec(ctx, `INSERT INTO security_settings (setting_key, is_enabled, setting_value, updated_by, updated_at)
			VALUES ($1, $2, $3, $4, now())
			ON CONFLICT (setting_key) DO UPDATE SET is_enabled = EXCLUDED.is_enabled,
			  setting_value = CASE WHEN EXCLUDED.setting_value = '{}'::jsonb THEN security_settings.setting_value ELSE EXCLUDED.setting_value END,
			  updated_by = EXCLUDED.updated_by, updated_at = now()`, key, on, val, u.Email)
		return err
	}
	if in.Master != nil {
		ref := in.Master.RefreshSeconds
		if ref < 15 || ref > 3600 {
			ref = 60
		}
		v, _ := json.Marshal(map[string]int{"refreshSeconds": ref})
		if err := upsert(secMasterKey, in.Master.Enabled, v); err != nil {
			handleErr(w, err)
			return
		}
		changes["master"] = in.Master.Enabled
	}
	for k, on := range in.Features {
		if _, ok := catalogFeature(k); !ok {
			writeErr(w, 400, "Unknown setting: "+k)
			return
		}
		if err := upsert(k, on, nil); err != nil {
			handleErr(w, err)
			return
		}
		changes[k] = on
	}
	if in.Watermark != nil {
		v, _ := json.Marshal(in.Watermark)
		cur := true
		if on, ok := in.Features["dynamic_watermark"]; ok {
			cur = on
		} else {
			wf, _ := catalogFeature("dynamic_watermark")
			cur = s.loadSecurityState(ctx).globalOn(wf)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO security_settings (setting_key, is_enabled, setting_value, updated_by, updated_at)
			VALUES ('dynamic_watermark', $1, $2, $3, now())
			ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
			cur, v, u.Email); err != nil {
			handleErr(w, err)
			return
		}
		changes["watermark"] = in.Watermark
	}
	for page, m := range in.Overrides {
		if !validPage(page) {
			writeErr(w, 400, "Unknown page: "+page)
			return
		}
		for k, v := range m {
			f, ok := catalogFeature(k)
			if !ok || f.Kind != "ui" {
				writeErr(w, 400, "Page overrides only apply to UI protections: "+k)
				return
			}
			if v == nil {
				_, err = tx.Exec(ctx, `DELETE FROM security_page_settings WHERE page_key = $1 AND setting_key = $2`, page, k)
			} else {
				_, err = tx.Exec(ctx, `INSERT INTO security_page_settings (page_key, setting_key, is_enabled, updated_by, updated_at)
					VALUES ($1, $2, $3, $4, now())
					ON CONFLICT (page_key, setting_key) DO UPDATE SET is_enabled = EXCLUDED.is_enabled, updated_by = EXCLUDED.updated_by, updated_at = now()`,
					page, k, *v, u.Email)
			}
			if err != nil {
				handleErr(w, err)
				return
			}
		}
		changes["overrides:"+page] = m
	}
	if err := tx.Commit(ctx); err != nil {
		handleErr(w, err)
		return
	}
	s.invalidateSecurityCache()
	_ = s.recordSaasAudit(ctx, nil, u.Name, "security_settings_updated", "security", "settings", nil, changes, clientIP(r))
	s.securityGetSettings(w, r)
}

func (s *Server) securityResetSettings(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	ctx := r.Context()
	if _, err := s.db.Exec(ctx, `DELETE FROM security_settings`); err != nil {
		handleErr(w, err)
		return
	}
	_, _ = s.db.Exec(ctx, `DELETE FROM security_page_settings`)
	s.invalidateSecurityCache()
	_ = s.recordSaasAudit(ctx, nil, u.Name, "security_settings_reset", "security", "settings", nil, nil, clientIP(r))
	s.securityGetSettings(w, r)
}

// ---------------------------------------------------------------- owner: monitoring

func (s *Server) securitySummary(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	byType := map[string]int{}
	if rows, err := s.db.Query(ctx, `SELECT event_type, count(*) FROM security_events
		WHERE created_at > now() - interval '24 hours' GROUP BY event_type`); err == nil {
		for rows.Next() {
			var t string
			var n int
			if rows.Scan(&t, &n) == nil {
				byType[t] = n
			}
		}
		rows.Close()
	}
	var total, high, total7 int
	_ = s.db.QueryRow(ctx, `SELECT
		count(*) FILTER (WHERE created_at > now() - interval '24 hours'),
		count(*) FILTER (WHERE created_at > now() - interval '24 hours' AND severity = 'high'),
		count(*) FILTER (WHERE created_at > now() - interval '7 days')
		FROM security_events`).Scan(&total, &high, &total7)
	topIPs := []map[string]any{}
	if rows, err := s.db.Query(ctx, `SELECT ip_address, count(*) FROM security_events
		WHERE created_at > now() - interval '24 hours' AND ip_address <> ''
		GROUP BY ip_address ORDER BY count(*) DESC LIMIT 5`); err == nil {
		for rows.Next() {
			var ip string
			var n int
			if rows.Scan(&ip, &n) == nil {
				topIPs = append(topIPs, map[string]any{"ip": ip, "count": n})
			}
		}
		rows.Close()
	}
	writeJSON(w, 200, map[string]any{"last24h": total, "high24h": high, "last7d": total7, "byType": byType, "topIps": topIPs})
}

func (s *Server) securityListEvents(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where := []string{"1=1"}
	args := []any{}
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, strings.ReplaceAll(cond, "$?", "$"+strconv.Itoa(len(args))))
	}
	if v := strings.TrimSpace(q.Get("ip")); v != "" {
		add("e.ip_address = $?", v)
	}
	if v := strings.TrimSpace(q.Get("company")); v != "" {
		add("(e.company_id::text = $? OR c.name ILIKE '%' || $? || '%')", v) // both $? -> same arg
	}
	if v := strings.TrimSpace(q.Get("user")); v != "" {
		add("e.user_email ILIKE '%' || $? || '%'", v)
	}
	if v := strings.TrimSpace(q.Get("type")); v != "" {
		add("e.event_type = $?", v)
	}
	if v := strings.TrimSpace(q.Get("severity")); v != "" {
		add("e.severity = $?", v)
	}
	if v := strings.TrimSpace(q.Get("from")); v != "" {
		add("e.created_at >= $?::timestamptz", v)
	}
	if v := strings.TrimSpace(q.Get("to")); v != "" {
		add("e.created_at <= $?::timestamptz", v)
	}
	limit := 200
	if n, err := strconv.Atoi(q.Get("limit")); err == nil && n > 0 && n <= 5000 {
		limit = n
	}
	sql := `SELECT e.id, coalesce(e.company_id::text,''), coalesce(c.name,''), e.user_email, e.user_role, e.event_type,
		e.severity, e.page_key, e.ip_address, e.country, e.browser, e.operating_system, e.event_details, e.created_at
		FROM security_events e LEFT JOIN companies c ON c.id = e.company_id
		WHERE ` + strings.Join(where, " AND ") + ` ORDER BY e.created_at DESC LIMIT ` + strconv.Itoa(limit)
	rows, err := s.db.Query(r.Context(), sql, args...)
	if err != nil {
		handleErr(w, err)
		return
	}
	defer rows.Close()
	type ev struct {
		ID          int64           `json:"id"`
		CompanyID   string          `json:"companyId"`
		CompanyName string          `json:"companyName"`
		Email       string          `json:"email"`
		Role        string          `json:"role"`
		Type        string          `json:"type"`
		Severity    string          `json:"severity"`
		Page        string          `json:"page"`
		IP          string          `json:"ip"`
		Country     string          `json:"country"`
		Browser     string          `json:"browser"`
		OS          string          `json:"os"`
		Details     json.RawMessage `json:"details"`
		CreatedAt   time.Time       `json:"createdAt"`
	}
	out := []ev{}
	for rows.Next() {
		var e ev
		if err := rows.Scan(&e.ID, &e.CompanyID, &e.CompanyName, &e.Email, &e.Role, &e.Type, &e.Severity, &e.Page,
			&e.IP, &e.Country, &e.Browser, &e.OS, &e.Details, &e.CreatedAt); err == nil {
			out = append(out, e)
		}
	}
	if q.Get("format") != "csv" {
		writeJSON(w, 200, out)
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="fixora-security-events-%s.csv"`, time.Now().Format("20060102-1504")))
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"time_utc", "event", "severity", "company", "company_id", "user", "role", "page", "ip", "country", "browser", "os", "details"})
	for _, e := range out {
		_ = cw.Write([]string{e.CreatedAt.UTC().Format(time.RFC3339), e.Type, e.Severity, csvSafe(e.CompanyName), e.CompanyID,
			csvSafe(e.Email), e.Role, e.Page, e.IP, e.Country, e.Browser, e.OS, csvSafe(string(e.Details))})
	}
	cw.Flush()
}

// csvSafe neutralises spreadsheet formula injection.
func csvSafe(v string) string {
	if v != "" && strings.ContainsRune("=+-@\t\r", rune(v[0])) {
		return "'" + v
	}
	return v
}

type secAccountReq struct {
	Email     string `json:"email"`
	CompanyID string `json:"companyId"`
	Suspend   bool   `json:"suspend"`
}

func (s *Server) revokeSubject(ctx context.Context, email, companyID, by string) error {
	_, err := s.db.Exec(ctx, `INSERT INTO security_session_revocations (subject, revoked_at, revoked_by)
		VALUES ($1, now(), $2) ON CONFLICT (subject) DO UPDATE SET revoked_at = now(), revoked_by = EXCLUDED.revoked_by`,
		strings.ToLower(strings.TrimSpace(email))+"|"+strings.TrimSpace(companyID), by)
	invalidateRevocations()
	return err
}

func (s *Server) securityRevokeSessions(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var in secAccountReq
	if err := readJSON(r, &in); err != nil || strings.TrimSpace(in.Email) == "" {
		writeErr(w, 400, "email is required.")
		return
	}
	if err := s.revokeSubject(r.Context(), in.Email, in.CompanyID, u.Email); err != nil {
		handleErr(w, err)
		return
	}
	cid := in.CompanyID
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, "security_sessions_revoked", "user", in.Email, &cid, nil, clientIP(r))
	s.logSecurityEvent(r.Context(), r, secEvent{CompanyID: in.CompanyID, Email: in.Email, Type: "sessions_revoked",
		Severity: "info", Page: "admin_dashboard", Details: map[string]any{"by": u.Email}})
	writeJSON(w, 200, map[string]any{"ok": true})
}

// securitySuspendAccount disables (or re-enables) one shop user and revokes
// their sessions. Only shop accounts — never the owner's own login.
func (s *Server) securitySuspendAccount(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var in secAccountReq
	if err := readJSON(r, &in); err != nil || strings.TrimSpace(in.Email) == "" || strings.TrimSpace(in.CompanyID) == "" {
		writeErr(w, 400, "email and companyId are required (shop accounts only).")
		return
	}
	status := "active"
	if in.Suspend {
		status = "disabled"
	}
	tag, err := s.db.Exec(r.Context(), `UPDATE company_owners SET status = $1, updated_at = now()
		WHERE lower(email) = lower($2) AND company_id::text = $3`, status, in.Email, in.CompanyID)
	if err != nil {
		handleErr(w, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeErr(w, 404, "No shop account with that email in that company.")
		return
	}
	if in.Suspend {
		_ = s.revokeSubject(r.Context(), in.Email, in.CompanyID, u.Email)
	}
	cid := in.CompanyID
	action := "security_account_reactivated"
	if in.Suspend {
		action = "security_account_suspended"
	}
	_ = s.recordSaasAudit(r.Context(), nil, u.Name, action, "company_owner", in.Email, &cid, nil, clientIP(r))
	s.logSecurityEvent(r.Context(), r, secEvent{CompanyID: in.CompanyID, Email: in.Email, Type: action[len("security_"):],
		Severity: "info", Page: "admin_dashboard", Details: map[string]any{"by": u.Email}})
	writeJSON(w, 200, map[string]any{"ok": true, "status": status})
}

// ---------------------------------------------------------------- revocation cache

var revCache struct {
	sync.RWMutex
	m        map[string]int64
	loadedAt time.Time
}

func invalidateRevocations() {
	revCache.Lock()
	revCache.m = nil
	revCache.Unlock()
}

// isRevoked reports whether a token was issued before its subject's last
// revocation. Cached 20s; a DB error fails open (never locks everyone out).
func (s *Server) isRevoked(u User) bool {
	revCache.RLock()
	m, fresh := revCache.m, time.Since(revCache.loadedAt) < 20*time.Second
	revCache.RUnlock()
	if m == nil || !fresh {
		next := map[string]int64{}
		rows, err := s.db.Query(context.Background(), `SELECT subject, revoked_at FROM security_session_revocations`)
		if err != nil {
			return false
		}
		for rows.Next() {
			var sub string
			var at time.Time
			if rows.Scan(&sub, &at) == nil {
				next[sub] = at.Unix()
			}
		}
		rows.Close()
		revCache.Lock()
		revCache.m, revCache.loadedAt = next, time.Now()
		revCache.Unlock()
		m = next
	}
	at, ok := m[strings.ToLower(u.Email)+"|"+u.CompanyID]
	return ok && u.Iat < at
}
