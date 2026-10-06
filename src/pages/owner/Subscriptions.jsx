import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ownerApi } from '../../store/useOwner'
import { Card, PageHeader, Select, StatusPill, Th, Td, money } from './primitives'

export default function Subscriptions() {
  const [status, setStatus] = useState('')
  const [plan, setPlan] = useState('')
  const [expiring, setExpiring] = useState('')
  const [rows, setRows] = useState(null)
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

      {error && <Card style={{ color: '#ffb3b8' }}>{error}</Card>}
      {!rows && !error && <Card>Loading…</Card>}
      {rows && (
        <Card style={{ padding: 0, overflowX: 'auto' }}>
          {rows.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#8da2bf' }}>No subscriptions match.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <Th>Company</Th><Th>Plan</Th><Th>Status</Th><Th>Cycle</Th>
                <Th right>Monthly</Th><Th right>Annual</Th><Th>End date</Th><Th right>Days left</Th>
              </tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <Td><Link to={`${window.location.pathname.startsWith('/owner') ? '/owner' : '/p/admin'}/companies/${s.companyId}`} style={{ color: '#e5edf5', fontWeight: 600, textDecoration: 'none' }}>{s.companyName}</Link></Td>
                    <Td style={{ textTransform: 'capitalize' }}>{s.plan}</Td>
                    <Td><StatusPill status={s.status} /></Td>
                    <Td style={{ textTransform: 'capitalize' }}>{s.billingCycle}</Td>
                    <Td right>{money(s.monthlyPrice)}</Td>
                    <Td right>{money(s.annualPrice)}</Td>
                    <Td>{s.endDate || '—'}</Td>
                    <Td right style={{ color: typeof s.daysUntilExpiration === 'number' && s.daysUntilExpiration < 30 ? '#fdba74' : '#8da2bf' }}>
                      {s.daysUntilExpiration ?? '—'}
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
