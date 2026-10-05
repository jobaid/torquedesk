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
	if *seedDemo {
		if err := srv.SeedDemoDocuments(ctx); err != nil {
			log.Printf("seed demo documents: %v", err)
		}
	}
	srv.StartAutoBackup(ctx)

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
