import { Link, useNavigate } from 'react-router-dom'
import { Car, Wrench, ScanLine, Zap, CalendarCheck, ClipboardList, ArrowRight, Clock, Search, FileText, Megaphone, ScanBarcode, X } from 'lucide-react'
import { useApp, useUI, toast } from '../store/useApp'
import { useShop, DOC_TYPES } from '../store/useShop'
import { greeting, relTime, money } from '../lib/format'
import { vehicleLabel, vehicleSub } from '../data/vehicles'
import { TSBS } from '../data/tsbs'
import { computeTotals } from '../lib/totals'
import { TypeIcon } from '../components/search/TypeIcon'
import { SkeletonCard, useLoading } from '../components/ui'

const ACTIONS = [
  { id: 'vehicle', title: 'Select Vehicle', body: 'Choose a vehicle or enter VIN.', icon: Car, tone: '' },
  { id: 'repair', title: 'Search Repair', body: 'Find repair procedures.', icon: Wrench, to: '/repair', tone: '' },
  { id: 'dtc', title: 'Diagnose DTC', body: 'Search diagnostic trouble codes.', icon: ScanLine, to: '/dtc', tone: 'warning' },
  { id: 'wiring', title: 'Wiring Diagrams', body: 'Find electrical diagrams.', icon: Zap, to: '/wiring', tone: 'info' },
  { id: 'maint', title: 'Maintenance', body: 'View maintenance information.', icon: CalendarCheck, to: '/maintenance', tone: 'success' },
  { id: 'specs', title: 'Specifications', body: 'Find vehicle specifications.', icon: ClipboardList, to: '/specifications', tone: 'neutral' },
]

