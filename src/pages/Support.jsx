import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import {
  LifeBuoy, Plus, Clock, CheckCircle2, AlertTriangle, Hourglass, MessageSquare,
  ArrowLeft, Send, RotateCw, X, Loader2,
} from 'lucide-react'
import { api } from '../lib/api'

const CATEGORIES = [
  ['login_auth', 'Login and Authentication'],
  ['subscription_billing', 'Subscription and Billing'],
  ['payments_stripe', 'Payment and Stripe Integration'],
  ['permissions', 'User Permissions'],
  ['customers', 'Customer Management'],
  ['vehicles', 'Vehicle Management'],
  ['inspections', 'Inspections'],
  ['estimates_orders', 'Estimates and Repair Orders'],
  ['invoices_payments', 'Invoices and Payments'],
  ['reports', 'Reports'],
  ['email_notifications', 'Email and Notifications'],
  ['application_errors', 'Application Errors'],
  ['performance', 'Performance'],
  ['backup_restore', 'Backup and Restore'],
  ['data_import_export', 'Data Import and Export'],
  ['feature_request', 'Feature Request'],
  ['other', 'Other Technical Issue'],
]
const PRIORITIES = ['low', 'normal', 'high', 'urgent']

const STATUS_META = {
  open:              { label: 'Open',               color: '#2563eb', bg: '#dbeafe' },
  assigned:          { label: 'Assigned',           color: '#7c3aed', bg: '#ede9fe' },
  in_progress:       { label: 'In Progress',        color: '#d97706', bg: '#fef3c7' },
  awaiting_customer: { label: 'Awaiting You',       color: '#c2410c', bg: '#ffedd5' },
  awaiting_internal: { label: 'Awaiting Support',   color: '#0891b2', bg: '#cffafe' },
  resolved:          { label: 'Resolved',           color: '#059669', bg: '#d1fae5' },
  closed:            { label: 'Closed',             color: '#475569', bg: '#e2e8f0' },
}

const PRIORITY_META = {
  low:    { label: 'Low',    color: '#64748b' },
  normal: { label: 'Normal', color: '#2563eb' },
  high:   { label: 'High',   color: '#d97706' },
  urgent: { label: 'Urgent', color: '#dc2626' },
}

export default function Support() {
  const { id } = useParams()
  if (id) return <TicketDetail id={id} />
  return <TicketsList />
}

function TicketsList() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [err, setErr] = useState('')
  const navigate = useNavigate()

  const load = () => {
    setLoading(true)
    api('/support/tickets').then(setTickets).catch((e) => setErr(e.message)).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const counts = useMemo(() => {
    const c = { total: tickets.length, open: 0, awaiting_customer: 0, awaiting_internal: 0, resolved: 0 }
    for (const t of tickets) {
      if (t.status in c) c[t.status]++
      else if (['open', 'assigned', 'in_progress'].includes(t.status)) c.open++
    }
    return c
  }, [tickets])

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg,#3c6dff,#2554f5)', display: 'grid', placeItems: 'center', color: '#fff' }}>
          <LifeBuoy size={22} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Technical Support</h1>
          <div style={{ color: '#64748b', fontSize: 13 }}>Report problems and track our responses.</div>
        </div>
        <button onClick={() => setShowNew(true)} style={btnPrimary}>
          <Plus size={16} /> New ticket
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard icon={LifeBuoy} label="All tickets"       value={counts.total} tone="#2554f5" />
        <StatCard icon={Clock}    label="In progress"       value={counts.open} tone="#2563eb" />
        <StatCard icon={Hourglass} label="Awaiting you"      value={counts.awaiting_customer} tone="#c2410c" />
        <StatCard icon={MessageSquare} label="Awaiting support" value={counts.awaiting_internal} tone="#0891b2" />
        <StatCard icon={CheckCircle2} label="Resolved"       value={counts.resolved} tone="#059669" />
      </div>

      {err && <div style={errBox}>{err}</div>}

      <div style={card}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}><Loader2 className="spin" size={18} /> Loading…</div>
        ) : tickets.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <LifeBuoy size={38} color="#cbd5e1" />
            <div style={{ marginTop: 10, color: '#475569', fontWeight: 600 }}>No tickets yet</div>
            <div style={{ color: '#94a3b8', fontSize: 13 }}>Submit a ticket if you run into an issue.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748b' }}>
                <th style={th}>Ticket</th>
                <th style={th}>Subject</th>
                <th style={th}>Priority</th>
                <th style={th}>Status</th>
                <th style={th}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} onClick={() => navigate(`/support/${t.id}`)} style={{ cursor: 'pointer', borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ ...td, fontFamily: 'ui-monospace,monospace', fontSize: 12 }}>{t.ticketNumber}</td>
                  <td style={td}>{t.subject}</td>
                  <td style={td}><Pill {...PRIORITY_META[t.priority]} /></td>
                  <td style={td}><Pill {...STATUS_META[t.status]} /></td>
                  <td style={{ ...td, color: '#64748b', fontSize: 12 }}>{fmtDate(t.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && <NewTicketModal onClose={() => setShowNew(false)} onCreated={(id) => { setShowNew(false); navigate(`/support/${id}`) }} />}
    </div>
  )
}

