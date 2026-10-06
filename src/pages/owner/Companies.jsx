import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, ExternalLink } from 'lucide-react'
import { ownerApi } from '../../store/useOwner'
import { Card, PageHeader, Btn, Input, Select, StatusPill, Th, Td } from './primitives'

export default function Companies() {
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (search.trim()) params.set('search', search.trim())
    const q = params.toString() ? `?${params}` : ''
    ownerApi('/companies' + q).then(setRows).catch((e) => setError(e.message))
  }, [status, search])

  const empty = useMemo(() => rows && rows.length === 0, [rows])

  return (
    <div>
      <PageHeader
        title="Companies"
        subtitle="Every automobile store on CuraNex."
        actions={<Btn onClick={() => navigate(`${window.location.pathname.startsWith('/owner') ? '/owner' : '/p/admin'}/companies/new`)}><Plus size={14} />Add company</Btn>}
      />

      <Card style={{ marginBottom: 14, padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#5c6c86' }} />
            <Input placeholder="Search by name, email, company code, or slug…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {['trial', 'active', 'suspended', 'expired', 'cancelled', 'pending'].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </Select>
        </div>
      </Card>

      {error && <Card style={{ color: '#ffb3b8' }}>Could not load companies: {error}</Card>}
      {!rows && !error && <Card>Loading…</Card>}
      {rows && (
        <Card style={{ padding: 0, overflowX: 'auto' }}>
          {empty ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#8da2bf' }}>
              No companies yet. Click <strong>Add company</strong> to create one.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <Th>Company</Th><Th>Code</Th><Th>Status</Th><Th>Plan</Th><Th>Expires</Th><Th>Application</Th><Th />
              </tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`${window.location.pathname.startsWith('/owner') ? '/owner' : '/p/admin'}/companies/${c.id}`)}>
                    <Td>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: '#8da2bf' }}>{c.email || c.slug}</div>
                    </Td>
                    <Td style={{ fontFamily: 'monospace', color: '#8da2bf', fontSize: 12 }}>{c.companyCode}</Td>
                    <Td><StatusPill status={c.status} /></Td>
                    <Td style={{ textTransform: 'capitalize' }}>{c.subscription?.plan || '—'}</Td>
                    <Td style={{ color: '#8da2bf' }}>{c.subscription?.endDate || '—'}</Td>
                    <Td>
                      {c.applicationUrl ? (
                        <a href={c.applicationUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: '#5b8def', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          Open <ExternalLink size={11} />
                        </a>
                      ) : <span style={{ color: '#5c6c86' }}>—</span>}
                    </Td>
                    <Td style={{ color: '#5c6c86' }}>›</Td>
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
