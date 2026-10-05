package api

// AES-GCM wrapper used to encrypt tenant-scoped third-party secrets at rest
// (Stripe secret keys, Authorize.Net transaction keys, webhook signing secrets).
//
// The key comes from TORQUEDESK_SECRET_KEY, a 32-byte value encoded as base64
// (standard or url-safe, with or without padding). In production the server
// refuses to start without one — see RequireProductionSecret below. In dev,
// a key is derived from the DB-stored token secret so single-dev workflows
// don't need extra setup; this fallback is logged so it's obvious.
//
// Format of a stored ciphertext blob (what lands in a `bytea` column):
//   [12-byte nonce][AES-GCM ciphertext with 16-byte tag]
// There is no versioning header yet — if the KEK ever has to rotate, a prefix
// byte is the migration path.

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
)

const secretKeyEnv = "TORQUEDESK_SECRET_KEY"

// LoadDataKey resolves the AES-256 KEK used to encrypt third-party secrets.
// Prefers TORQUEDESK_SECRET_KEY (base64 of 32 bytes). Falls back in dev to a
// SHA-256 of the DB-stored token secret so local workflows just work; prod
// callers should use RequireProductionSecret to turn that fallback into a hard
// failure.
func LoadDataKey(fallback []byte) ([]byte, error) {
	raw := strings.TrimSpace(os.Getenv(secretKeyEnv))
	if raw == "" {
		if len(fallback) == 0 {
			return nil, errors.New(secretKeyEnv + " is required (base64 of 32 random bytes). Generate one with: openssl rand -base64 32")
		}
		sum := sha256.Sum256(append([]byte("torquedesk-dev-kek:"), fallback...))
		log.Printf("[crypto] %s not set — deriving dev KEK from token secret. DO NOT USE IN PRODUCTION.", secretKeyEnv)
		return sum[:], nil
	}
	// Accept both padded and unpadded, standard and URL-safe base64.
	for _, enc := range []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding, base64.URLEncoding, base64.RawURLEncoding} {
		key, err := enc.DecodeString(raw)
		if err == nil && len(key) == 32 {
			return key, nil
		}
	}
	return nil, fmt.Errorf("%s must be base64 of exactly 32 bytes (got decode failure or wrong length)", secretKeyEnv)
}

// RequireProductionSecret aborts if we're in a production-shaped environment
// (ENV=prod / APP_ENV=production) and TORQUEDESK_SECRET_KEY is missing.
func RequireProductionSecret() error {
	if os.Getenv(secretKeyEnv) != "" {
		return nil
	}
	env := strings.ToLower(os.Getenv("APP_ENV") + os.Getenv("ENV") + os.Getenv("GO_ENV"))
	if strings.Contains(env, "prod") {
		return errors.New(secretKeyEnv + " must be set in production. Refusing to start without a stable encryption key.")
	}
	return nil
}

// Encrypt returns nonce||ciphertext||tag; nil plaintext → nil output.
func Encrypt(key, plaintext []byte) ([]byte, error) {
	if plaintext == nil {
		return nil, nil
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	ct := gcm.Seal(nil, nonce, plaintext, nil)
	out := make([]byte, 0, len(nonce)+len(ct))
	out = append(out, nonce...)
	out = append(out, ct...)
	return out, nil
}

// Decrypt reverses Encrypt. Returns ("", nil) if blob is empty/nil.
func Decrypt(key, blob []byte) (string, error) {
	if len(blob) == 0 {
		return "", nil
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(blob) < gcm.NonceSize()+gcm.Overhead() {
		return "", errors.New("ciphertext too short")
	}
	nonce := blob[:gcm.NonceSize()]
	ct := blob[gcm.NonceSize():]
	pt, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", err
	}
	return string(pt), nil
}

// Last4 returns the last four characters of a secret, safe for display in a UI
// so an operator can tell which key is loaded without us ever shipping the
// plaintext back to the browser.
func Last4(s string) string {
	if len(s) <= 4 {
		return s
	}
	return s[len(s)-4:]
}
