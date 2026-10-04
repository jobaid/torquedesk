import { useEffect, useState } from 'react'
import { Building2, CreditCard, Users, DollarSign, AlertTriangle } from 'lucide-react'
import { ownerApi } from '../../store/useOwner'
import { Card, PageHeader, StatusPill, money } from './primitives'

export default function OwnerDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    ownerApi('/dashboard').then(setData).catch((e) => setError(e.message))
  }, [])

  const kpi = (label, value, sub, Icon, color = '#5b8def') => (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#8da2bf', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
        {Icon && <Icon size={16} color={color} />}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#8da2bf', marginTop: 4 }}>{sub}</div>}
    </Card>
  )

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of all customer companies on CuraNex." />
      {error && <Card style={{ color: '#ffb3b8', marginBottom: 16 }}>Could not load dashboard: {error}</Card>}
      {!data && !error && <Card>Loading…</Card>}
      {data && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            {kpi('Total companies', data.companies.total, `${data.companies.active} active`, Building2, '#5b8def')}
            {kpi('Active subscriptions', data.subscriptions.active, `${data.subscriptions.trial} on trial`, CreditCard, '#86efac')}
            {kpi('Expiring soon', data.subscriptions.expiringSoon, 'within 30 days', AlertTriangle, '#fdba74')}
            {kpi('Company owners', data.users.companyOwners, 'active', Users, '#c4b5fd')}
            {kpi('MRR', money(data.revenue.mrr), 'derived from plan prices', DollarSign, '#86efac')}
            {kpi('ARR', money(data.revenue.arr), data.revenue.billingIntegrated ? '' : 'billing not yet wired', DollarSign, '#86efac')}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
            <Card>
              <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>Companies by status</h3>
              {Object.entries(data.companies).filter(([k]) => k !== 'total').map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1e2a44' }}>
                  <StatusPill status={k} />
                  <span style={{ color: '#e5edf5', fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </Card>
            <Card>
              <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>Expiring within 30 days</h3>
              {data.expiringSoonList.length === 0 ? (
                <div style={{ color: '#8da2bf', fontSize: 13 }}>Nothing expiring soon.</div>
              ) : (
                data.expiringSoonList.map((c) => (
                  <div key={c.companyId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1e2a44' }}>
                    <div>
                      <div style={{ fontSize: 13 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: '#8da2bf', textTransform: 'capitalize' }}>{c.plan}</div>
                    </div>
                    <div style={{ fontSize: 12, color: '#fdba74' }}>{c.endDate}</div>
                  </div>
                ))
              )}
            </Card>
            <Card>
              <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>Billing status</h3>
              <div style={{ color: '#8da2bf', fontSize: 13 }}>{data.revenue.note}</div>
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ padding: 10, background: '#0b1220', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: '#8da2bf' }}>Monthly recurring</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{money(data.revenue.mrr)}</div>
                </div>
                <div style={{ padding: 10, background: '#0b1220', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: '#8da2bf' }}>Annual recurring</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{money(data.revenue.arr)}</div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
