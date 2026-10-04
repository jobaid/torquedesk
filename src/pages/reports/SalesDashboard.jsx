import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, Users, Calendar, Receipt, Minus } from 'lucide-react'
import { SkeletonCard, EmptyState } from '../../components/ui'
import ReportFilters, { doCSVExport, doPrint } from './ReportFilters'
import ReportPrintHeader from './ReportPrintHeader'
import { fetchReport, presetRange, fmtMoney, fmtCompact, pct, COLORS } from './common'

function KpiCard({ title, value, sub, delta, deltaLabel, icon: Icon }) {
  const positive = delta > 0
  const negative = delta < 0
  const neutral = !positive && !negative
  const DeltaIcon = positive ? TrendingUp : negative ? TrendingDown : Minus
  return (
    <div className="card kpi-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 12, fontWeight: 500, letterSpacing: '.04em', textTransform: 'uppercase' }}>
        {Icon && <Icon size={14} />} {title}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</div>}
      {typeof delta === 'number' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: positive ? '#16a34a' : negative ? '#dc2626' : 'var(--text-muted)' }}>
          <DeltaIcon size={13} />
          <span>{positive ? '+' : ''}{delta.toFixed(2)}%</span>
          {deltaLabel && <span style={{ color: 'var(--text-muted)' }}>· {deltaLabel}</span>}
        </div>
      )}
      {neutral && !delta && delta !== 0 && sub == null && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</div>}
    </div>
  )
}

function Chart({ title, children, empty, action }) {
  return (
    <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
        {action}
      </div>
      {empty ? (
        <EmptyState title="No data" >No sales data available for the selected date range.</EmptyState>
      ) : (
        <div style={{ width: '100%', height: 280 }}>{children}</div>
      )}
    </div>
  )
}

