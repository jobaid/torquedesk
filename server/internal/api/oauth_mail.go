package api

// Email OAuth for Gmail (Google) and Outlook (Microsoft) — XOAUTH2 SMTP.
//
// Flow:
//  1. Shop user clicks "Sign in with Google" (or Microsoft) in Settings →
//     Notifications → wizard. Frontend POSTs to /api/mail/oauth/{provider}/start
//     which returns the provider's authorize URL (built from env-var client ID,
//     signed state token).
//  2. User signs in at Google/Microsoft, approves SMTP scope, is redirected
//     back to /api/mail/oauth/{provider}/callback?code=…&state=…
//  3. Callback exchanges the code for an access_token + refresh_token, stores
//     the refresh token encrypted at rest, closes the popup with a success
//     postMessage so the opener can refresh its status.
//  4. mailer.send() checks for a stored OAuth token for the active tenant +
//     provider; if present, requests a fresh access token (uses cache when
//     unexpired) and uses XOAUTH2 as the SMTP AUTH mechanism. Otherwise it
//     falls back to the password-based SMTP auth already in notifications.go.
//
// Env vars (set on the server for OAuth to be available):
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   MICROSOFT_OAUTH_CLIENT_ID
//   MICROSOFT_OAUTH_CLIENT_SECRET
//   OAUTH_REDIRECT_BASE  (default: derive from request)
//
// When a provider's client vars are missing, the /start handler returns a
// 503 "not configured" and the UI falls back to the app-password wizard.

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type oauthProvider struct {
	Name            string
	AuthURL         string
	TokenURL        string
	Scopes          []string
	UserInfoURL     string
	UserInfoEmail   func([]byte) string
	ClientIDEnv     string
	ClientSecretEnv string
	// Extra query params on the authorize URL to force a refresh_token on repeat
	// consent (Google needs prompt=consent + access_type=offline).
	ExtraAuth map[string]string
}

var oauthProviders = map[string]oauthProvider{
	"google": {
		Name:            "google",
		AuthURL:         "https://accounts.google.com/o/oauth2/v2/auth",
		TokenURL:        "https://oauth2.googleapis.com/token",
		Scopes:          []string{"https://mail.google.com/", "openid", "email"},
		UserInfoURL:     "https://openidconnect.googleapis.com/v1/userinfo",
		UserInfoEmail:   extractGoogleEmail,
		ClientIDEnv:     "GOOGLE_OAUTH_CLIENT_ID",
		ClientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
		ExtraAuth: map[string]string{
			"access_type":            "offline",
			"prompt":                 "consent",
			"include_granted_scopes": "true",
		},
	},
	"microsoft": {
		Name:            "microsoft",
		AuthURL:         "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
		TokenURL:        "https://login.microsoftonline.com/common/oauth2/v2.0/token",
		Scopes:          []string{"https://outlook.office.com/SMTP.Send", "offline_access", "openid", "email"},
		UserInfoURL:     "https://graph.microsoft.com/v1.0/me",
		UserInfoEmail:   extractMicrosoftEmail,
		ClientIDEnv:     "MICROSOFT_OAUTH_CLIENT_ID",
		ClientSecretEnv: "MICROSOFT_OAUTH_CLIENT_SECRET",
	},
}

func extractGoogleEmail(b []byte) string {
	var v struct {
		Email string `json:"email"`
	}
	_ = json.Unmarshal(b, &v)
	return v.Email
}
func extractMicrosoftEmail(b []byte) string {
	var v struct {
		Mail              string `json:"mail"`
		UserPrincipalName string `json:"userPrincipalName"`
	}
	_ = json.Unmarshal(b, &v)
	if v.Mail != "" {
		return v.Mail
	}
	return v.UserPrincipalName
}

// -----------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------

func (s *Server) oauthMailRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/mail/oauth/status", s.auth("settings.view", s.oauthMailStatus))
	mux.HandleFunc("POST /api/mail/oauth/{provider}/start", s.auth("shop.edit", s.oauthMailStart))
	mux.HandleFunc("DELETE /api/mail/oauth/{provider}", s.auth("shop.edit", s.oauthMailDisconnect))
	// Public callback — authenticated via the signed state (not a Bearer).
	mux.HandleFunc("GET /api/mail/oauth/{provider}/callback", s.oauthMailCallback)
}

