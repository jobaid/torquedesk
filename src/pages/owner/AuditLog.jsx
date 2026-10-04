import { useEffect, useState } from 'react'
import { ownerApi } from '../../store/useOwner'
import { Card, PageHeader, Th, Td } from './primitives'

export default function AuditLog() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    ownerApi('/audit?limit=200').then(setRows).catch((e) => setError(e.message))
  }, [])

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every administrative action on the CuraNex platform is recorded here." />
      {error && <Card style={{ color: '#ffb3b8' }}>{error}</Card>}
      {!rows && !error && <Card>Loading…</Card>}
      {rows && (
        <Card style={{ padding: 0, overflowX: 'auto' }}>
          {rows.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#8da2bf' }}>No audit entries yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <Th>Time</Th><Th>Admin</Th><Th>Action</Th><Th>Target</Th><Th>IP</Th><Th>Details</Th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <Td style={{ color: '#8da2bf', whiteSpace: 'nowrap' }}>{new Date(r.at).toLocaleString()}</Td>
                    <Td>{r.adminName}</Td>
                    <Td><span style={{ fontFamily: 'monospace', fontSize: 12, color: '#5b8def' }}>{r.action}</span></Td>
                    <Td style={{ fontSize: 12, color: '#8da2bf' }}>{r.targetType}{r.targetId && <> · {r.targetId.slice(0, 8)}…</>}</Td>
                    <Td style={{ fontSize: 11, color: '#5c6c86' }}>{r.ip || '—'}</Td>
                    <Td style={{ fontSize: 11, color: '#8da2bf', fontFamily: 'monospace', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.details ? JSON.stringify(r.details) : ''}
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