export default function SalesDashboard() {
  const [filters, setFilters] = useState(() => {
    const r = presetRange('thisMonth')
    return { from: r.from, to: r.to }
  })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchReport('/reports/sales/dashboard', filters)
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [filters])

  const kpis = data?.kpis || {}
  const monthDelta = useMemo(() => pct(kpis.monthlySales, kpis.previousMonthlySales), [kpis])
  const yearDelta = useMemo(() => pct(kpis.yearlySales, kpis.previousYearlySales), [kpis])

  const breakdownTotal = (data?.salesBreakdown || []).reduce((s, b) => s + Number(b.amount || 0), 0)
  const breakdownData = (data?.salesBreakdown || []).map((b) => ({
    name: b.category,
    value: Number(b.amount || 0),
    pct: breakdownTotal > 0 ? (Number(b.amount || 0) / breakdownTotal * 100) : 0,
  })).filter((b) => b.value > 0)

  const methodTotal = (data?.paymentMethods || []).reduce((s, b) => s + Number(b.amount || 0), 0)
  const methodData = (data?.paymentMethods || []).map((m) => ({
    name: m.method.replace(/_/g, ' '),
    value: Number(m.amount || 0),
    pct: methodTotal > 0 ? (Number(m.amount || 0) / methodTotal * 100) : 0,
    count: m.count,
  }))

  const monthlySeries = (data?.monthlySales || []).map((r) => ({ month: r.month, sales: Number(r.total || 0) }))
  const dailySeries = (data?.dailySales || []).map((r) => ({ label: r.day || r.week || r.month, sales: Number(r.total || 0) }))

  const techSeries = (data?.technicianSales || []).slice(0, 8).map((t) => ({ name: t.name, total: Number(t.total || 0), labor: Number(t.labor || 0), parts: Number(t.parts || 0) }))

  return (
    <div className="stack gap-16">
      <ReportPrintHeader title="Sales Dashboard" filters={filters} extra={data?.kpis ? `Invoices in period: ${data.kpis.invoiceCount || 0}` : null} />
      <div className="no-print" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0 }}>Sales Dashboard</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Shop financial performance at a glance.</div>
        </div>
      </div>

      <ReportFilters
        filters={filters}
        onChange={setFilters}
        exports={[
          { label: 'Print', format: 'print', run: () => doPrint('sales/dashboard', filters) },
        ]}
      />

      {error && <div className="card" style={{ padding: 16, color: '#dc2626' }}>Unable to load the report. {error}</div>}

      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {loading && !data ? (
          <>{[0, 1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}</>
        ) : (
          <>
            <KpiCard
              title="Monthly Sales" icon={DollarSign}
              value={fmtMoney(kpis.monthlySales)}
              sub={`Previous: ${fmtMoney(kpis.previousMonthlySales)}`}
              delta={monthDelta} deltaLabel="vs. previous month"
            />
            <KpiCard
              title="Daily Average" icon={Calendar}
              value={fmtMoney(kpis.dailyAverageSales)}
              sub={`${kpis.selectedPeriodDays || 0} days in period`}
            />
            <KpiCard
              title="Monthly Avg Customers" icon={Users}
              value={Number(kpis.monthlyAverageCustomers || 0).toFixed(1)}
              sub={`${kpis.currentMonthCustomers || 0} customers this period`}
            />
            <KpiCard
              title="Yearly Sales" icon={TrendingUp}
              value={fmtMoney(kpis.yearlySales)}
              sub={`Previous year: ${fmtMoney(kpis.previousYearlySales)}`}
              delta={yearDelta} deltaLabel="YoY"
            />
            <KpiCard
              title="Tax Collected" icon={Receipt}
              value={fmtMoney(kpis.taxCollectedPeriod)}
              sub={`Month: ${fmtMoney(kpis.taxCollectedMonth)} · Year: ${fmtMoney(kpis.taxCollectedYear)}`}
            />
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
        <Chart title="Monthly Sales Trend (last 12 months)" empty={monthlySeries.length === 0}>
          <ResponsiveContainer>
            <LineChart data={monthlySeries} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.2)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={fmtCompact} />
              <Tooltip formatter={fmtMoney} />
              <Line type="monotone" dataKey="sales" name="Sales" stroke={COLORS[0]} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive />
            </LineChart>
          </ResponsiveContainer>
        </Chart>

        <Chart title="Sales Breakdown" empty={breakdownData.length === 0}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={breakdownData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2} isAnimationActive>
                {breakdownData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v, _n, p) => [`${fmtMoney(v)} (${p.payload.pct.toFixed(1)}%)`, p.payload.name]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Chart>

        <Chart title={`Daily Sales (grouped by ${data?.dailyLabel || 'day'})`} empty={dailySeries.length === 0}>
          <ResponsiveContainer>
            <BarChart data={dailySeries} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.2)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={fmtCompact} />
              <Tooltip formatter={fmtMoney} />
              <Bar dataKey="sales" name="Sales" fill={COLORS[0]} radius={[4, 4, 0, 0]} isAnimationActive />
            </BarChart>
          </ResponsiveContainer>
        </Chart>

        <Chart title="Payment Methods" empty={methodData.length === 0 || methodTotal === 0}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={methodData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2} isAnimationActive>
                {methodData.map((_, i) => <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v, _n, p) => [`${fmtMoney(v)} · ${p.payload.count} payments (${p.payload.pct.toFixed(1)}%)`, p.payload.name]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Chart>

        <Chart title="Sales by Technician" empty={techSeries.length === 0}>
          <ResponsiveContainer>
            <BarChart data={techSeries} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.2)" />
              <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={fmtCompact} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={110} />
              <Tooltip formatter={fmtMoney} />
              <Legend />
              <Bar dataKey="labor" name="Labor" stackId="s" fill={COLORS[1]} isAnimationActive />
              <Bar dataKey="parts" name="Parts" stackId="s" fill={COLORS[0]} isAnimationActive />
            </BarChart>
          </ResponsiveContainer>
        </Chart>

        <Chart title="Tax Collected by Month" empty={(data?.taxByMonth || []).length === 0}>
          <ResponsiveContainer>
            <LineChart data={data?.taxByMonth || []} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.2)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={fmtCompact} />
              <Tooltip formatter={(v, name) => [fmtMoney(v), name === 'collected' ? 'Tax collected' : 'Taxable']} />
              <Line type="monotone" dataKey="collected" name="Tax collected" stroke={COLORS[3]} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive />
            </LineChart>
          </ResponsiveContainer>
        </Chart>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Top Selling Parts</h3>
          <button
            className="btn"
            onClick={() => doCSVExport('sales/dashboard/top-parts', 'top-parts.csv', data?.topParts || [], [
              { label: 'Part #', value: 'partNumber' },
              { label: 'Description', value: 'description' },
              { label: 'Qty', value: (r) => Number(r.quantity).toFixed(2) },
              { label: 'Revenue', value: (r) => Number(r.revenue).toFixed(2) },
              { label: 'Cost', value: (r) => Number(r.cost).toFixed(2) },
              { label: 'Profit', value: (r) => Number(r.profit).toFixed(2) },
              { label: 'Margin %', value: (r) => Number(r.marginPct).toFixed(2) },
            ], filters)}
          >Export CSV</button>
        </div>
        {(data?.topParts || []).length === 0 ? (
          <EmptyState title="No parts sold">No parts have been sold in this period.</EmptyState>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: 14 }}>
              <thead><tr>
                <th>Part #</th><th>Description</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Revenue</th>
                <th style={{ textAlign: 'right' }}>Cost</th>
                <th style={{ textAlign: 'right' }}>Profit</th>
                <th style={{ textAlign: 'right' }}>Margin</th>
              </tr></thead>
              <tbody>
                {data.topParts.map((p, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{p.partNumber}</td>
                    <td>{p.description}</td>
                    <td style={{ textAlign: 'right' }}>{Number(p.quantity).toFixed(2)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(p.revenue)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(p.cost)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(p.profit)}</td>
                    <td style={{ textAlign: 'right' }}>{Number(p.marginPct).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
