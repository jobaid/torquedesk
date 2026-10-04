import { useEffect, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { SkeletonCard, EmptyState } from '../../components/ui'
import ReportFilters, { doCSVExport, doPrint } from './ReportFilters'
import ReportPrintHeader from './ReportPrintHeader'
import { fetchReport, presetRange, fmtMoney, fmtCompact, COLORS } from './common'

export default function Tax() {
  const [filters, setFilters] = useState(() => { const r = presetRange('thisYear'); return { from: r.from, to: r.to } })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchReport('/reports/tax', filters)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [filters])

  const rows = data?.entries || []
  const t = data?.totals || {}
  const byType = (t.byType || []).map((r) => ({ name: r.taxType, value: Number(r.collected || 0) })).filter((r) => r.value > 0)

  return (
    <div className="stack gap-16">
      <ReportPrintHeader title="Tax Report" filters={filters} extra={data?.totals ? `Taxable sales: ${fmtMoney(data.totals.totalTaxableSales)} · Tax collected: ${fmtMoney(data.totals.totalTaxCollected)}` : null} />
      <div className="no-print"><h2 style={{ margin: 0 }}>Tax</h2>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Breaks down collected taxes using the tax amounts stored on each invoice.</div>
      </div>

      <ReportFilters
        filters={filters}
        onChange={setFilters}
        exports={[
          { label: 'CSV', format: 'csv', run: () => doCSVExport('tax', 'tax.csv', rows, [
            { label: 'Date', value: (r) => new Date(r.taxDate).toISOString().slice(0, 10) },
            { label: 'Invoice', value: 'invoiceNumber' },
            { label: 'Tax type', value: 'taxType' },
            { label: 'Rate %', value: (r) => Number(r.taxRate).toFixed(4) },
            { label: 'Taxable', value: (r) => Number(r.taxableAmount).toFixed(2) },
            { label: 'Collected', value: (r) => Number(r.taxCollected).toFixed(2) },
            { label: 'Status', value: 'status' },
          ], filters) },
          { label: 'Print', format: 'print', run: () => doPrint('tax', filters) },
        ]}
      />

      {loading && !data && <SkeletonCard lines={4} />}
      {error && <div className="card" style={{ padding: 16, color: '#dc2626' }}>Unable to load the report. {error}</div>}

      {data && (
        <>
          <div className="card" style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <Metric label="Total Taxable Sales" value={fmtMoney(t.totalTaxableSales)} />
            <Metric label="Total Tax Collected" value={fmtMoney(t.totalTaxCollected)} strong />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
            <div className="card" style={{ padding: 18 }}>
              <h3 style={{ margin: 0, fontSize: 15, marginBottom: 10 }}>Tax Collected by Month</h3>
              {(t.byMonth || []).length === 0 ? <EmptyState title="No data">No tax records found for the selected date range.</EmptyState> : (
                <div style={{ height: 240 }}>
                  <ResponsiveContainer>
                    <LineChart data={t.byMonth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.2)" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={fmtCompact} />
                      <Tooltip formatter={fmtMoney} />
                      <Line type="monotone" dataKey="collected" name="Collected" stroke={COLORS[3]} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="card" style={{ padding: 18 }}>
              <h3 style={{ margin: 0, fontSize: 15, marginBottom: 10 }}>Tax by Type</h3>
              {byType.length === 0 ? <EmptyState title="No data">No tax recorded.</EmptyState> : (
                <div style={{ height: 240 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={byType} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} isAnimationActive>
                        {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={fmtMoney} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ margin: 0, fontSize: 15, marginBottom: 10 }}>By Tax Type</h3>
            {(t.byType || []).length === 0 ? <EmptyState title="No tax" >No tax data.</EmptyState> : (
              <table className="table" style={{ width: '100%', fontSize: 14 }}>
                <thead><tr>
                  <th>Tax Type</th><th style={{ textAlign: 'right' }}>Rate</th>
                  <th style={{ textAlign: 'right' }}>Taxable Sales</th>
                  <th style={{ textAlign: 'right' }}>Tax Collected</th>
                </tr></thead>
                <tbody>{(t.byType || []).map((r, i) => (
                  <tr key={i}><td>{r.taxType}</td>
                    <td style={{ textAlign: 'right' }}>{Number(r.rate).toFixed(4)}%</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(r.taxable)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(r.collected)}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>

          <div className="card" style={{ padding: 18 }}>
            {rows.length === 0 ? <EmptyState title="No tax">No tax records found for the selected date range.</EmptyState> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: 13 }}>
                  <thead><tr>
                    <th>Date</th><th>Invoice</th><th>Tax Type</th>
                    <th style={{ textAlign: 'right' }}>Rate</th>
                    <th style={{ textAlign: 'right' }}>Taxable</th>
                    <th style={{ textAlign: 'right' }}>Collected</th>
                    <th>Status</th>
                  </tr></thead>
                  <tbody>{rows.map((r, i) => (
                    <tr key={i}>
                      <td>{new Date(r.taxDate).toLocaleDateString()}</td>
                      <td>{r.invoiceNumber}</td>
                      <td>{r.taxType}</td>
                      <td style={{ textAlign: 'right' }}>{Number(r.taxRate).toFixed(4)}%</td>
                      <td style={{ textAlign: 'right' }}>{fmtMoney(r.taxableAmount)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(r.taxCollected)}</td>
                      <td style={{ textTransform: 'capitalize' }}>{r.status}</td>
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
