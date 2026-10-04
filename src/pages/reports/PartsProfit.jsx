import { useEffect, useState } from 'react'
import { SkeletonCard, EmptyState } from '../../components/ui'
import ReportFilters, { doCSVExport, doPrint } from './ReportFilters'
import { fetchReport, presetRange, fmtMoney } from './common'

export default function PartsProfit() {
  const [filters, setFilters] = useState(() => { const r = presetRange('thisMonth'); return { from: r.from, to: r.to } })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchReport('/reports/sales/parts-profit', filters)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [filters])

  const rows = data?.lines || []
  const t = data?.totals || {}

  return (
    <div className="stack gap-16">
      <div><h2 style={{ margin: 0 }}>Parts Profit</h2>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Profit earned from parts sold. Parts Profit = Parts Sales Price − Parts Cost.</div>
      </div>

      <ReportFilters
        filters={filters}
        onChange={setFilters}
        exports={[
          { label: 'CSV', format: 'csv', run: () => doCSVExport('sales/parts-profit', 'parts-profit.csv', rows, [
            { label: 'Date', value: (r) => new Date(r.invoiceDate).toISOString().slice(0, 10) },
            { label: 'Invoice', value: 'invoiceNumber' },
            { label: 'Part #', value: 'partNumber' },
            { label: 'Description', value: 'description' },
            { label: 'Vendor', value: 'vendor' },
            { label: 'Technician', value: 'technician' },
            { label: 'Qty', value: (r) => Number(r.quantity).toFixed(3) },
            { label: 'Unit cost', value: (r) => Number(r.unitCost).toFixed(2) },
            { label: 'Unit price', value: (r) => Number(r.unitPrice).toFixed(2) },
            { label: 'Total cost', value: (r) => Number(r.totalCost).toFixed(2) },
            { label: 'Total sales', value: (r) => Number(r.totalSales).toFixed(2) },
            { label: 'Profit', value: (r) => Number(r.profit).toFixed(2) },
            { label: 'Margin %', value: (r) => Number(r.marginPct).toFixed(2) },
          ], filters) },
          { label: 'Print', format: 'print', run: () => doPrint('sales/parts-profit', filters) },
        ]}
      />

      {loading && !data && <SkeletonCard lines={4} />}
      {error && <div className="card" style={{ padding: 16, color: '#dc2626' }}>Unable to load the report. {error}</div>}

      {data && (
        <>
          <div className="card" style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <Metric label="Total Parts Cost" value={fmtMoney(t.totalCost)} />
            <Metric label="Total Parts Revenue" value={fmtMoney(t.totalRevenue)} />
            <Metric label="Total Parts Profit" value={fmtMoney(t.totalProfit)} strong />
            <Metric label="Average Margin" value={`${Number(t.averageMarginPct || 0).toFixed(2)}%`} />
          </div>

          <div className="card" style={{ padding: 18 }}>
            {rows.length === 0 ? <EmptyState title="No parts sold">No parts were sold in this date range.</EmptyState> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: 13 }}>
                  <thead><tr>
                    <th>Date</th><th>Invoice</th><th>Part #</th><th>Description</th><th>Vendor</th><th>Tech</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Cost</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th style={{ textAlign: 'right' }}>Profit</th>
                    <th style={{ textAlign: 'right' }}>Margin</th>
                  </tr></thead>
                  <tbody>{rows.map((r, i) => (
                    <tr key={i}>
                      <td>{new Date(r.invoiceDate).toLocaleDateString()}</td>
                      <td>{r.invoiceNumber}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{r.partNumber || '—'}</td>
                      <td>{r.description}</td>
                      <td>{r.vendor || '—'}</td>
                      <td>{r.technician || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{Number(r.quantity).toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtMoney(r.totalCost)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtMoney(r.totalSales)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(r.profit)}</td>
                      <td style={{ textAlign: 'right' }}>{Number(r.marginPct).toFixed(2)}%</td>
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