func (s *Server) oauthMailStatus(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	out := map[string]any{
		"available": map[string]bool{
			"google":    os.Getenv("GOOGLE_OAUTH_CLIENT_ID") != "",
			"microsoft": os.Getenv("MICROSOFT_OAUTH_CLIENT_ID") != "",
		},
		"connected": map[string]any{},
	}
	rows, err := s.db.Query(r.Context(), `SELECT provider, email, connected_at FROM email_oauth_tokens WHERE company_id::text = $1`, cid)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var p, email string
			var at time.Time
			if err := rows.Scan(&p, &email, &at); err == nil {
				out["connected"].(map[string]any)[p] = map[string]any{"email": email, "connectedAt": at.UnixMilli()}
			}
		}
	}
	writeJSON(w, 200, out)
}

type oauthStartResp struct {
	URL string `json:"url"`
}

func (s *Server) oauthMailStart(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	u := userFrom(r.Context())
	provider := r.PathValue("provider")
	p, ok := oauthProviders[provider]
	if !ok {
		writeErr(w, 400, "Unknown provider.")
		return
	}
	clientID := os.Getenv(p.ClientIDEnv)
	if clientID == "" {
		writeErr(w, 503, "This provider isn't configured on the server. Ask the TorqueDesk administrator to set "+p.ClientIDEnv+" + "+p.ClientSecretEnv+".")
		return
	}
	state := signOAuthState(s.secret, cid, provider, u.Name)
	redirectURI := oauthRedirectURI(r, provider)
	q := url.Values{}
	q.Set("client_id", clientID)
	q.Set("redirect_uri", redirectURI)
	q.Set("response_type", "code")
	q.Set("scope", strings.Join(p.Scopes, " "))
	q.Set("state", state)
	for k, v := range p.ExtraAuth {
		q.Set(k, v)
	}
	writeJSON(w, 200, oauthStartResp{URL: p.AuthURL + "?" + q.Encode()})
}

func (s *Server) oauthMailCallback(w http.ResponseWriter, r *http.Request) {
	provider := r.PathValue("provider")
	p, ok := oauthProviders[provider]
	if !ok {
		writeErr(w, 400, "Unknown provider.")
		return
	}
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	if errMsg := r.URL.Query().Get("error"); errMsg != "" {
		writeCallbackPage(w, false, "The provider returned an error: "+errMsg)
		return
	}
	if code == "" || state == "" {
		writeCallbackPage(w, false, "Missing code or state. Please try connecting again.")
		return
	}
	cid, stProvider, _, ok := verifyOAuthState(s.secret, state)
	if !ok || stProvider != provider {
		writeCallbackPage(w, false, "Session expired. Please try connecting again.")
		return
	}

	// Exchange the code for tokens.
	clientID := os.Getenv(p.ClientIDEnv)
	clientSecret := os.Getenv(p.ClientSecretEnv)
	redirectURI := oauthRedirectURI(r, provider)
	tok, err := exchangeOAuthCode(r.Context(), p.TokenURL, clientID, clientSecret, redirectURI, code)
	if err != nil {
		writeCallbackPage(w, false, "Could not complete sign-in: "+err.Error())
		return
	}
	if tok.RefreshToken == "" {
		writeCallbackPage(w, false, "The provider did not return a refresh token. Try again and make sure you grant permission (not just sign in).")
		return
	}

	// Fetch the authenticated email.
	email, err := fetchUserEmail(r.Context(), p, tok.AccessToken)
	if err != nil || email == "" {
		// Fallback — some providers may hide email behind extra scopes; use a
		// placeholder but still save the token.
		email = "connected@" + provider + ".oauth"
	}

	// Encrypt + persist.
	key, err := LoadDataKey(s.secret)
	if err != nil {
		writeCallbackPage(w, false, "Server misconfigured: "+err.Error())
		return
	}
	refreshEnc, _ := Encrypt(key, []byte(tok.RefreshToken))
	var accessEnc []byte
	if tok.AccessToken != "" {
		accessEnc, _ = Encrypt(key, []byte(tok.AccessToken))
	}
	var expires any
	if tok.ExpiresIn > 0 {
		expires = time.Now().Add(time.Duration(tok.ExpiresIn-30) * time.Second)
	}
	if _, err := s.db.Exec(r.Context(), `INSERT INTO email_oauth_tokens
		(company_id, provider, email, refresh_token_enc, access_token_enc, access_expires_at, scope, connected_by, updated_at)
		VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, now())
		ON CONFLICT (company_id, provider) DO UPDATE SET
		  email = EXCLUDED.email,
		  refresh_token_enc = EXCLUDED.refresh_token_enc,
		  access_token_enc = EXCLUDED.access_token_enc,
		  access_expires_at = EXCLUDED.access_expires_at,
		  scope = EXCLUDED.scope,
		  connected_by = EXCLUDED.connected_by,
		  updated_at = now()`,
		cid, provider, email, refreshEnc, accessEnc, expires, strings.Join(p.Scopes, " "), "oauth"); err != nil {
		writeCallbackPage(w, false, "Could not save the connection: "+err.Error())
		return
	}
	writeCallbackPage(w, true, email)
}