function NewTicketModal({ onClose, onCreated }) {
  const [f, setF] = useState({
    subject: '', category: 'other', priority: 'normal', description: '',
    affectedModule: '', errorMessage: '', stepsToReproduce: '', expectedResult: '', actualResult: '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const upd = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const r = await api('/support/tickets', { method: 'POST', body: f })
      onCreated(r.id)
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <Modal onClose={onClose} title="New support ticket">
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <div style={{ padding: 10, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6, fontSize: 12, color: '#78350f' }}>
          Do not include passwords, secret keys, access tokens, or unnecessary customer records.
        </div>
        <Field label="Subject" required><input value={f.subject} onChange={upd('subject')} required maxLength={200} style={inp} /></Field>
        <div style={row2}>
          <Field label="Category"><select value={f.category} onChange={upd('category')} style={inp}>{CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Priority"><select value={f.priority} onChange={upd('priority')} style={inp}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}</select></Field>
        </div>
        <Field label="Describe the problem" required>
          <textarea value={f.description} onChange={upd('description')} required rows={4} style={{ ...inp, fontFamily: 'inherit' }} />
        </Field>
        <Field label="Affected module (optional)"><input value={f.affectedModule} onChange={upd('affectedModule')} placeholder="Orders, Payments, Reports…" style={inp} /></Field>
        <Field label="Error message (optional)"><input value={f.errorMessage} onChange={upd('errorMessage')} style={inp} /></Field>
        <div style={row2}>
          <Field label="Steps to reproduce"><textarea value={f.stepsToReproduce} onChange={upd('stepsToReproduce')} rows={3} style={{ ...inp, fontFamily: 'inherit' }} /></Field>
          <Field label="Expected result"><textarea value={f.expectedResult} onChange={upd('expectedResult')} rows={3} style={{ ...inp, fontFamily: 'inherit' }} /></Field>
        </div>
        <Field label="Actual result"><textarea value={f.actualResult} onChange={upd('actualResult')} rows={3} style={{ ...inp, fontFamily: 'inherit' }} /></Field>
        {err && <div style={errBox}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 6 }}>
          <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
          <button type="submit" disabled={busy} style={btnPrimary}>{busy ? 'Submitting…' : 'Submit ticket'}</button>
        </div>
      </form>
    </Modal>
  )
}

function TicketDetail({ id }) {
  const [t, setT] = useState(null)
  const [err, setErr] = useState('')
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [reopening, setReopening] = useState(false)

  const load = () => api(`/support/tickets/${id}`).then(setT).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [id])
  useEffect(() => {
    // Light polling for new support messages.
    const t = setInterval(load, 15000); return () => clearInterval(t)
  }, [id])

  const send = async (e) => {
    e.preventDefault()
    if (!reply.trim()) return
    setSending(true)
    try { await api(`/support/tickets/${id}/messages`, { method: 'POST', body: { body: reply } }); setReply(''); await load() }
    catch (e) { setErr(e.message) }
    finally { setSending(false) }
  }
  const reopen = async () => {
    setReopening(true)
    try { await api(`/support/tickets/${id}/reopen`, { method: 'POST' }); await load() }
    catch (e) { setErr(e.message) }
    finally { setReopening(false) }
  }

  if (!t && !err) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}><Loader2 className="spin" size={18} /> Loading…</div>
  if (err) return <div style={{ padding: 24 }}><div style={errBox}>{err}</div></div>

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <Link to="/support" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#2554f5', fontSize: 13, textDecoration: 'none', marginBottom: 16 }}><ArrowLeft size={14} /> All tickets</Link>
      <div style={{ ...card, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontFamily: 'ui-monospace,monospace', color: '#64748b', fontSize: 12 }}>{t.ticketNumber}</div>
            <h1 style={{ margin: '4px 0', fontSize: 20, fontWeight: 700 }}>{t.subject}</h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              <Pill {...STATUS_META[t.status]} />
              <Pill {...PRIORITY_META[t.priority]} />
              <span style={{ fontSize: 12, color: '#64748b' }}>Opened {fmtDate(t.createdAt)}</span>
            </div>
          </div>
          {(t.status === 'resolved' || t.status === 'closed') && (
            <button onClick={reopen} disabled={reopening} style={btnGhost}><RotateCw size={14} /> {reopening ? 'Reopening…' : 'Reopen ticket'}</button>
          )}
        </div>
      </div>

      <div style={{ ...card, padding: 20, marginBottom: 16 }}>
        <SectionLabel>Problem description</SectionLabel>
        <pre style={pre}>{t.description}</pre>
        {t.affectedModule && <Field label="Affected module"><div style={valBox}>{t.affectedModule}</div></Field>}
        {t.errorMessage && <Field label="Error message"><div style={valBox}>{t.errorMessage}</div></Field>}
        {t.stepsToReproduce && <Field label="Steps to reproduce"><pre style={pre}>{t.stepsToReproduce}</pre></Field>}
        {t.expectedResult && <Field label="Expected"><pre style={pre}>{t.expectedResult}</pre></Field>}
        {t.actualResult && <Field label="Actual"><pre style={pre}>{t.actualResult}</pre></Field>}
      </div>

      <div style={{ ...card, padding: 20 }}>
        <SectionLabel>Conversation</SectionLabel>
        <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
          {(t.messages || []).length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>No replies yet.</div>}
          {(t.messages || []).map((m) => (
            <div key={m.id} style={{
              padding: 12, borderRadius: 10,
              background: m.authorType === 'shop' ? '#eff6ff' : '#f1f5f9',
              border: '1px solid ' + (m.authorType === 'shop' ? '#bfdbfe' : '#cbd5e1'),
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                <strong style={{ color: '#0f172a' }}>{m.authorName}</strong>
                <span>· {m.authorType === 'shop' ? 'You' : 'Support'}</span>
                <span>· {fmtDate(m.createdAt)}</span>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{m.body}</div>
            </div>
          ))}
        </div>
        <form onSubmit={send} style={{ display: 'grid', gap: 8 }}>
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Reply to support…" style={{ ...inp, fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" disabled={sending || !reply.trim()} style={btnPrimary}><Send size={14} /> {sending ? 'Sending…' : 'Send reply'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// --- primitives

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div style={{ ...card, padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: tone + '18', color: tone, display: 'grid', placeItems: 'center' }}><Icon size={18} /></div>
      <div><div style={{ fontSize: 12, color: '#64748b' }}>{label}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div></div>
    </div>
  )
}
function Pill({ label, color, bg }) {
  return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, color, background: bg || (color + '18') }}>{label}</span>
}
function Field({ label, required, children }) {
  return <label style={{ display: 'grid', gap: 4 }}><span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{label}{required && <span style={{ color: '#dc2626' }}> *</span>}</span>{children}</label>
}
function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748b', fontWeight: 700, marginBottom: 8 }}>{children}</div>
}
function Modal({ onClose, title, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, maxWidth: 640, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1 }}>{title}</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}
function fmtDate(d) { if (!d) return '—'; const t = new Date(d); const now = new Date(); const sameYear = t.getFullYear() === now.getFullYear(); return t.toLocaleString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric', hour: 'numeric', minute: '2-digit' }) }

// --- style tokens
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }
const th = { textAlign: 'left', padding: '10px 14px', fontWeight: 600 }
const td = { padding: '12px 14px', fontSize: 14 }
const inp = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, width: '100%', boxSizing: 'border-box' }
const row2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }
const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'linear-gradient(90deg,#3c6dff,#2554f5)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer' }
const btnGhost   = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer' }
const errBox = { padding: 10, background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 13, color: '#991b1b' }
const pre = { whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14, background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0', margin: '4px 0 10px' }
const valBox = { fontSize: 14, background: '#f8fafc', padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', margin: '4px 0 10px' }
