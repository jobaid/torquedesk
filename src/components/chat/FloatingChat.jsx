import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, X, Minus, ArrowLeft, Send, Loader2, Wifi, WifiOff, Car, FileText } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../store/useApp'
import { useShop } from '../../store/useShop'

// Shop-wide floating Messenger-style chat. Mounted once at AppShell level.
// Renders a floating button bottom-right of the viewport with an unread
// badge; clicking opens a drawer that shows either a conversations list or
// the active thread. Real-time via SSE; falls back to its initial GET load
// on reconnect so no messages are lost.

export default function FloatingChat() {
  const token = useApp((s) => s.user?.token)
  const [open, setOpen] = useState(false)
  const [activeDocId, setActiveDocId] = useState(null)
  const [unread, setUnread] = useState({ total: 0, docs: [] })
  const [bump, setBump] = useState(0)
  const documents = useShop((s) => s.documents)

  // Poll unread rollup every 15 s. SSE pushes the badge immediately when a
  // message lands in a thread the user has open; this covers everything else.
  useEffect(() => {
    if (!token) return
    let alive = true
    const load = async () => {
      try { const d = await api('/messages/unread'); if (alive) setUnread(d) }
      catch { /* ignore */ }
    }
    load()
    const t = setInterval(load, 15000)
    return () => { alive = false; clearInterval(t) }
  }, [token, bump])

  if (!token) return null // not signed in → no chat

  const bumpUnread = () => setBump((n) => n + 1)
  const docInfo = (id) => documents.find((d) => d.id === id)

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open chat"
        style={{
          position: 'fixed', right: 20, bottom: 20, zIndex: 2000,
          width: 60, height: 60, borderRadius: '50%',
          background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
          color: '#fff', border: 'none', cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(37,99,235,0.4)',
          display: open ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        <MessageCircle size={26} />
        {unread.total > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: '#dc2626', color: '#fff',
            minWidth: 22, height: 22, padding: '0 6px',
            borderRadius: 11, fontSize: 11, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #fff', animation: 'tdPulse 1.6s ease-in-out infinite',
          }}>{unread.total}</span>
        )}
      </button>

      <style>{`@keyframes tdPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); } }`}</style>

      {open && (
        <div
          role="dialog"
          aria-label="Customer chat"
          style={{
            position: 'fixed', right: 20, bottom: 20, zIndex: 2001,
            width: 400, maxWidth: 'calc(100vw - 24px)',
            height: 620, maxHeight: 'calc(100vh - 24px)',
            background: '#fff', borderRadius: 14,
            boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            border: '1px solid #e5e7eb',
          }}
        >
          <ChatDrawerHeader
            activeDocId={activeDocId}
            docInfo={docInfo(activeDocId)}
            onBack={() => setActiveDocId(null)}
            onMinimize={() => setOpen(false)}
            onClose={() => { setOpen(false); setActiveDocId(null) }}
          />
          {activeDocId ? (
            <ChatThread docId={activeDocId} onThreadRead={bumpUnread} />
          ) : (
            <ConversationList unread={unread.docs} documents={documents} onPick={setActiveDocId} />
          )}
        </div>
      )}
    </>
  )
}

function ChatDrawerHeader({ activeDocId, docInfo, onBack, onMinimize, onClose }) {
  const custName = (docInfo?.customerSnapshot && docInfo.customerSnapshot.name) || 'Customer'
  const vehSnap = docInfo?.vehicleSnapshot
  const vehLabel = vehSnap ? [vehSnap.year, vehSnap.make, vehSnap.model].filter(Boolean).join(' ') : ''
  const typeLabel = { invoice: 'Invoice', repair_order: 'RO', estimate: 'Estimate' }[docInfo?.type] || 'Document'
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'linear-gradient(90deg,#1e40af,#2563eb)', color: '#fff' }}>
      {activeDocId ? (
        <>
          <button onClick={onBack} aria-label="Back to conversations" style={iconBtnStyle}><ArrowLeft size={18} /></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{custName}</div>
            <div style={{ fontSize: 11, opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {vehLabel && <>{vehLabel} · </>}{typeLabel}{docInfo ? ` #${docInfo.number || docInfo.displayNumber}` : ''}
            </div>
          </div>
        </>
      ) : (
        <>
          <MessageCircle size={20} />
          <div style={{ flex: 1, fontWeight: 600 }}>Customer chat</div>
        </>
      )}
      <button onClick={onMinimize} aria-label="Minimize" style={iconBtnStyle}><Minus size={18} /></button>
      <button onClick={onClose} aria-label="Close" style={iconBtnStyle}><X size={18} /></button>
    </header>
  )
}

