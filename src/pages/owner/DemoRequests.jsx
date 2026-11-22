import { useCallback, useEffect, useState } from 'react'
import { Search, Send, Check, RotateCcw, X } from 'lucide-react'
import { ownerApi } from '../../store/useOwner'
import { Card, PageHeader, Btn, Input, Select, Th, Td } from './primitives'

const TOPIC_LABEL = { demo: 'Demo', sales: 'Sales', support: 'Support', other: 'Other' }
const STATUS_STYLE = {
  new:       { bg: '#ffedd5', fg: '#c2410c', label: 'New' },
  link_sent: { bg: '#d1fae5', fg: '#047857', label: 'Link sent' },
  closed:    { bg: '#e2e8f0', fg: '#000000', label: 'Closed' },
}

function Pill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.closed
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, background: s.bg, color: s.fg, fontSize: 11, fontWeight: 600 }}>
      {s.label}
    </span>
  )
}

const fmt = (d) => (d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')

export default function DemoRequests() {
  const [topic, setTopic] = useState('demo')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState({})
  const [notice, setNotice] = useState('')
  const [open, setOpen] = useState(null)

  const load = useCallback(() => {
    const p = new URLSearchParams()
    if (topic) p.set('topic', topic)
    if (status) p.set('status', status)
    if (search.trim()) p.set('search', search.trim())
    const q = p.toString() ? `?${p}` : ''
    ownerApi('/demo-requests' + q).then((r) => { setRows(r); setError(null) }).catch((e) => setError(e.message))
  }, [topic, status, search])

  useEffect(() => { load() }, [load])

  async function sendLink(row) {
    setBusy((b) => ({ ...b, [row.id]: 'send' }))
    setNotice('')
    try {
      const r = await ownerApi(`/demo-requests/${row.id}/send-signup-link`, { method: 'POST' })
      setNotice(`Signup link emailed to ${r.sentTo}.`)
      load()
    } catch (e) {
      setNotice(`Could not send: ${e.message}`)
    } finally {
      setBusy((b) => ({ ...b, [row.id]: null }))
    }
  }

  async function setRowStatus(row, next) {
    setBusy((b) => ({ ...b, [row.id]: 'status' }))
    try {
      await ownerApi(`/demo-requests/${row.id}`, { method: 'PATCH', body: { status: next } })
      load()
    } catch (e) {
      setNotice(`Could not update: ${e.message}`)
    } finally {
      setBusy((b) => ({ ...b, [row.id]: null }))
    }
  }

  return (
    <div>
      <PageHeader
        title="Demo Requests"
        subtitle="Messages from the www.fixoraerp.com contact form. Email the signup link to a prospect with one click."
      />

      <Card style={{ marginBottom: 14, padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 170px 170px', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11 }} />
            <Input placeholder="Search by name, email, or shop…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
          </div>
          <Select value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="demo">Demo requests</option>
            <option value="sales">Sales / pricing</option>
            <option value="support">Support</option>
            <option value="other">Other</option>
            <option value="">All messages</option>
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="link_sent">Link sent</option>
            <option value="closed">Closed</option>
          </Select>
        </div>
      </Card>

      {notice && (
        <Card style={{ marginBottom: 14, padding: 12, background: notice.startsWith('Could not') ? '#fef2f2' : '#ecfdf5', color: notice.startsWith('Could not') ? '#b91c1c' : '#047857' }}>
          {notice}
        </Card>
      )}
      {error && <Card style={{ color: '#dc2626' }}>Could not load demo requests: {error}</Card>}
      {!rows && !error && <Card>Loading…</Card>}
      {rows && (
        <Card style={{ padding: 0, overflowX: 'auto' }}>
          {rows.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>No messages match these filters yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <Th>Received</Th><Th>Contact</Th><Th>Shop</Th><Th>Topic</Th><Th>Message</Th><Th>Status</Th><Th right>Actions</Th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <Td style={{ whiteSpace: 'nowrap' }}>{fmt(r.createdAt)}</Td>
                    <Td>
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      <a href={`mailto:${r.email}`} style={{ fontSize: 12, color: '#2554f5' }}>{r.email}</a>
                      {r.phone && <div style={{ fontSize: 12 }}>{r.phone}</div>}
                    </Td>
                    <Td>{r.shop || '—'}</Td>
                    <Td>{TOPIC_LABEL[r.topic] || r.topic}</Td>
                    <Td style={{ maxWidth: 320 }}>
                      <div
                        onClick={() => setOpen(open === r.id ? null : r.id)}
                        title="Click to expand"
                        style={{ cursor: 'pointer', fontSize: 12, whiteSpace: open === r.id ? 'pre-wrap' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {r.message}
                      </div>
                    </Td>
                    <Td>
                      <Pill status={r.status} />
                      {r.linkSentAt && (
                        <div style={{ fontSize: 11, marginTop: 4 }}>
                          Sent {fmt(r.linkSentAt)}{r.linkSentCount > 1 ? ` (×${r.linkSentCount})` : ''}
                        </div>
                      )}
                    </Td>
                    <Td right>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <Btn onClick={() => sendLink(r)} disabled={!!busy[r.id]} style={{ whiteSpace: 'nowrap', opacity: busy[r.id] ? 0.6 : 1 }}>
                          {busy[r.id] === 'send' ? <>Sending…</> : r.linkSentCount > 0 ? <><RotateCcw size={13} />Resend link</> : <><Send size={13} />Send signup link</>}
                        </Btn>
                        {r.status !== 'closed' ? (
                          <Btn variant="secondary" onClick={() => setRowStatus(r, 'closed')} disabled={!!busy[r.id]} title="Mark closed"><X size={13} /></Btn>
                        ) : (
                          <Btn variant="secondary" onClick={() => setRowStatus(r, r.linkSentCount > 0 ? 'link_sent' : 'new')} disabled={!!busy[r.id]} title="Reopen"><Check size={13} /></Btn>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  )
}
