package api

// Real-time message delivery via Server-Sent Events.
//
// Design: a single process-wide hub keyed by document_id. When a message is
// POSTed (shop or public endpoint) we persist it to Postgres AND publish to
// the hub. Every SSE connection subscribed to that document receives the
// serialized message immediately through its own buffered channel. Buffer
// size is small (16); slow consumers that fill up are dropped — the next
// GET /messages still has the full history, so one dropped delivery is a UI
// annoyance, not data loss. The DB remains the source of truth.
//
// Scaling note: this hub is in-process. Fine for single-instance deployments
// (your systemd setup). For horizontal scaling, swap this for a Postgres
// LISTEN/NOTIFY fanout — the hub's three-method interface makes that a
// one-file change.

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"
)

type msgHub struct {
	mu   sync.RWMutex
	subs map[string]map[chan []byte]struct{}
}

var hub = &msgHub{subs: map[string]map[chan []byte]struct{}{}}

func (h *msgHub) subscribe(docID string) chan []byte {
	ch := make(chan []byte, 16)
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.subs[docID]; !ok {
		h.subs[docID] = map[chan []byte]struct{}{}
	}
	h.subs[docID][ch] = struct{}{}
	return ch
}

func (h *msgHub) unsubscribe(docID string, ch chan []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if m, ok := h.subs[docID]; ok {
		delete(m, ch)
		if len(m) == 0 {
			delete(h.subs, docID)
		}
	}
	close(ch)
}

// publish never blocks. A full channel means that consumer is slow; drop the
// event for them. They can catch up via GET /messages on reconnect.
func (h *msgHub) publish(docID string, payload []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.subs[docID] {
		select {
		case ch <- payload:
		default:
		}
	}
}

// publishMessageEvent marshals a messageDTO as a JSON SSE 'data:' line and
// fans it out to every subscriber of its document.
func publishMessageEvent(docID string, m messageDTO) {
	b, err := json.Marshal(map[string]any{"type": "message", "message": m})
	if err != nil {
		return
	}
	hub.publish(docID, b)
}

// -------------------------- SSE route handlers ------------------------------
//
// Both the shop and public endpoints share this skeleton:
//   1. Resolve the document (either by auth or by share token).
//   2. Register with the hub.
//   3. Send initial 'ready' event + a ping every 25s to keep proxies alive.
//   4. Forward every published event until the client disconnects.

func (s *Server) sseShopMessages(w http.ResponseWriter, r *http.Request) {
	cid := companyFrom(r.Context())
	docID := r.PathValue("id")
	var exists bool
	if err := s.db.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM documents WHERE id::text = $1 AND company_id::text = $2)`, docID, cid).Scan(&exists); err != nil || !exists {
		writeErr(w, 404, "Document not found.")
		return
	}
	s.streamMessages(w, r, docID)
}

func (s *Server) ssePublicMessages(w http.ResponseWriter, r *http.Request) {
	tok := r.PathValue("token")
	docID, _, ok := s.resolveShareToken(r, tok)
	if !ok {
		writeErr(w, 404, "This link is no longer available.")
		return
	}
	s.streamMessages(w, r, docID)
}

func (s *Server) streamMessages(w http.ResponseWriter, r *http.Request, docID string) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, 500, "Streaming not supported.")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // nginx: do not buffer SSE
	w.WriteHeader(http.StatusOK)

	ch := hub.subscribe(docID)
	defer hub.unsubscribe(docID, ch)

	// Opening comment + ready event so the client can flip to Connected.
	_, _ = w.Write([]byte(": connected\n\n"))
	_, _ = w.Write([]byte("event: ready\ndata: {}\n\n"))
	flusher.Flush()

	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()

	done := r.Context().Done()
	for {
		select {
		case <-done:
			return
		case <-ping.C:
			if _, err := w.Write([]byte(": ping\n\n")); err != nil {
				return
			}
			flusher.Flush()
		case payload, ok := <-ch:
			if !ok {
				return
			}
			var b strings.Builder
			b.WriteString("event: message\ndata: ")
			b.Write(payload)
			b.WriteString("\n\n")
			if _, err := w.Write([]byte(b.String())); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
