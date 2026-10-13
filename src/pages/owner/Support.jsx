import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import {
  LifeBuoy, Clock, CheckCircle2, AlertTriangle, Hourglass, MessageSquare,
  ArrowLeft, Send, Loader2, Lock, Search,
} from 'lucide-react'
import { ownerApi as api } from '../../store/useOwner'

const CATEGORIES = {
  login_auth: 'Login/Auth', subscription_billing: 'Subscription', payments_stripe: 'Payments',
  permissions: 'Permissions', customers: 'Customers', vehicles: 'Vehicles',
  inspections: 'Inspections', estimates_orders: 'Estimates/ROs', invoices_payments: 'Invoices',
  reports: 'Reports', email_notifications: 'Email', application_errors: 'App errors',
  performance: 'Performance', backup_restore: 'Backup', data_import_export: 'Import/export',
  feature_request: 'Feature request', other: 'Other',
}
const CATEGORY_KEYS = Object.keys(CATEGORIES)
const PRIORITIES = ['low', 'normal', 'high', 'urgent']
const STATUSES = ['open', 'assigned', 'in_progress', 'awaiting_customer', 'awaiting_internal', 'resolved', 'closed']

const STATUS_META = {
  open:              { label: 'Open',             color: '#2563eb', bg: '#dbeafe' },
  assigned:          { label: 'Assigned',         color: '#7c3aed', bg: '#ede9fe' },
  in_progress:       { label: 'In Progress',      color: '#d97706', bg: '#fef3c7' },
  awaiting_customer: { label: 'Awaiting Shop',    color: '#c2410c', bg: '#ffedd5' },
  awaiting_internal: { label: 'Awaiting Support', color: '#0891b2', bg: '#cffafe' },
  resolved:          { label: 'Resolved',         color: '#059669', bg: '#d1fae5' },
  closed:            { label: 'Closed',           color: '#000000', bg: '#e2e8f0' },
}
const PRIORITY_META = {
  low:    { label: 'Low',    color: '#000000' },
  normal: { label: 'Normal', color: '#2563eb' },
  high:   { label: 'High',   color: '#d97706' },
  urgent: { label: 'Urgent', color: '#dc2626' },
}

export default function OwnerSupport() {
  const { id } = useParams()
  if (id) return <OwnerTicket id={id} />
  return <OwnerDesk />
}

function OwnerDesk() {
  const [stats, setStats] = useState(null)
  const [tickets, setTickets] = useState([])
  const [filters, setFilters] = useState({ status: '', priority: '', category: '', q: '' })
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const navigate = useNavigate()

  const load = async () => {
    setLoading(true); setErr('')
    const query = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    // Fetch independently so a stats failure doesn't blank the ticket list.
    try { setStats(await api('/support/stats')) } catch (e) { setErr('Stats: ' + e.message) }
    try { setTickets(await api('/support/tickets' + (query ? '?' + query : ''))) }
    catch (e) { setErr((prev) => (prev ? prev + ' | ' : '') + 'Tickets: ' + e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [filters.status, filters.priority, filters.category])

  const applySearch = (e) => { e.preventDefault(); load() }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg,#2554f5,#7c3aed)', display: 'grid', placeItems: 'center', color: '#fff' }}><LifeBuoy size={22} /></div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Service Desk</h1>
          <div style={{ color: '#000000', fontSize: 13 }}>Tickets across every TorqueDesk company.</div>
        </div>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 20 }}>
          <Stat label="Open" value={stats.open} tone="#2563eb" icon={LifeBuoy} />
          <Stat label="Assigned" value={stats.assigned} tone="#7c3aed" icon={MessageSquare} />
          <Stat label="In progress" value={stats.inProgress} tone="#d97706" icon={Clock} />
          <Stat label="Awaiting shop" value={stats.awaitingCustomer} tone="#c2410c" icon={Hourglass} />
          <Stat label="Awaiting support" value={stats.awaitingInternal} tone="#0891b2" icon={MessageSquare} />
          <Stat label="Resolved" value={stats.resolved} tone="#059669" icon={CheckCircle2} />
          <Stat label="Urgent open" value={stats.urgent} tone="#dc2626" icon={AlertTriangle} />
          <Stat label="Overdue" value={stats.overdue} tone="#b91c1c" icon={AlertTriangle} />
        </div>
      )}

      <form onSubmit={applySearch} style={{ ...card, padding: 12, marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#000000' }} />
          <input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Ticket #, subject, company, submitter…" style={{ ...inp, paddingLeft: 32 }} />
        </div>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} style={inp}><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}</select>
        <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })} style={inp}><option value="">Any priority</option>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}</select>
        <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} style={inp}><option value="">Any category</option>{CATEGORY_KEYS.map((k) => <option key={k} value={k}>{CATEGORIES[k]}</option>)}</select>
        <button type="submit" style={btnPrimary}>Search</button>
        <button type="button" onClick={load} style={btnPrimary} title="Reload">↻</button>
      </form>

      {err && <div style={errBox}>{err}</div>}

      <div style={card}>
        {loading ? <div style={{ padding: 32, textAlign: 'center', color: '#000000' }}><Loader2 className="spin" size={18} /></div> :
         tickets.length === 0 ? <div style={{ padding: 48, textAlign: 'center', color: '#000000' }}>
           No tickets found.
           <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
             If the shop just created one, make sure the backend container has been rebuilt from the latest commit.
           </div>
         </div> :
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#ffffff', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#000000' }}>
                <th style={th}>Ticket</th><th style={th}>Subject</th><th style={th}>Company</th><th style={th}>Priority</th><th style={th}>Status</th><th style={th}>Assignee</th><th style={th}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} onClick={() => navigate(`/p/admin/support/${t.id}`)} style={{ cursor: 'pointer', borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ ...td, fontFamily: 'ui-monospace,monospace', fontSize: 12 }}>{t.ticketNumber}</td>
                  <td style={td}>{t.subject}</td>
                  <td style={td}>{t.company}</td>
                  <td style={td}><Pill {...PRIORITY_META[t.priority]} /></td>
                  <td style={td}><Pill {...STATUS_META[t.status]} /></td>
                  <td style={{ ...td, color: '#000000', fontSize: 13 }}>{t.assignee || '—'}</td>
                  <td style={{ ...td, color: '#000000', fontSize: 12 }}>{fmtDate(t.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>}
      </div>
    </div>
  )
}

