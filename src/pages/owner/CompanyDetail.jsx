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
    </div>
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
