import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, PauseCircle, PlayCircle, XCircle, Copy, ExternalLink, CalendarPlus, Download } from 'lucide-react'
import { ownerApi, useOwner } from '../../store/useOwner'
import { Card, PageHeader, Btn, StatusPill, Th, Td, money } from './primitives'

export default function CompanyDetail() {
  const { id } = useParams()
  const [c, setC] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const load = () => ownerApi(`/companies/${id}`).then(setC).catch((e) => setError(e.message))
  useEffect(() => { load() }, [id])

  const changeStatus = async (status, reason = '') => {
    if (!confirm(`Change status to "${status}"?`)) return
    setBusy(true)
    try {
      await ownerApi(`/companies/${id}/status`, { method: 'PATCH', body: { status, reason } })
      await load()
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  // Download this company's full data snapshot: customers, documents (ROs,
  // estimates, invoices), payments, settings, users (passwords redacted),
  // audit log. Audited server-side in saas_audit_log.
  const downloadBackup = async () => {
    setBusy(true)
    try {
      const token = useOwner.getState().owner?.token
      const res = await fetch(`/api/owner/companies/${id}/backup`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`Download failed (${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers.get('Content-Disposition') || ''
      const m = cd.match(/filename="([^"]+)"/)
      a.download = m ? m[1] : `torquedesk-backup-${c.slug}-${Date.now()}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  const extend = async (days) => {
    if (!c?.subscription?.id) return
    setBusy(true)
    try {
      await ownerApi(`/subscriptions/${c.subscription.id}`, { method: 'PATCH', body: { extendDays: days } })
      await load()
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (error) return <Card style={{ color: '#ffb3b8' }}>{error}</Card>
  if (!c) return <Card>Loading…</Card>

  const addr = c.address || {}
  const addrLine = [addr.street, [addr.city, addr.state, addr.zip].filter(Boolean).join(', '), addr.country].filter(Boolean).join(' · ')

  return (
    <div style={{ maxWidth: 1100 }}>
      <PageHeader
        title={c.name}
        subtitle={<span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}><code style={{ color: '#8da2bf', fontSize: 12 }}>{c.companyCode}</code> · <StatusPill status={c.status} /></span>}
        actions={<div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="secondary" onClick={downloadBackup} disabled={busy}><Download size={14} />Download data</Btn>
          <Btn variant="secondary" onClick={() => navigate(-1)}><ArrowLeft size={14} />Back</Btn>
        </div>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <Card>
            <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>Overview</h3>
            <Grid>
              <KV k="Legal name" v={c.legalName || '—'} />
              <KV k="Industry" v={c.industry} />
              <KV k="Timezone" v={c.timezone} />
              <KV k="Phone" v={c.phone || '—'} />
              <KV k="Email" v={c.email || '—'} />
              <KV k="Website" v={c.website ? <a href={c.website} target="_blank" rel="noreferrer" style={{ color: '#5b8def' }}>{c.website}</a> : '—'} />
              <KV k="Address" v={addrLine || '—'} />
              <KV k="Created" v={new Date(c.createdAt).toLocaleString()} />
            </Grid>
          </Card>

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>Subscription</h3>
              {c.subscription && <StatusPill status={c.subscription.status} />}
            </div>
            {c.subscription ? (
              <>
                <Grid>
                  <KV k="Plan" v={<span style={{ textTransform: 'capitalize' }}>{c.subscription.plan}</span>} />
                  <KV k="Billing cycle" v={<span style={{ textTransform: 'capitalize' }}>{c.subscription.billingCycle}</span>} />
                  <KV k="Monthly price" v={money(c.subscription.monthlyPrice)} />
                  <KV k="Annual price" v={money(c.subscription.annualPrice)} />
                  <KV k="Start" v={c.subscription.startDate || '—'} />
                  <KV k="End" v={<span>{c.subscription.endDate || '—'}{typeof c.subscription.daysUntilExpiration === 'number' && (
                    <span style={{ color: c.subscription.daysUntilExpiration < 7 ? '#ffb3b8' : c.subscription.daysUntilExpiration < 30 ? '#fdba74' : '#8da2bf', marginLeft: 8, fontSize: 11 }}>
                      ({c.subscription.daysUntilExpiration} days)
                    </span>
                  )}</span>} />
                  <KV k="Auto-renew" v={c.subscription.autoRenewal ? 'Yes' : 'No'} />
                  <KV k="Payment status" v={<span style={{ textTransform: 'capitalize' }}>{c.subscription.paymentStatus}</span>} />
                </Grid>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <Btn variant="secondary" onClick={() => extend(30)} disabled={busy}><CalendarPlus size={13} />Extend 30 days</Btn>
                  <Btn variant="secondary" onClick={() => extend(90)} disabled={busy}><CalendarPlus size={13} />Extend 90 days</Btn>
                  <Btn variant="secondary" onClick={() => extend(365)} disabled={busy}><CalendarPlus size={13} />Extend 1 year</Btn>
                </div>
              </>
            ) : <div style={{ color: '#8da2bf' }}>No subscription on file.</div>}
          </Card>

          <Card>
            <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>Owners</h3>
            {c.owners?.length === 0 ? (
              <div style={{ color: '#8da2bf' }}>No owners.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><Th>Name</Th><Th>Email</Th><Th>Username</Th><Th>Status</Th><Th>Last login</Th></tr></thead>
                <tbody>
                  {c.owners.map((o) => (
                    <tr key={o.id}>
                      <Td>{[o.firstName, o.lastName].filter(Boolean).join(' ') || '—'}</Td>
                      <Td>{o.email}</Td>
                      <Td style={{ fontFamily: 'monospace' }}>{o.username}</Td>
                      <Td><StatusPill status={o.status} /></Td>
                      <Td style={{ color: '#8da2bf' }}>{o.lastLoginAt ? new Date(o.lastLoginAt).toLocaleString() : 'Never'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <Card>
            <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>Access</h3>
            <div style={{ marginBottom: 10, fontSize: 13 }}>
              Application access: <strong style={{ color: c.status === 'active' || c.status === 'trial' ? '#86efac' : '#ffb3b8' }}>
                {c.status === 'active' || c.status === 'trial' ? 'Allowed' : 'Blocked'}
              </strong>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <Btn onClick={() => changeStatus('active')} disabled={busy || c.status === 'active'}><PlayCircle size={14} />Activate</Btn>
              <Btn variant="secondary" onClick={() => changeStatus('suspended', prompt('Reason? (optional)') || '')} disabled={busy || c.status === 'suspended'}><PauseCircle size={14} />Suspend</Btn>
              <Btn variant="secondary" onClick={() => changeStatus('expired')} disabled={busy || c.status === 'expired'}>Mark expired</Btn>
              <Btn variant="danger" onClick={() => changeStatus('cancelled', prompt('Reason? (optional)') || '')} disabled={busy || c.status === 'cancelled'}><XCircle size={14} />Cancel</Btn>
            </div>
          </Card>

          <Card>
            <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>Application URL</h3>
            <div style={{ fontSize: 12, color: '#8da2bf', marginBottom: 8, wordBreak: 'break-all' }}>{c.applicationUrl || '— not set —'}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="secondary" onClick={() => c.applicationUrl && navigator.clipboard?.writeText(c.applicationUrl)}><Copy size={13} />Copy</Btn>
              {c.applicationUrl && <Btn variant="secondary" onClick={() => window.open(c.applicationUrl, '_blank', 'noopener')}><ExternalLink size={13} />Open</Btn>}
            </div>
          </Card>
        </div>
      </div>

      <FeatureAccess companyId={id} />
    </div>
  )
}

function FeatureAccess({ companyId }) {
  const [state, setState] = useState(null) // { features: {k:bool}, catalog: [...] }
  const [draft, setDraft] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = async () => {
    try {
      const r = await ownerApi(`/companies/${companyId}/features`)
      setState(r); setDraft(r.features || {})
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [companyId])

  const dirty = state && Object.keys({ ...state.features, ...draft }).some((k) => (state.features[k] ?? false) !== (draft[k] ?? false))

  const save = async () => {
    setBusy(true); setErr('')
    try {
      const r = await ownerApi(`/companies/${companyId}/features`, { method: 'PUT', body: { features: draft } })
      setState(r); setDraft(r.features || {})
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }
  const reset = () => setDraft(state?.features || {})
  const toggle = (k) => setDraft((d) => ({ ...d, [k]: !d[k] }))
  const groupToggle = (keys, on) => setDraft((d) => { const n = { ...d }; keys.forEach((k) => (n[k] = on)); return n })

  if (!state) return <Card style={{ marginTop: 16 }}>Loading feature access…</Card>

  // Group catalog by `group`.
  const groups = []
  const idx = new Map()
  for (const f of state.catalog) {
    if (!idx.has(f.group)) { idx.set(f.group, groups.length); groups.push({ name: f.group, items: [] }) }
    groups[idx.get(f.group)].items.push(f)
  }
  const enabledCount = Object.values(draft).filter(Boolean).length
  const totalCount = state.catalog.length

  return (
    <Card style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 14, flex: 1 }}>Feature access</h3>
        <span style={{ fontSize: 12, color: '#8da2bf' }}>{enabledCount} / {totalCount} enabled</span>
        {dirty && (
          <>
            <Btn variant="ghost" onClick={reset} disabled={busy}>Reset</Btn>
            <Btn onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Btn>
          </>
        )}
      </div>
      <div style={{ fontSize: 12, color: '#8da2bf', marginBottom: 14 }}>
        Toggle which modules this shop can access. Disabled items disappear from their sidebar at next sign-in or page reload. Server-side enforcement follows in a later update.
      </div>
      {err && <div style={{ color: '#fda4af', fontSize: 12, marginBottom: 10 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {groups.map((g) => {
          const allOn = g.items.every((f) => draft[f.key])
          const allOff = g.items.every((f) => !draft[f.key])
          return (
            <div key={g.name} style={{ background: '#0b1220', border: '1px solid #1e2a44', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, fontSize: 11, color: '#8da2bf', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600 }}>{g.name}</div>
                <button type="button" onClick={() => groupToggle(g.items.map((f) => f.key), !allOn)}
                  style={{ background: 'transparent', border: '1px solid #2a3650', color: '#8da2bf', borderRadius: 6, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>
                  {allOn ? 'All off' : 'All on'}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {g.items.map((f) => {
                  const on = !!draft[f.key]
                  return (
                    <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px', cursor: 'pointer' }}>
                      <span onClick={() => toggle(f.key)} style={{
                        position: 'relative', display: 'inline-block', width: 32, height: 18, borderRadius: 999,
                        background: on ? '#2563eb' : '#2a3650', transition: 'background 0.15s', flexShrink: 0,
                      }}>
                        <span style={{
                          position: 'absolute', top: 2, left: on ? 16 : 2, width: 14, height: 14, borderRadius: '50%',
                          background: '#fff', transition: 'left 0.15s',
                        }} />
                      </span>
                      <span style={{ fontSize: 13, color: on ? '#e5edf5' : '#8da2bf' }}>{f.label}</span>
                    </label>
                  )
                })}
              </div>
              {allOff && <div style={{ marginTop: 6, fontSize: 10, color: '#fda4af' }}>All {g.name.toLowerCase()} features disabled</div>}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

const Grid = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>{children}</div>
)
const KV = ({ k, v }) => (
  <div style={{ padding: '6px 0' }}>
    <div style={{ fontSize: 11, color: '#8da2bf', textTransform: 'uppercase', letterSpacing: '.05em' }}>{k}</div>
    <div style={{ fontSize: 13, color: '#e5edf5', marginTop: 2 }}>{v}</div>
  </div>
)