function OwnerTicket({ id }) {
  const [t, setT] = useState(null)
  const [admins, setAdmins] = useState([])
  const [reply, setReply] = useState({ body: '', internal: false })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => Promise.all([
    api(`/support/tickets/${id}`),
    api('/support/admins'),
  ]).then(([tk, ad]) => { setT(tk); setAdmins(ad) }).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [id])
  useEffect(() => { const t = setInterval(load, 15000); return () => clearInterval(t) }, [id])

  const update = async (patch) => {
    setBusy(true)
    try { await api(`/support/tickets/${id}`, { method: 'PATCH', body: patch }); await load() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const send = async (e) => {
    e.preventDefault()
    if (!reply.body.trim()) return
    setBusy(true)
    try { await api(`/support/tickets/${id}/messages`, { method: 'POST', body: reply }); setReply({ body: '', internal: reply.internal }); await load() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (!t && !err) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" size={18} /></div>
  if (err) return <div style={{ padding: 24 }}><div style={errBox}>{err}</div></div>

  return (
    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 20 }}>
      <div>
        <Link to="/p/admin/support" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#2554f5', fontSize: 13, textDecoration: 'none', marginBottom: 16 }}><ArrowLeft size={14} /> Service Desk</Link>
        <div style={{ ...card, padding: 20, marginBottom: 16 }}>
          <div style={{ fontFamily: 'ui-monospace,monospace', color: '#000000', fontSize: 12 }}>{t.ticketNumber}</div>
          <h1 style={{ margin: '4px 0', fontSize: 20, fontWeight: 700 }}>{t.subject}</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6, fontSize: 13, color: '#000000' }}>
            <span><strong>Company:</strong> {t.company}</span>
            <span><strong>Submitter:</strong> {t.submitterName} ({t.submitterEmail})</span>
            <span><strong>Category:</strong> {CATEGORIES[t.category] || t.category}</span>
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
            {(t.messages || []).map((m) => (
              <div key={m.id} style={{
                padding: 12, borderRadius: 10,
                background: m.visibility === 'internal' ? '#fef3c7' : (m.authorType === 'shop' ? '#eff6ff' : '#f1f5f9'),
                border: '1px solid ' + (m.visibility === 'internal' ? '#fcd34d' : (m.authorType === 'shop' ? '#bfdbfe' : '#cbd5e1')),
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#000000', marginBottom: 4 }}>
                  <strong style={{ color: '#000000' }}>{m.authorName}</strong>
                  <span>· {m.authorType === 'shop' ? 'Shop' : 'Support'}</span>
                  <span>· {fmtDate(m.createdAt)}</span>
                  {m.visibility === 'internal' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#92400e', fontWeight: 700 }}><Lock size={11} /> Internal note</span>}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{m.body}</div>
              </div>
            ))}
            {(t.messages || []).length === 0 && <div style={{ color: '#000000', fontSize: 13 }}>No messages yet.</div>}
          </div>
          <form onSubmit={send} style={{ display: 'grid', gap: 8 }}>
            <textarea value={reply.body} onChange={(e) => setReply({ ...reply, body: e.target.value })} rows={3} placeholder={reply.internal ? 'Internal note (shop will not see this)…' : 'Reply to shop…'} style={{ ...inp, fontFamily: 'inherit', background: reply.internal ? '#fffbeb' : '#fff' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', color: reply.internal ? '#92400e' : '#000000' }}>
                <input type="checkbox" checked={reply.internal} onChange={(e) => setReply({ ...reply, internal: e.target.checked })} />
                <Lock size={13} /> Internal note (owner-only)
              </label>
              <button type="submit" disabled={busy || !reply.body.trim()} style={btnPrimary}><Send size={14} /> {busy ? 'Sending…' : (reply.internal ? 'Save note' : 'Send reply')}</button>
            </div>
          </form>
        </div>

        {t.audit && t.audit.length > 0 && (
          <div style={{ ...card, padding: 20, marginTop: 16 }}>
            <SectionLabel>Activity</SectionLabel>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 13, color: '#000000', display: 'grid', gap: 6 }}>
              {t.audit.map((a, i) => (
                <li key={i}><strong>{a.actorName}</strong> {prettyAction(a)} <span style={{ color: '#000000' }}>· {fmtDate(a.createdAt)}</span></li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <aside style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        <div style={{ ...card, padding: 16 }}>
          <SectionLabel>Status</SectionLabel>
          <select value={t.status} onChange={(e) => update({ status: e.target.value })} disabled={busy} style={inp}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </div>
        <div style={{ ...card, padding: 16 }}>
          <SectionLabel>Priority</SectionLabel>
          <select value={t.priority} onChange={(e) => update({ priority: e.target.value })} disabled={busy} style={inp}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
          </select>
        </div>
        <div style={{ ...card, padding: 16 }}>
          <SectionLabel>Assignee</SectionLabel>
          <select value={t.assignedAdminId || ''} onChange={(e) => update({ assignedAdminId: e.target.value })} disabled={busy} style={inp}>
            <option value="">Unassigned</option>
            {admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div style={{ ...card, padding: 16, fontSize: 13 }}>
          <SectionLabel>SLA</SectionLabel>
          <div style={{ color: '#000000' }}><strong>First response due:</strong><br />{fmtDate(t.slaResponseDueAt)}</div>
          <div style={{ color: '#000000', marginTop: 6 }}><strong>Resolve due:</strong><br />{fmtDate(t.slaResolveDueAt)}</div>
          {t.firstResponseAt && <div style={{ color: '#059669', marginTop: 6, fontSize: 12 }}>First response: {fmtDate(t.firstResponseAt)}</div>}
        </div>
      </aside>
    </div>
  )
}

function prettyAction(a) {
  const map = { status_changed: 'changed status', priority_changed: 'changed priority', category_changed: 'changed category', assigned: 'assigned', unassigned: 'unassigned', created: 'created the ticket', reopened: 'reopened the ticket' }
  const verb = map[a.action] || a.action
  if (a.from && a.to) return `${verb} ${a.from} → ${a.to}`
  if (a.to) return `${verb} ${a.to}`
  return verb
}

// shared primitives
function Stat({ label, value, tone, icon: Icon }) {
  return <div style={{ ...card, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
    <div style={{ width: 32, height: 32, borderRadius: 8, background: tone + '18', color: tone, display: 'grid', placeItems: 'center' }}><Icon size={16} /></div>
    <div><div style={{ fontSize: 11, color: '#000000' }}>{label}</div><div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div></div>
  </div>
}
function Pill({ label, color, bg }) { return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, color, background: bg || (color + '18') }}>{label}</span> }
function Field({ label, children }) { return <label style={{ display: 'grid', gap: 4 }}><span style={{ fontSize: 12, fontWeight: 600, color: '#000000' }}>{label}</span>{children}</label> }
function SectionLabel({ children }) { return <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#000000', fontWeight: 700, marginBottom: 8 }}>{children}</div> }
function fmtDate(d) { if (!d) return '—'; const t = new Date(d); return t.toLocaleString() }

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }
const th = { textAlign: 'left', padding: '10px 14px', fontWeight: 600 }
const td = { padding: '12px 14px', fontSize: 14 }
const inp = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, width: '100%', boxSizing: 'border-box' }
const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'linear-gradient(90deg,#3c6dff,#2554f5)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer' }
const errBox = { padding: 10, background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 13, color: '#991b1b' }
const pre = { whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14, background: '#ffffff', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0', margin: '4px 0 10px' }
const valBox = { fontSize: 14, background: '#ffffff', padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', margin: '4px 0 10px' }
