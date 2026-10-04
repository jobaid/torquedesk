import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { SkeletonCard, EmptyState } from '../../components/ui'
import ReportFilters, { doCSVExport, doPrint } from './ReportFilters'
import ReportPrintHeader from './ReportPrintHeader'
import { fetchReport, presetRange, fmtMoney, fmtCompact, COLORS } from './common'

function Metric({ label, value, strong }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 14px', borderRadius: 10, background: 'var(--surface-raised, rgba(127,127,127,0.08))' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: strong ? 20 : 16, fontWeight: strong ? 700 : 500 }}>{value}</div>
    </div>
  )
}

function Section({ title, children, extra }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
        {extra}
      </div>
      {children}
    </div>
  )
}

export default function SalesSummary() {
  const [filters, setFilters] = useState(() => { const r = presetRange('thisMonth'); return { from: r.from, to: r.to } })
  const [data, setData] = useState(null)
  const [invoices, setInvoices] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchReport('/reports/sales/summary', filters),
      fetchReport('/reports/sales/invoices', { ...filters }),
    ])
      .then(([s, inv]) => { if (!cancelled) { setData(s); setInvoices(inv) } })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [filters])

  const t = data?.totals || {}
  const invRows = invoices?.invoices || []

  return (
    <div className="stack gap-16">
      <ReportPrintHeader title="Sales Summary" filters={filters} extra={data?.totals ? `${data.totals.numberOfInvoices || 0} invoices · ${data.totals.numberOfCustomers || 0} customers` : null} />
      <div className="no-print"><h2 style={{ margin: 0 }}>Sales Summary</h2>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Summarizes sales totals and all detail records.</div>
      </div>

      <ReportFilters
        filters={filters}
        onChange={setFilters}
        exports={[
          { label: 'CSV', format: 'csv', run: () => doCSVExport('sales/summary', 'sales-summary.csv', invRows, [
            { label: 'Date', value: (r) => new Date(r.date).toISOString().slice(0, 10) },
            { label: 'Invoice', value: 'invoiceNumber' },
            { label: 'Parts', value: (r) => Number(r.parts).toFixed(2) },
            { label: 'Labor', value: (r) => Number(r.labor).toFixed(2) },
            { label: 'Fees', value: (r) => Number(r.fees).toFixed(2) },
            { label: 'Discount', value: (r) => Number(r.discount).toFixed(2) },
            { label: 'Tax', value: (r) => Number(r.tax).toFixed(2) },
            { label: 'Total', value: (r) => Number(r.total).toFixed(2) },
            { label: 'Paid', value: (r) => Number(r.paid).toFixed(2) },
            { label: 'Balance', value: (r) => Number(r.balance).toFixed(2) },
            { label: 'Status', value: 'paymentStatus' },
          ], filters) },
          { label: 'Print', format: 'print', run: () => doPrint('sales/summary', filters) },
        ]}
      />

      {loading && !data && <SkeletonCard lines={4} />}
      {error && <div className="card" style={{ padding: 16, color: '#dc2626' }}>Unable to load the report. {error}</div>}

      {data && (
        <>
          <Section title="Totals">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <Metric label="Total Sales" value={fmtMoney(t.totalSales)} strong />
              <Metric label="Total Invoiced" value={fmtMoney(t.totalInvoiced)} />
              <Metric label="Total Paid" value={fmtMoney(t.totalPaid)} />
              <Metric label="Outstanding Balance" value={fmtMoney(t.outstandingBalance)} />
              <Metric label="Parts Sales" value={fmtMoney(t.totalParts)} />
              <Metric label="Labor Sales" value={fmtMoney(t.totalLabor)} />
              <Metric label="Other Sales" value={fmtMoney(t.totalOther)} />
              <Metric label="Discounts" value={fmtMoney(t.totalDiscounts)} />
              <Metric label="Shop Fees" value={fmtMoney(t.totalShopFees)} />
              <Metric label="Taxes" value={fmtMoney(t.totalTaxes)} />
              <Metric label="# Invoices" value={t.numberOfInvoices || 0} />
              <Metric label="# Customers" value={t.numberOfCustomers || 0} />
              <Metric label="Avg / Invoice" value={fmtMoney(t.averageSalePerInvoice)} />
              <Metric label="Avg / Customer" value={fmtMoney(t.averageSalePerCustomer)} />
            </div>
          </Section>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
            <Section title="Sales by Month">
              {(data.byMonth || []).length === 0 ? <EmptyState title="No data">No sales in this range.</EmptyState> : (
                <div style={{ height: 240 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.byMonth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.2)" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={fmtCompact} />
                      <Tooltip formatter={fmtMoney} />
                      <Bar dataKey="total" fill={COLORS[0]} name="Sales" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Section>
            <Section title="Sales by Day">
              {(data.byDate || []).length === 0 ? <EmptyState title="No data">No sales in this range.</EmptyState> : (
                <div style={{ height: 240 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.byDate}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.2)" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={fmtCompact} />
                      <Tooltip formatter={fmtMoney} />
                      <Bar dataKey="total" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Section>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 20 }}>
            <Section title="Sales by Technician">
              <StaffTable rows={data.byTechnician} />
            </Section>
            <Section title="Sales by Service Writer">
              <StaffTable rows={data.byServiceWriter} />
            </Section>
            <Section title="Sales by Payment Method">
              {(data.byPaymentMethod || []).length === 0 ? <EmptyState title="No data">No payments recorded.</EmptyState> : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
                    <thead><tr><th style={{ textAlign: 'left', padding: '8px 10px' }}>Method</th><th style={{ textAlign: 'right', padding: '8px 10px' }}>Count</th><th style={{ textAlign: 'right', padding: '8px 10px' }}>Amount</th></tr></thead>
                    <tbody>{data.byPaymentMethod.map((r) => (
                      <tr key={r.method}><td style={{ textTransform: 'capitalize', padding: '8px 10px' }}>{r.method.replace(/_/g, ' ')}</td>
                        <td style={{ textAlign: 'right', padding: '8px 10px' }}>{r.count}</td>
                        <td style={{ textAlign: 'right', padding: '8px 10px' }}>{fmtMoney(r.amount)}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </Section>
          </div>

          <Section title="Invoices" extra={<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{invoices?.total || 0} total</span>}>
            {invRows.length === 0 ? <EmptyState title="No invoices">No sales data available for the selected date range.</EmptyState> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: 13 }}>
                  <thead><tr>
                    <th>Date</th><th>Invoice #</th><th>Customer</th>
                    <th style={{ textAlign: 'right' }}>Parts</th>
                    <th style={{ textAlign: 'right' }}>Labor</th>
                    <th style={{ textAlign: 'right' }}>Fees</th>
                    <th style={{ textAlign: 'right' }}>Discount</th>
                    <th style={{ textAlign: 'right' }}>Tax</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right' }}>Paid</th>
                    <th style={{ textAlign: 'right' }}>Balance</th>
                    <th>Status</th>
                  </tr></thead>
                  <tbody>
                    {invRows.map((r) => (
                      <tr key={r.id}>
                        <td>{new Date(r.date).toLocaleDateString()}</td>
                        <td><Link to={`/orders/${r.id}`}>{r.invoiceNumber}</Link></td>
                        <td>{customerName(r.customer)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMoney(r.parts)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMoney(r.labor)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMoney(r.fees)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMoney(r.discount)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMoney(r.tax)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(r.total)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMoney(r.paid)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMoney(r.balance)}</td>
                        <td style={{ textTransform: 'capitalize' }}>{r.paymentStatus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  )
}

function StaffTable({ rows }) {
  if (!rows || rows.length === 0) return <EmptyState title="No data">No activity in this range.</EmptyState>
  const cell = { padding: '8px 10px', whiteSpace: 'nowrap' }
  const num = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table" style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse', minWidth: 420 }}>
        <thead>
          <tr>
            <th style={{ ...cell, textAlign: 'left' }}>Name</th>
            <th style={num}>ROs</th>
            <th style={num}>Labor</th>
            <th style={num}>Parts</th>
            <th style={num}>Total</th>
            <th style={num}>Avg RO</th>
          </tr>
        </thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}>
            <td style={cell}>{r.name}</td>
            <td style={num}>{r.repairOrders}</td>
            <td style={num}>{fmtMoney(r.labor)}</td>
            <td style={num}>{fmtMoney(r.parts)}</td>
            <td style={{ ...num, fontWeight: 600 }}>{fmtMoney(r.total)}</td>
            <td style={num}>{fmtMoney(r.avgRO)}</td>
          </tr>
        ))}</tbody>
      </table>
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
