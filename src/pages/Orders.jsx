import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FilePlus2, FileText, Search, ArrowUpDown } from 'lucide-react'
import { useShop, DOC_TYPES } from '../store/useShop'
import { computeTotals } from '../lib/totals'
import { money, shortTime, dateTime } from '../lib/format'
import { vehicleLabel } from '../data/vehicles'
import { EmptyState, Tabs } from '../components/ui'
import NewDocumentModal from '../components/documents/NewDocumentModal'

export const STATUS = {
  open: { label: 'Open', cls: '' },
  in_progress: { label: 'In progress', cls: 'badge-info' },
  waiting: { label: 'Waiting on parts', cls: 'badge-warning' },
  ready: { label: 'Ready for pickup', cls: 'badge-success' },
  paid: { label: 'Paid', cls: 'badge-success' },
  declined: { label: 'Declined', cls: 'badge-danger' },
}

export default function Orders() {
  const docs = useShop((s) => s.documents)
  const customers = useShop((s) => s.customers)
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('updated')
  const [newOpen, setNewOpen] = useState(false)

  const rows = useMemo(() => docs.map((d) => {
    const c = customers.find((x) => x.id === d.customerId) || d.customerSnapshot
    const v = customers.find((x) => x.id === d.customerId)?.vehicles.find((x) => x.id === d.vehicleId) || d.vehicleSnapshot
    return { ...d, customer: c, vehicle: v, totals: computeTotals(d) }
  }), [docs, customers])

  const filtered = rows
    .filter((r) => tab === 'all' || r.type === tab)
    .filter((r) => `${r.number} ${r.customer?.name || 'walk-in'} ${r.customer?.phone || ''} ${r.vehicle ? vehicleLabel(r.vehicle) : ''} ${r.vehicle?.vin || ''} ${r.vehicle?.plate || ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sort === 'updated' ? b.updatedAt - a.updatedAt : sort === 'number' ? b.seq - a.seq : b.totals.total - a.totals.total)

  const count = (t) => rows.filter((r) => t === 'all' || r.type === t).length

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Repair Orders</h1><p>Estimates, repair orders and invoices.</p></div>
        <button className="btn btn-primary" onClick={() => setNewOpen(true)}><FilePlus2 size={16} />Create new document</button>
      </div>

      <Tabs label="Document type" value={tab} onChange={setTab} tabs={[{ id: 'all', label: 'All', count: count('all') }, ...Object.entries(DOC_TYPES).map(([k, t]) => ({ id: k, label: `${t.label}s`, count: count(k) }))]} />

      <div className="table-toolbar mt-16">
        <div className="input-wrap" style={{ flex: '1 1 260px', maxWidth: 420 }}><Search size={16} /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, customer, vehicle, VIN, plate…" aria-label="Search documents" /></div>
        <label className="row gap-6 small muted"><ArrowUpDown size={14} />
          <select className="select" style={{ width: 'auto', height: 36 }} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort documents">
            <option value="updated">Updated date</option><option value="number">Document #</option><option value="total">Total</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState icon={FileText} title={rows.length ? 'No matching documents' : 'No documents yet'} action={<button className="btn btn-primary" onClick={() => setNewOpen(true)}><FilePlus2 size={16} />Create new document</button>}>
            {rows.length ? 'Try a different search or tab.' : 'Create an estimate to get started.'}
          </EmptyState>
        </div>
      ) : (
        <div className="doc-grid">
          {filtered.map((r) => (
            <Link key={r.id} to={`/orders/${r.id}`} className="card card-clickable doc-card">
              <div className="row between gap-8">
                <span className={`doc-type t-${r.type}`}>{DOC_TYPES[r.type].label}</span>
                <span className={`badge ${STATUS[r.status]?.cls || ''}`}>{STATUS[r.status]?.label || r.status}</span>
              </div>
              <div className="mt-12">
                <div className="strong" style={{ fontSize: 15.5 }}>{r.customer?.name || 'Walk-in customer'}</div>
                <div className="small muted clamp-1">{r.vehicle ? `${vehicleLabel(r.vehicle)} ${r.vehicle.engineLabel ? `· ${r.vehicle.engineLabel}` : ''}` : 'No vehicle'}</div>
                {r.vehicle?.vin && <div className="mono xs subtle mt-4">{r.vehicle.vin}{r.vehicle.plate ? ` · ${r.vehicle.plate}` : ''}</div>}
              </div>
              <div className="row between mt-16" style={{ alignItems: 'flex-end' }}>
                <div>
                  <div className="doc-num">#{r.number}</div>
                  <div className="xs subtle" title={dateTime(r.updatedAt)}>Updated {shortTime(r.updatedAt)} · {new Date(r.updatedAt).toLocaleDateString()}</div>
                </div>
                <div className="stack" style={{ alignItems: 'flex-end' }}>
                  <span className="strong num" style={{ fontSize: 16 }}>{money(r.totals.total)}</span>
                  {r.totals.balance > 0 && r.type === 'invoice' && <span className="xs" style={{ color: 'var(--danger)' }}>Due {money(r.totals.balance)}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      {newOpen && <NewDocumentModal open onClose={() => setNewOpen(false)} />}
    </div>
  )
}