func (s *Server) oauthMailDisconnect(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	provider := r.PathValue("provider")
	if _, err := s.db.Exec(r.Context(), `DELETE FROM email_oauth_tokens WHERE company_id::text = $1 AND provider = $2`, cid, provider); err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// -----------------------------------------------------------------------
// OAuth code exchange + user info
// -----------------------------------------------------------------------

type oauthToken struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	Scope        string `json:"scope"`
	TokenType    string `json:"token_type"`
}

func exchangeOAuthCode(ctx context.Context, tokenURL, clientID, clientSecret, redirectURI, code string) (*oauthToken, error) {
	form := url.Values{}
	form.Set("client_id", clientID)
	form.Set("client_secret", clientSecret)
	form.Set("code", code)
	form.Set("grant_type", "authorization_code")
	form.Set("redirect_uri", redirectURI)
	req, _ := http.NewRequestWithContext(ctx, "POST", tokenURL, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("provider %d: %s", resp.StatusCode, snippet(body))
	}
	var tok oauthToken
	if err := json.Unmarshal(body, &tok); err != nil {
		return nil, err
	}
	return &tok, nil
}

func refreshOAuthAccessToken(ctx context.Context, provider oauthProvider, clientID, clientSecret, refreshToken string) (*oauthToken, error) {
	form := url.Values{}
	form.Set("client_id", clientID)
	form.Set("client_secret", clientSecret)
	form.Set("refresh_token", refreshToken)
	form.Set("grant_type", "refresh_token")
	req, _ := http.NewRequestWithContext(ctx, "POST", provider.TokenURL, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("provider %d: %s", resp.StatusCode, snippet(body))
	}
	var tok oauthToken
	if err := json.Unmarshal(body, &tok); err != nil {
		return nil, err
	}
	return &tok, nil
}

func fetchUserEmail(ctx context.Context, p oauthProvider, accessToken string) (string, error) {
	req, _ := http.NewRequestWithContext(ctx, "GET", p.UserInfoURL, nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("provider %d: %s", resp.StatusCode, snippet(body))
	}
	return p.UserInfoEmail(body), nil
}

// -----------------------------------------------------------------------
// Access-token cache + XOAUTH2 for mailer.send()
// -----------------------------------------------------------------------

