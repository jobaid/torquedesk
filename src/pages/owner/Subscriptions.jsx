import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { ownerApi } from '../../store/useOwner'
import { Card, PageHeader, Select, StatusPill, Btn, Th, Td, money } from './primitives'

export default function Subscriptions() {
  const [status, setStatus] = useState('')
  const [plan, setPlan] = useState('')
  const [expiring, setExpiring] = useState('')
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState('')

  const removeSub = async (s) => {
    if (!confirm(`Delete the subscription for ${s.companyName}? The company stays â€” only this subscription row is removed.`)) return
    setBusy(s.id)
    try {
      await ownerApi(`/subscriptions/${s.id}`, { method: 'DELETE', body: {} })
      setRows((old) => (old || []).filter((x) => x.id !== s.id))
    } catch (e) { alert(e.message) }
    finally { setBusy('') }
  }
  const [error, setError] = useState(null)

  useEffect(() => {
    const p = new URLSearchParams()
    if (status) p.set('status', status)
    if (plan) p.set('plan', plan)
    if (expiring) p.set('expiring_soon', 'true')
    ownerApi('/subscriptions' + (p.toString() ? `?${p}` : '')).then(setRows).catch((e) => setError(e.message))
  }, [status, plan, expiring])

  return (
    <div>
      <PageHeader title="Subscriptions" subtitle="Every customer subscription across the platform." />

      <Card style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {['trial', 'active', 'expired', 'cancelled', 'pending', 'suspended'].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </Select>
          <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="">All plans</option>
            {['starter', 'professional', 'business', 'enterprise'].map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
          </Select>
          <Select value={expiring} onChange={(e) => setExpiring(e.target.value)}>
            <option value="">Any expiry</option>
            <option value="1">Expiring within 30 days</option>
          </Select>
        </div>
      </Card>

      {error && <Card style={{ color: '#dc2626' }}>{error}</Card>}
      {!rows && !error && <Card>Loadingâ€¦</Card>}
      {rows && (
        <Card style={{ padding: 0, overflowX: 'auto' }}>
          {rows.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#000000' }}>No subscriptions match.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <Th>Company</Th><Th>Plan</Th><Th>Status</Th><Th>Cycle</Th>
                <Th right>Monthly</Th><Th right>Annual</Th><Th>End date</Th><Th right>Days left</Th>
                <Th>Customer</Th><Th>Subscription</Th><Th></Th>
              </tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <Td><Link to={`${window.location.pathname.startsWith('/owner') ? '/owner' : '/main/admin'}/companies/${s.companyId}`} style={{ color: '#000000', fontWeight: 600, textDecoration: 'none' }}>{s.companyName}</Link></Td>
                    <Td style={{ textTransform: 'capitalize' }}>{s.plan}</Td>
                    <Td><StatusPill status={s.status} /></Td>
                    <Td style={{ textTransform: 'capitalize' }}>{s.billingCycle}</Td>
                    <Td right>{money(s.monthlyPrice)}</Td>
                    <Td right>{money(s.annualPrice)}</Td>
                    <Td>{s.endDate || 'â€”'}</Td>
                    <Td right style={{ color: typeof s.daysUntilExpiration === 'number' && s.daysUntilExpiration < 30 ? '#fdba74' : '#000000' }}>
                      {s.daysUntilExpiration ?? 'â€”'}
                    </Td>
                    <Td>
                      {s.stripeCustomerId ? (
                        <a href={`https://dashboard.stripe.com/customers/${s.stripeCustomerId}`} target="_blank" rel="noreferrer"
                           title={s.stripeCustomerId}
                           style={{ color: '#5b8def', fontFamily: 'monospace', fontSize: 11 }}>
                          {s.stripeCustomerId.slice(0, 10)}â€¦
                        </a>
                      ) : <span style={{ color: '#000000' }}>â€”</span>}
                    </Td>
                    <Td>
                      {s.stripeSubscriptionId ? (
                        <a href={`https://dashboard.stripe.com/subscriptions/${s.stripeSubscriptionId}`} target="_blank" rel="noreferrer"
                           title={s.stripeSubscriptionId}
                           style={{ color: '#5b8def', fontFamily: 'monospace', fontSize: 11 }}>
                          {s.stripeSubscriptionId.slice(0, 10)}â€¦
                        </a>
                      ) : <span style={{ color: '#000000' }}>â€”</span>}
                    </Td>
                    <Td>
                      <Btn variant="danger" onClick={() => removeSub(s)} disabled={busy === s.id} style={{ padding: '2px 8px', fontSize: 11 }} title="Delete this subscription row">
                        <Trash2 size={13} />
                      </Btn>
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
