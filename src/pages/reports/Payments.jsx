import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import { SkeletonCard, EmptyState } from '../../components/ui'
import ReportFilters, { doCSVExport, doPrint } from './ReportFilters'
import { fetchReport, presetRange, fmtMoney, COLORS } from './common'

export default function Payments() {
  const [filters, setFilters] = useState(() => { const r = presetRange('thisMonth'); return { from: r.from, to: r.to, payment_method: '' } })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchReport('/reports/payments', filters)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [filters])

  const rows = data?.payments || []
  const t = data?.totals || { byMethod: {} }
  const methodData = useMemo(() => Object.entries(t.byMethod || {})
    .map(([method, amount]) => ({ name: method.replace(/_/g, ' '), value: Number(amount || 0) }))
    .filter((r) => r.value > 0), [t.byMethod])

  return (
    <div className="stack gap-16">
      <div><h2 style={{ margin: 0 }}>Payments</h2>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>All payments received by the shop.</div>
      </div>

      <ReportFilters
        filters={filters}
        onChange={setFilters}
        exports={[
          { label: 'CSV', format: 'csv', run: () => doCSVExport('payments', 'payments.csv', rows, [
            { label: 'Date', value: (r) => new Date(r.paidAt).toISOString() },
            { label: '#', value: 'paymentNumber' },
            { label: 'Invoice', value: 'invoiceNumber' },
            { label: 'Method', value: 'method' },
            { label: 'Check #', value: 'checkNumber' },
            { label: 'Reference', value: 'reference' },
            { label: 'Amount', value: (r) => Number(r.amount).toFixed(2) },
            { label: 'Refund', value: (r) => Number(r.refundedAmount).toFixed(2) },
            { label: 'Net', value: (r) => Number(r.netAmount).toFixed(2) },
            { label: 'Status', value: 'status' },
            { label: 'Recorded by', value: 'recordedBy' },
            { label: 'Notes', value: 'notes' },
          ], filters) },
          { label: 'Print', format: 'print', run: () => doPrint('payments', filters) },
        ]}
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="label" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Method</label>
          <select className="input" value={filters.payment_method || ''} onChange={(e) => setFilters({ ...filters, payment_method: e.target.value })}>
            <option value="">All methods</option>
            {['cash', 'check', 'credit_card', 'debit_card', 'financing', 'other'].map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>

      {loading && !data && <SkeletonCard lines={4} />}
      {error && <div className="card" style={{ padding: 16, color: '#dc2626' }}>Unable to load the report. {error}</div>}

      {data && (
        <>
          <div className="card" style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            <Metric label="Total Payments" value={fmtMoney(t.totalPayments)} strong />
            <Metric label="Refunds" value={fmtMoney(t.refunds)} />
            <Metric label="Net Payments" value={fmtMoney(t.netPayments)} />
            {['cash', 'check', 'credit_card', 'debit_card', 'financing', 'other'].map((m) => (
              <Metric key={m} label={m.replace(/_/g, ' ')} value={fmtMoney(t.byMethod?.[m] || 0)} />
            ))}
          </div>

          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ margin: 0, fontSize: 15, marginBottom: 10 }}>Payment Method Breakdown</h3>
            {methodData.length === 0 ? <EmptyState title="No data">No payment records found for the selected date range.</EmptyState> : (
              <div style={{ height: 260 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={methodData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2} isAnimationActive>
                      {methodData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={fmtMoney} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 18 }}>
            {rows.length === 0 ? <EmptyState title="No payments">No payment records found for the selected date range.</EmptyState> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: 13 }}>
                  <thead><tr>
                    <th>Date</th><th>#</th><th>Invoice</th><th>Customer</th>
                    <th>Method</th><th>Check #</th><th>Reference</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ textAlign: 'right' }}>Refund</th>
                    <th style={{ textAlign: 'right' }}>Net</th>
                    <th>Status</th><th>By</th>
                  </tr></thead>
                  <tbody>{rows.map((r) => (
                    <tr key={r.id}>
                      <td>{new Date(r.paidAt).toLocaleDateString()}</td>
                      <td>{r.paymentNumber}</td>
                      <td>{r.invoiceNumber}</td>
                      <td>{customerName(r.customer)}</td>
                      <td style={{ textTransform: 'capitalize' }}>{r.method.replace(/_/g, ' ')}</td>
                      <td>{r.checkNumber || '—'}</td>
                      <td>{r.reference || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{fmtMoney(r.amount)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtMoney(r.refundedAmount)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(r.netAmount)}</td>
                      <td style={{ textTransform: 'capitalize' }}>{r.status.replace(/_/g, ' ')}</td>
                      <td>{r.recordedBy}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Metric({ label, value, strong }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 14px', borderRadius: 10, background: 'var(--surface-raised, rgba(127,127,127,0.08))' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: strong ? 20 : 16, fontWeight: strong ? 700 : 500 }}>{value}</div>
    </div>
  )
}

function customerName(raw) {
  if (!raw) return '—'
  try {
    const c = JSON.parse(raw)
    return c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || '—'
  } catch { return '—' }
}
