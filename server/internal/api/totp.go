package api

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// RFC 6238 TOTP (HMAC-SHA1, 30s step, 6 digits) — compatible with Google
// Authenticator, 1Password, Authy, Microsoft Authenticator.

const totpStep = 30
const totpDigits = 6

// GenerateTOTPSecret returns a 20-byte base32 secret (no padding).
func GenerateTOTPSecret() string {
	b := make([]byte, 20)
	_, _ = rand.Read(b)
	return strings.TrimRight(base32.StdEncoding.EncodeToString(b), "=")
}

// TOTPURL builds the otpauth://totp/... URL for QR codes.
func TOTPURL(issuer, account, secret string) string {
	q := url.Values{}
	q.Set("secret", secret)
	q.Set("issuer", issuer)
	q.Set("algorithm", "SHA1")
	q.Set("digits", "6")
	q.Set("period", "30")
	return fmt.Sprintf("otpauth://totp/%s:%s?%s",
		url.PathEscape(issuer), url.PathEscape(account), q.Encode())
}

// VerifyTOTP accepts the code if it matches the current 30-second window or
// either neighbor (handles small clock drift). Returns false for malformed
// codes or missing secret.
func VerifyTOTP(secret, code string) bool {
	code = strings.TrimSpace(code)
	if len(code) != totpDigits || secret == "" {
		return false
	}
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(strings.ToUpper(secret))
	if err != nil {
		return false
	}
	now := time.Now().Unix() / totpStep
	for _, offset := range []int64{-1, 0, 1} {
		if hotp(key, uint64(now+offset)) == code {
			return true
		}
	}
	return false
}

func hotp(key []byte, counter uint64) string {
	var buf [8]byte
	binary.BigEndian.PutUint64(buf[:], counter)
	mac := hmac.New(sha1.New, key)
	mac.Write(buf[:])
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	bin := binary.BigEndian.Uint32(sum[offset:offset+4]) & 0x7fffffff
	return fmt.Sprintf("%06d", bin%1_000_000)
}
