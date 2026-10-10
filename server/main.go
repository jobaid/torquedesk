// TorqueDesk API server.
//
// Uses DATABASE_URL when set. Otherwise starts an embedded PostgreSQL instance
// under ./.data so the app runs locally without installing PostgreSQL.
package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"

	"torquedesk/server/internal/api"
	"torquedesk/server/internal/db"
)

func main() {
	addr := flag.String("addr", envOr("ADDR", ":8080"), "HTTP listen address")
	static := flag.String("static", envOr("STATIC_DIR", "../dist"), "built frontend to serve (optional)")
	dataDir := flag.String("data", envOr("DATA_DIR", ".data"), "directory for embedded PostgreSQL")
	pgPort := flag.Uint("pg-port", 54329, "embedded PostgreSQL port")
	seedDemo := flag.Bool("seed-demo", true, "insert demo documents on first run")
	// Operational one-shots. When any of these are set the server runs the
	// action and exits — it does NOT start listening. Useful for recovering a
	// locked-out account without rebuilding or shelling into a distroless
	// container.
	//
	//   --reset-saas-admin='email:newpassword'    reset a SaaS owner password
	//   --reset-shop-owner='email:newpassword'    reset a shop owner password
	resetSaasAdmin := flag.String("reset-saas-admin", envOr("RESET_SAAS_ADMIN", ""), "email:password — reset a saas_admin_users row then exit")
	resetShopOwner := flag.String("reset-shop-owner", envOr("RESET_SHOP_OWNER", ""), "email:password — reset a company_owners row then exit")
	flag.Parse()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	url := os.Getenv("DATABASE_URL")
	if url == "" {
		abs, _ := filepath.Abs(*dataDir)
		pg := embeddedpostgres.NewDatabase(embeddedpostgres.DefaultConfig().
			Version(embeddedpostgres.V16).
			Port(uint32(*pgPort)).
			Database("torquedesk").
			Username("torquedesk").
			Password("torquedesk").
			DataPath(filepath.Join(abs, "pg")).
			RuntimePath(filepath.Join(abs, "runtime")).
			BinariesPath(filepath.Join(abs, "bin")).
			StartTimeout(60 * time.Second))
		log.Printf("starting embedded PostgreSQL on port %d (data in %s)", *pgPort, abs)
		if err := pg.Start(); err != nil {
			log.Fatalf("embedded postgres: %v", err)
		}
		defer func() {
			if err := pg.Stop(); err != nil {
				log.Printf("stop embedded postgres: %v", err)
			}
		}()
		url = "postgres://torquedesk:torquedesk@localhost:" + itoa(*pgPort) + "/torquedesk?sslmode=disable"
	}

	// Payment-gateway secrets are AES-GCM encrypted at rest; in production the
	// server will refuse to boot without a stable key so a prod rotation never
	// silently drops ciphertext we can no longer open.
	if err := api.RequireProductionSecret(); err != nil {
		log.Fatal(err)
	}

	pool, err := db.Open(ctx, url)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool); err != nil {
		log.Fatal(err)
	}

	srv, err := api.New(ctx, pool)
	if err != nil {
		log.Fatal(err)
	}
	if err := srv.SeedDefaultSaasAdmin(ctx); err != nil {
		log.Printf("seed saas admin: %v", err)
	}
	if pw := os.Getenv("RESET_SAAS_ADMIN_PASSWORD"); pw != "" {
		email := envOr("SAAS_ADMIN_EMAIL", "owner@curanex.local")
		if err := srv.ResetSaasAdminPassword(ctx, email, pw); err != nil {
			log.Printf("reset saas admin password: %v", err)
		}
	}
	// --reset-saas-admin / --reset-shop-owner are one-shot ops: run and exit.
	// Format: "email:password". Password may contain any character except the
	// first colon (which separates). Convenient for Docker:
	//   docker compose run --rm --entrypoint=/app/torquedesk-server \
	//     server --reset-saas-admin='you@example.com:TorqueDesk2026'
	if *resetSaasAdmin != "" {
		email, pw, ok := splitEmailPassword(*resetSaasAdmin)
		if !ok {
			log.Fatal("--reset-saas-admin expects 'email:password'")
		}
		if err := srv.ResetSaasAdminPassword(ctx, email, pw); err != nil {
			log.Fatalf("reset saas admin: %v", err)
		}
		log.Printf("saas admin %q password reset — you can log in now", email)
		return
	}
	_ = resetShopOwner // reserved for a later admin-tool flag; same approach as SaaS reset.
	if *seedDemo {
		if err := srv.SeedDemoDocuments(ctx); err != nil {
			log.Printf("seed demo documents: %v", err)
		}
	}
	srv.StartAutoBackup(ctx)
	srv.StartOwnerBackupTicker(ctx)
	srv.StartNotificationTicker(ctx)
	srv.StartEmailJobWorker(ctx)
	srv.StartReportsRepairAtBoot(ctx)

	httpSrv := &http.Server{Addr: *addr, Handler: srv.Handler(*static), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		log.Printf("TorqueDesk API listening on %s", *addr)
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("http: %v", err)
			stop()
		}
	}()
	<-ctx.Done()
	shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	httpSrv.Shutdown(shutdown)
}

// splitEmailPassword parses "email:password" exactly on the FIRST colon,
// so passwords can contain any character including ':'. Returns ok=false
// when there is no colon or either side is empty.
func splitEmailPassword(s string) (email, pw string, ok bool) {
	for i := 0; i < len(s); i++ {
		if s[i] == ':' {
			return s[:i], s[i+1:], s[:i] != "" && s[i+1:] != ""
		}
	}
	return "", "", false
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func itoa(n uint) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}