const iconBtnStyle = {
  width: 30, height: 30, borderRadius: 6, border: 'none',
  background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}

function ConversationList({ unread, documents, onPick }) {
  // Show unread docs first, then recently-updated docs with any messages.
  const unreadIds = new Set(unread.map((u) => u.documentId))
  const sorted = useMemo(() => {
    const rest = documents.filter((d) => !unreadIds.has(d.id)).slice(0, 50)
    return [...unread.map((u) => ({ id: u.documentId, number: u.number, type: u.type, unread: u.unread })), ...rest]
  }, [documents, unread])

  if (sorted.length === 0) return <div style={{ padding: 24, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>No documents yet.</div>

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {sorted.map((d) => {
        const doc = documents.find((x) => x.id === d.id) || d
        const custName = (doc.customerSnapshot && doc.customerSnapshot.name) || '—'
        const typeLabel = { invoice: 'Invoice', repair_order: 'RO', estimate: 'Estimate' }[doc.type] || 'Document'
        return (
          <button key={d.id} onClick={() => onPick(d.id)}
            style={{
              display: 'flex', width: '100%', textAlign: 'left', gap: 10,
              padding: '12px 14px', border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: '1px solid #f3f4f6', alignItems: 'center',
            }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#dbeafe', color: '#1e40af', display: 'grid', placeItems: 'center', fontWeight: 700 }}>
              {(custName[0] || 'C').toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{custName}</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>{typeLabel} #{doc.number || doc.displayNumber}</div>
            </div>
            {d.unread > 0 && <span style={{ background: '#dc2626', color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{d.unread}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function ChatThread({ docId, isPublic, publicToken, onThreadRead }) {
  // Shared bubble UI. For the shop app `isPublic` is false and we hit the
  // authed endpoints; for the customer public view we skip the authed GET
  // and talk to the token-scoped endpoints instead.
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [connState, setConnState] = useState('connecting') // connecting | open | reconnecting
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [pending, setPending] = useState([]) // optimistic + failed messages
  const scrollRef = useRef(null)
  const token = useApp((s) => s.user?.token)
  const user = useApp((s) => s.user)
  const [custName, setCustName] = useState('Customer')

  const base = isPublic
    ? `/api/public/share/${encodeURIComponent(publicToken)}/messages`
    : `/api/documents/${docId}/messages`

  // Initial + reconnect loader.
  const reloadAll = async () => {
    try {
      let data
      if (isPublic) {
        const r = await fetch(base); if (!r.ok) throw new Error(''); data = await r.json()
      } else { data = await api(`/documents/${docId}/messages`) }
      setMessages(data.messages || [])
      onThreadRead?.()
    } catch { /* ignore; SSE will deliver later */ }
    finally { setLoading(false) }
  }

  useEffect(() => { reloadAll() /* eslint-disable-next-line */ }, [docId, publicToken])

  // SSE subscription with auto-reconnect.
  useEffect(() => {
    let es
    let cancelled = false
    let retry = 1000
    const connect = () => {
      const url = isPublic
        ? `/api/public/share/${encodeURIComponent(publicToken)}/messages/stream`
        : `/api/documents/${docId}/messages/stream`
      // EventSource doesn't let you set headers, so for the shop side we pass
      // the token as a query param (handled by the auth middleware fallback
      // or by SSE-aware routing). But our auth middleware reads only the
      // Authorization header. Trade-off: shop app runs same-origin so cookies
      // would work; token-in-query is cheaper. We'll use fetch-based stream
      // instead to attach the Authorization header.
      const headers = {}
      if (!isPublic && token) headers.Authorization = `Bearer ${token}`
      const ac = new AbortController()
      es = { close: () => ac.abort() }
      setConnState('connecting')
      fetch(url, { headers, signal: ac.signal }).then(async (r) => {
        if (!r.ok || !r.body) throw new Error('stream unavailable')
        setConnState('open'); retry = 1000
        const reader = r.body.getReader()
        const dec = new TextDecoder()
        let buf = ''
        while (!cancelled) {
          const { value, done } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          // Parse SSE: lines are 'event: X' and 'data: Y', separated by blank line.
          let idx
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2)
            let event = 'message'; let data = ''
            for (const line of chunk.split('\n')) {
              if (line.startsWith('event:')) event = line.slice(6).trim()
              else if (line.startsWith('data:')) data += line.slice(5).trim()
            }
            if (event === 'message' && data) {
              try {
                const parsed = JSON.parse(data)
                if (parsed.type === 'message' && parsed.message) {
                  setMessages((prev) => prev.some((m) => m.id === parsed.message.id) ? prev : [...prev, parsed.message])
                  onThreadRead?.()
                }
              } catch {/* ignore malformed */}
            }
          }
        }
      }).catch(() => {
        if (cancelled) return
        setConnState('reconnecting')
        setTimeout(() => { if (!cancelled) connect() }, Math.min(retry *= 1.5, 15000))
      })
    }
    connect()
    return () => { cancelled = true; es && es.close() }
  }, [docId, publicToken, isPublic, token]) // eslint-disable-line

  // Scroll on new messages.
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }) }, [messages.length, pending.length])

  // Pull customer name from local store for the public view (defaults).
  useEffect(() => {
    if (isPublic) {
      try { setCustName(localStorage.getItem('td-chat-name') || 'Customer') } catch { /* ignore */ }
    }
  }, [isPublic])

  const send = async (e) => {
    e?.preventDefault()
    const text = body.trim()
    if (!text) return
    const tempId = 'tmp-' + Date.now()
    setPending((p) => [...p, { id: tempId, body: text, state: 'sending' }])
    setBody(''); setSending(true)
    try {
      let data
      if (isPublic) {
        if (custName) try { localStorage.setItem('td-chat-name', custName) } catch { /* ignore */ }
        const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: custName, body: text }) })
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Failed to send')
        data = await r.json()
      } else {
        data = await api(`/documents/${docId}/messages`, { method: 'POST', body: { body: text } })
      }
      setMessages(data.messages || [])
      setPending((p) => p.filter((m) => m.id !== tempId))
    } catch (err) {
      setPending((p) => p.map((m) => m.id === tempId ? { ...m, state: 'failed', error: err.message } : m))
    } finally { setSending(false) }
  }

  const retry = async (tmp) => {
    setPending((p) => p.map((m) => m.id === tmp.id ? { ...m, state: 'sending', error: '' } : m))
    try {
      if (isPublic) {
        const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: custName, body: tmp.body }) })
        if (!r.ok) throw new Error()
        setMessages((await r.json()).messages || [])
      } else {
        const data = await api(`/documents/${docId}/messages`, { method: 'POST', body: { body: tmp.body } })
        setMessages(data.messages || [])
      }
      setPending((p) => p.filter((m) => m.id !== tmp.id))
    } catch {
      setPending((p) => p.map((m) => m.id === tmp.id ? { ...m, state: 'failed' } : m))
    }
  }
  const dropFailed = (id) => setPending((p) => p.filter((m) => m.id !== id))

  const myRole = isPublic ? 'customer' : 'shop'
  const myName = isPublic ? custName : (user?.name || 'Shop')

  const grouped = useMemo(() => groupByDay(messages), [messages])

  return (
    <>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', background: '#f9fafb', padding: '12px 10px' }}>
        {loading ? <div style={centerStyle}><Loader2 className="spin" size={18} /></div>
          : messages.length === 0 && pending.length === 0 ? (
            <div style={centerStyle}>
              <MessageCircle size={28} color="#9ca3af" />
              <div style={{ marginTop: 8, color: '#6b7280', fontSize: 13 }}>No messages yet. Say hi!</div>
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.key}>
                <div style={{ textAlign: 'center', margin: '12px 0 6px', fontSize: 11, color: '#9ca3af' }}>{group.label}</div>
                {group.messages.map((m, i, arr) => (
                  <Bubble key={m.id} m={m} mine={m.senderRole === myRole}
                          groupStart={i === 0 || arr[i - 1].senderRole !== m.senderRole}
                          groupEnd={i === arr.length - 1 || arr[i + 1].senderRole !== m.senderRole} />
                ))}
              </div>
            ))
          )}
        {pending.map((m) => (
          <PendingBubble key={m.id} m={m} onRetry={() => retry(m)} onDrop={() => dropFailed(m.id)} />
        ))}
      </div>

      {connState === 'reconnecting' && (
        <div style={{ background: '#fef3c7', color: '#92400e', padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <WifiOff size={12} /> Reconnecting…
        </div>
      )}

      <form onSubmit={send} style={{ padding: 10, borderTop: '1px solid #e5e7eb', background: '#fff' }}>
        {isPublic && (
          <input className="input" value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Your name" style={{ marginBottom: 6, fontSize: 12, padding: '6px 10px' }} />
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="Type a message…"
            rows={1}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            style={{
              flex: 1, resize: 'none', border: '1px solid #e5e7eb', borderRadius: 20,
              padding: '10px 14px', fontSize: 14, outline: 'none',
              maxHeight: 120, lineHeight: '1.4',
            }}
          />
          <button type="submit" disabled={sending || !body.trim()} aria-label="Send"
            style={{
              width: 42, height: 42, borderRadius: '50%', border: 'none',
              background: body.trim() ? 'linear-gradient(135deg,#2563eb,#1d4ed8)' : '#e5e7eb',
              color: '#fff', cursor: body.trim() ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.2s',
            }}>
            {sending ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
          </button>
        </div>
      </form>
    </>
  )
}

function Bubble({ m, mine, groupStart, groupEnd }) {
  const bg = mine ? 'linear-gradient(135deg,#2563eb,#1d4ed8)' : '#fff'
  const fg = mine ? '#fff' : '#111'
  const radius = {
    borderTopLeftRadius: mine ? 16 : (groupStart ? 16 : 4),
    borderTopRightRadius: mine ? (groupStart ? 16 : 4) : 16,
    borderBottomLeftRadius: mine ? 16 : (groupEnd ? 16 : 4),
    borderBottomRightRadius: mine ? (groupEnd ? 16 : 4) : 16,
  }
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', margin: '2px 0' }}>
      <div style={{
        maxWidth: '75%', padding: '8px 12px',
        background: bg, color: fg,
        boxShadow: mine ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
        border: mine ? 'none' : '1px solid #e5e7eb',
        fontSize: 14, lineHeight: 1.4,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        ...radius,
      }}>
        {!mine && groupStart && m.senderName && (
          <div style={{ fontSize: 10, fontWeight: 600, color: '#2563eb', marginBottom: 2 }}>{m.senderName}</div>
        )}
        {m.body}
        {groupEnd && (
          <div style={{ fontSize: 10, color: mine ? 'rgba(255,255,255,0.75)' : '#9ca3af', marginTop: 4, textAlign: mine ? 'right' : 'left' }}>
            {new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  )
}

function PendingBubble({ m, onRetry, onDrop }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '2px 0' }}>
      <div style={{
        maxWidth: '75%', padding: '8px 12px',
        background: m.state === 'failed' ? '#fee2e2' : '#dbeafe',
        color: m.state === 'failed' ? '#991b1b' : '#1e40af',
        borderRadius: 16, fontSize: 14, opacity: 0.9,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {m.body}
        <div style={{ fontSize: 11, marginTop: 4, textAlign: 'right' }}>
          {m.state === 'sending' ? 'Sending…' : (
            <>
              Message failed to send ·{' '}
              <button type="button" onClick={onRetry} style={{ background: 'none', border: 'none', color: '#991b1b', textDecoration: 'underline', cursor: 'pointer', fontSize: 11 }}>Retry</button>
              {' '}·{' '}
              <button type="button" onClick={onDrop} style={{ background: 'none', border: 'none', color: '#991b1b', textDecoration: 'underline', cursor: 'pointer', fontSize: 11 }}>Discard</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const centerStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 20 }

function groupByDay(messages) {
  const out = []
  const dayLabel = (ms) => {
    const d = new Date(ms); const today = new Date()
    const yd = new Date(today); yd.setDate(today.getDate() - 1)
    if (d.toDateString() === today.toDateString()) return 'Today'
    if (d.toDateString() === yd.toDateString()) return 'Yesterday'
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
  }
  for (const m of messages) {
    const key = new Date(m.at).toDateString()
    const last = out[out.length - 1]
    if (last && last.key === key) last.messages.push(m)
    else out.push({ key, label: dayLabel(m.at), messages: [m] })
  }
  return out
}