// getOAuthAccessToken returns a fresh access token for (companyID, provider),
// refreshing from the stored refresh token if the cached one is expired or
// missing. Returns ("", "", nil) if no OAuth connection is configured for
// that tenant — callers fall back to password-based SMTP.
func (s *Server) getOAuthAccessToken(ctx context.Context, cid, provider string) (string, string, error) {
	p, ok := oauthProviders[provider]
	if !ok {
		return "", "", nil
	}
	clientID := os.Getenv(p.ClientIDEnv)
	clientSecret := os.Getenv(p.ClientSecretEnv)
	if clientID == "" || clientSecret == "" {
		return "", "", nil
	}
	var email string
	var refreshEnc, accessEnc []byte
	var accessExp *time.Time
	err := s.db.QueryRow(ctx, `SELECT email, refresh_token_enc, access_token_enc, access_expires_at
		FROM email_oauth_tokens WHERE company_id::text = $1 AND provider = $2`, cid, provider).
		Scan(&email, &refreshEnc, &accessEnc, &accessExp)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", "", nil
		}
		return "", "", err
	}
	key, err := LoadDataKey(s.secret)
	if err != nil {
		return "", "", err
	}
	// Cached access token still valid?
	if len(accessEnc) > 0 && accessExp != nil && time.Until(*accessExp) > 30*time.Second {
		tok, err := Decrypt(key, accessEnc)
		if err == nil {
			return email, tok, nil
		}
	}
	// Refresh.
	refresh, err := Decrypt(key, refreshEnc)
	if err != nil {
		return "", "", err
	}
	tok, err := refreshOAuthAccessToken(ctx, p, clientID, clientSecret, refresh)
	if err != nil {
		return "", "", err
	}
	// Cache the new access token.
	newEnc, _ := Encrypt(key, []byte(tok.AccessToken))
	var expires any
	if tok.ExpiresIn > 0 {
		expires = time.Now().Add(time.Duration(tok.ExpiresIn-30) * time.Second)
	}
	_, _ = s.db.Exec(ctx, `UPDATE email_oauth_tokens SET access_token_enc = $1, access_expires_at = $2, updated_at = now()
		WHERE company_id::text = $3 AND provider = $4`, newEnc, expires, cid, provider)
	return email, tok.AccessToken, nil
}

// xoauth2SASL builds the SASL XOAUTH2 payload used by Gmail / Outlook SMTP:
//   user=<email>\x01auth=Bearer <token>\x01\x01   (base64)
func xoauth2SASL(email, accessToken string) string {
	raw := "user=" + email + "\x01auth=Bearer " + accessToken + "\x01\x01"
	return base64.StdEncoding.EncodeToString([]byte(raw))
}

// -----------------------------------------------------------------------
// Signed state tokens (so the public callback can trust the caller)
// -----------------------------------------------------------------------

type stateClaims struct {
	CID      string `json:"c"`
	Provider string `json:"p"`
	User     string `json:"u"`
	Exp      int64  `json:"e"`
}

func signOAuthState(secret []byte, cid, provider, user string) string {
	c := stateClaims{CID: cid, Provider: provider, User: user, Exp: time.Now().Add(15 * time.Minute).Unix()}
	body, _ := json.Marshal(c)
	payload := base64.RawURLEncoding.EncodeToString(body)
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(payload))
	return payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func verifyOAuthState(secret []byte, state string) (cid, provider, user string, ok bool) {
	p, sig, found := strings.Cut(state, ".")
	if !found {
		return "", "", "", false
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(p))
	want := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(sig), []byte(want)) {
		return "", "", "", false
	}
	body, err := base64.RawURLEncoding.DecodeString(p)
	if err != nil {
		return "", "", "", false
	}
	var c stateClaims
	if json.Unmarshal(body, &c) != nil || c.Exp < time.Now().Unix() {
		return "", "", "", false
	}
	return c.CID, c.Provider, c.User, true
}

// oauthRedirectURI resolves the callback URL. Prefers OAUTH_REDIRECT_BASE
// (full origin, e.g. https://apps.2set.com) so the deployed URL stays stable
// even if the request's Host header is weird behind a proxy; otherwise falls
// back to publicOrigin(r).
func oauthRedirectURI(r *http.Request, provider string) string {
	if base := strings.TrimRight(os.Getenv("OAUTH_REDIRECT_BASE"), "/"); base != "" {
		return base + "/api/mail/oauth/" + provider + "/callback"
	}
	return publicOrigin(r) + "/api/mail/oauth/" + provider + "/callback"
}

// writeCallbackPage returns a tiny HTML page that notifies the opener (the
// Settings page that opened the popup) with the result, then closes itself.
func writeCallbackPage(w http.ResponseWriter, success bool, msg string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	esc := strings.NewReplacer("<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#39;").Replace(msg)
	fmt.Fprintf(w, `<!doctype html><html><body style="font: 14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif; padding:40px; text-align:center;">
<h2>%s</h2>
<p>%s</p>
<p style="color:#6b7280">You can close this window.</p>
<script>
try {
  if (window.opener) window.opener.postMessage({ type: 'torquedesk:email-oauth', ok: %t, message: %q }, '*');
  setTimeout(function(){ window.close(); }, 400);
} catch (e) {}
</script>
</body></html>`, map[bool]string{true: "Connected", false: "Could not connect"}[success], esc, success, msg)
}