export default function Dashboard() {
  const user = useApp((s) => s.user)
  const vehicle = useApp((s) => s.vehicle)
  const recentVehicles = useApp((s) => s.recentVehicles)
  const history = useApp((s) => s.searchHistory)
  const setVehicle = useApp((s) => s.setVehicle)
  const removeRecentVehicle = useApp((s) => s.removeRecentVehicle)
  const openPicker = useUI((s) => s.openVehiclePicker)
  const openPalette = useUI((s) => s.openPalette)
  const docs = useShop((s) => s.documents)
  const customers = useShop((s) => s.customers)
  const navigate = useNavigate()
  const loading = useLoading('dash', 300)

  const action = (a) => (a.id === 'vehicle' ? openPicker() : navigate(a.to))
  const openDocs = docs.filter((d) => d.type !== 'invoice').slice(0, 4)

  return (
    <div className="page">
      <section className="hero">
        <div className="grow">
          <h1 className="hero-title">{greeting()}, {user.name.split(' ')[0]}</h1>
          <p className="hero-sub">What would you like to work on?</p>
          <button className="hero-search" onClick={openPalette}>
            <Search size={19} />
            <span className="grow">Search vehicle, DTC, component, repair procedure…</span>
            <span className="kbd">Ctrl K</span>
          </button>
        </div>
        <div className="hero-vehicle">
          {vehicle ? (
            <>
              <div className="row gap-12">
                <span className="icon-tile"><Car size={20} /></span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="xs subtle strong">CURRENT VEHICLE</div>
                  <div className="strong" style={{ fontSize: 16 }}>{vehicleLabel(vehicle)}</div>
                  <div className="small muted">{vehicleSub(vehicle)}</div>
                </div>
              </div>
              {vehicle.vin && <div className="mono xs subtle">VIN {vehicle.vin}</div>}
              <button className="btn btn-secondary btn-sm" onClick={openPicker} style={{ alignSelf: 'flex-end' }}>Change ›</button>
            </>
          ) : (
            <>
              <div className="row gap-12">
                <span className="icon-tile warning"><Car size={20} /></span>
                <div>
                  <div className="strong">No vehicle selected</div>
                  <div className="small muted">Pick a vehicle to see specific information.</div>
                </div>
              </div>
              <div className="row gap-8">
                <button className="btn btn-primary btn-sm" onClick={openPicker}><Car size={15} />Select</button>
                <button className="btn btn-secondary btn-sm" onClick={openPicker}><ScanBarcode size={15} />VIN</button>
              </div>
            </>
          )}
        </div>
      </section>

      <div className="grid-actions">
        {ACTIONS.map((a) => (
          <button key={a.id} className="card card-clickable action-card" onClick={() => action(a)}>
            <span className={`icon-tile ${a.tone}`}><a.icon size={21} /></span>
            <div className="strong" style={{ fontSize: 15 }}>{a.title}</div>
            <div className="small muted">{a.body}</div>
            <ArrowRight size={16} className="action-arrow" />
          </button>
        ))}
      </div>

      <div className="dash-grid">
        <section className="stack gap-12" aria-labelledby="rv-h">
          <div className="row between">
            <h2 id="rv-h">Recent vehicles</h2>
            <Link to="/vehicle" className="small strong">View all</Link>
          </div>
          {loading ? <div className="grid-2"><SkeletonCard /><SkeletonCard /></div> : recentVehicles.length ? (
            <div className="grid-2">
              {recentVehicles.slice(0, 4).map((v) => (
                <div key={v.id} className={`card vehicle-card${vehicle?.id === v.id ? ' current' : ''}`}>
                  <button className="icon-btn sm vehicle-card-x" onClick={() => removeRecentVehicle(v.id)} aria-label={`Remove ${vehicleLabel(v)} from recent`}><X size={14} /></button>
                  <div className="strong" style={{ fontSize: 15 }}>{vehicleLabel(v)}</div>
                  <div className="small muted">{[v.engineLabel, v.transmission].join(' • ')}</div>
                  <div className="xs subtle row gap-4 mt-8"><Clock size={12} />Last used: {relTime(v.lastUsed)}</div>
                  <button
                    className={`btn btn-sm mt-12 ${vehicle?.id === v.id ? 'btn-soft' : 'btn-secondary'}`}
                    onClick={() => { setVehicle(v); toast.success('Vehicle selected', vehicleLabel(v)) }}
                  >
                    {vehicle?.id === v.id ? 'Current vehicle' : 'Open Vehicle'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="card card-pad row gap-12">
              <span className="icon-tile neutral"><Car size={19} /></span>
              <div className="grow"><div className="strong">No recent vehicles</div><div className="small muted">Vehicles you select will appear here.</div></div>
              <button className="btn btn-primary btn-sm" onClick={openPicker}>Select vehicle</button>
            </div>
          )}

          <div className="row between mt-16">
            <h2>Open repair orders</h2>
            <Link to="/orders" className="small strong">All documents</Link>
          </div>
          <div className="card">
            {openDocs.length === 0 && <p className="muted" style={{ padding: 20 }}>No open estimates or repair orders.</p>}
            {openDocs.map((d) => {
              const c = customers.find((x) => x.id === d.customerId) || d.customerSnapshot
              const v = customers.find((x) => x.id === d.customerId)?.vehicles.find((x) => x.id === d.vehicleId) || d.vehicleSnapshot
              return (
                <Link key={d.id} to={`/orders/${d.id}`} className="list-row" style={{ borderRadius: 0, borderBottom: '1px solid var(--border)' }}>
                  <TypeIcon type="document" />
                  <span className="grow" style={{ minWidth: 0 }}>
                    <div className="strong">{c?.name || 'Walk-in customer'}</div>
                    <div className="small muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v ? vehicleLabel(v) : 'No vehicle'}</div>
                  </span>
                  <span className="stack" style={{ alignItems: 'flex-end' }}>
                    <span className={`badge badge-${DOC_TYPES[d.type].tone}`}>{DOC_TYPES[d.type].label}</span>
                    <span className="small strong num mt-4">#{d.number} · {money(computeTotals(d).total)}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        </section>

        <aside className="stack gap-12" aria-labelledby="rs-h">
          <div className="row between">
            <h2 id="rs-h">Recent searches</h2>
            <Link to="/history" className="small strong">History</Link>
          </div>
          <div className="card" style={{ padding: 6 }}>
            {loading ? <div style={{ padding: 12 }}><div className="skeleton" style={{ height: 120 }} /></div> : history.length ? history.slice(0, 6).map((h) => (
              <Link key={h.id} to={h.path} className="list-row">
                {h.type ? <TypeIcon type={h.type} size="sm" /> : <span className="icon-tile sm neutral"><Search size={15} /></span>}
                <span className="grow" style={{ minWidth: 0 }}>
                  <div className="strong small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.title || h.query}</div>
                  <div className="xs subtle">{h.vehicleLabel}</div>
                </span>
                <span className="xs subtle nowrap">{relTime(h.at)}</span>
              </Link>
            )) : (
              <div style={{ padding: 16 }} className="stack gap-8">
                <p className="small muted">No searches yet. Try one:</p>
                <div className="row gap-6 wrap">
                  {['P0300', 'Brake pads', 'Alternator'].map((s) => <Link key={s} className="chip" to={`/search?q=${encodeURIComponent(s)}`}>{s}</Link>)}
                </div>
              </div>
            )}
          </div>

          <div className="row between mt-16">
            <h2>Latest bulletins</h2>
            <Link to="/bulletins" className="small strong">All</Link>
          </div>
          <div className="card" style={{ padding: 6 }}>
            {[...TSBS].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4).map((t) => (
              <Link key={t.id} to={`/bulletins/${t.id}`} className="list-row">
                <span className={`icon-tile sm ${t.type === 'Safety Recall' ? 'danger' : 'info'}`}>{t.type === 'Safety Recall' ? <Megaphone size={15} /> : <FileText size={15} />}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <div className="strong small">{t.title}</div>
                  <div className="xs subtle">{t.number} · {t.system}</div>
                </span>
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
