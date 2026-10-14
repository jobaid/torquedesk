package api

// Push-to-Google-Drive hook that fires right after any in-app backup is
// finalized on disk. Enabled when TD_OFFSITE_REMOTE is set (e.g.
// "gdrive:torquedesk-backups"); otherwise it's a no-op.
//
// The server container ships with rclone preinstalled; the host mounts the
// rclone config (RCLONE_CONFIG=/app/rclone.conf by convention).

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// pushOffsite copies localPath to the configured rclone remote under a
// timestamped folder. Returns nil when disabled or on best-effort upload
// failure (the local backup already committed; we don't want a Drive outage
// to fail the user's click). Writes a status breadcrumb next to the uploads
// so the admin UI can display "last offsite push: 2m ago".
func (s *Server) pushOffsite(kind, localPath string) {
	remote := strings.TrimSpace(os.Getenv("TD_OFFSITE_REMOTE"))
	if remote == "" {
		return
	}
	if _, err := exec.LookPath("rclone"); err != nil {
		writeOffsiteStatus("fail", "rclone binary not available in server image", 0, 0, remote)
		return
	}
	if _, err := os.Stat(localPath); err != nil {
		writeOffsiteStatus("fail", "local file missing: "+err.Error(), 0, 0, remote)
		return
	}
	start := time.Now()
	remotePath := fmt.Sprintf("%s/%s/%s/", strings.TrimRight(remote, "/"), kind, time.Now().UTC().Format("20060102-150405"))
	cmd := exec.Command("rclone", "copy", localPath, remotePath,
		"--transfers=4", "--checkers=4", "--stats=0")
	// Only override config path if the host mounted one in.
	if cfg := os.Getenv("RCLONE_CONFIG"); cfg != "" {
		cmd.Env = append(os.Environ(), "RCLONE_CONFIG="+cfg)
	}
	out, err := cmd.CombinedOutput()
	dur := int(time.Since(start).Seconds())
	info, _ := os.Stat(localPath)
	size := int64(0)
	if info != nil {
		size = info.Size()
	}
	if err != nil {
		writeOffsiteStatus("fail", "rclone failed: "+strings.TrimSpace(string(out)), size, dur, remotePath)
		return
	}
	writeOffsiteStatus("ok", "offsite push complete", size, dur, remotePath)
}

func writeOffsiteStatus(status, message string, sizeBytes int64, duration int, remote string) {
	path := filepath.Join(backupDir(), "offsite-status.json")
	_ = os.MkdirAll(filepath.Dir(path), 0o755)
	body := fmt.Sprintf(`{
  "status": %q,
  "message": %q,
  "timestamp": %q,
  "remote": %q,
  "sizeBytes": %d,
  "durationSeconds": %d
}`, status, message, time.Now().UTC().Format(time.RFC3339), remote, sizeBytes, duration)
	_ = os.WriteFile(path, []byte(body), 0o644)
}
