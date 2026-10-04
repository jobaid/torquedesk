import { Link } from 'react-router-dom'
import { Car, Clock, Trash2, Wrench, ScanLine, Zap, CalendarCheck, ClipboardList, Megaphone, XCircle } from 'lucide-react'
import { useApp, toast } from '../store/useApp'
import VehicleWizard from '../components/vehicle/VehicleWizard'
import { vehicleLabel, vehicleSub } from '../data/vehicles'
import { relTime } from '../lib/format'

export default function VehiclePage() {
  const vehicle = useApp((s) => s.vehicle)
  const recent = useApp((s) => s.recentVehicles)
  const setVehicle = useApp((s) => s.setVehicle)
  const clearVehicle = useApp((s) => s.clearVehicle)
  const remove = useApp((s) => s.removeRecentVehicle)

  const choose = (v) => { setVehicle(v); toast.success('Vehicle selected', vehicleLabel(v)) }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Vehicle</h1>
          <p>Select by Year / Make / Model, or decode a VIN.</p>
        </div>
      </div>

      <div className="split-main">
        <div className="card card-pad">
          <VehicleWizard onSelect={choose} />
        </div>

        <div className="stack gap-16">
          <div className="card">
            <div className="card-header"><h3><Car size={17} />Current vehicle</h3>
              {vehicle && <button className="btn btn-ghost btn-sm" onClick={() => { clearVehicle(); toast.info('Vehicle cleared') }}><XCircle size={15} />Clear</button>}
            </div>
            <div className="card-body">
              {vehicle ? (
                <div className="stack gap-12">
                  <div>
                    <div className="strong" style={{ fontSize: 18 }}>{vehicleLabel(vehicle)}</div>
                    <div className="muted small">{vehicleSub(vehicle)}</div>
                  </div>
                  <dl className="kv">
                    <dt>Engine</dt><dd>{vehicle.engineDetail}</dd>
                    <dt>Trim</dt><dd>{vehicle.trim}</dd>
                    <dt>Transmission</dt><dd>{vehicle.transmission}</dd>
                    {vehicle.body && <><dt>Body</dt><dd>{vehicle.body}</dd></>}
                    {vehicle.vin && <><dt>VIN</dt><dd className="mono">{vehicle.vin}</dd></>}
                  </dl>
                  <div className="quick-links">
                    {[['/repair', Wrench, 'Repair info'], ['/dtc', ScanLine, 'DTCs'], ['/wiring', Zap, 'Wiring'], ['/maintenance', CalendarCheck, 'Maintenance'], ['/specifications', ClipboardList, 'Specs'], ['/bulletins', Megaphone, 'Bulletins']].map(([to, I, l]) => (
                      <Link key={to} to={to} className="quick-link"><I size={16} />{l}</Link>
                    ))}
                  </div>
                </div>
              ) : <p className="muted">No vehicle selected yet. Use the selector to choose one.</p>}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3><Clock size={17} />Recent vehicles</h3><span className="badge">{recent.length}</span></div>
            <div style={{ padding: 6 }}>
              {recent.length === 0 && <p className="muted small" style={{ padding: 14 }}>Vehicles you select will appear here for one-click access.</p>}
              {recent.map((v) => (
                <div key={v.id} className="row gap-8" style={{ paddingRight: 6 }}>
                  <button className="list-row grow" onClick={() => choose(v)} aria-label={`Open ${vehicleLabel(v)}`}>
                    <span className={`icon-tile sm ${vehicle?.id === v.id ? '' : 'neutral'}`}><Car size={15} /></span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <div className="strong small">{vehicleLabel(v)}</div>
                      <div className="xs subtle">{v.engineLabel} • {relTime(v.lastUsed)}</div>
                    </span>
                    {vehicle?.id === v.id && <span className="badge badge-brand">Current</span>}
                  </button>
                  <button className="icon-btn sm" onClick={() => remove(v.id)} aria-label={`Remove ${vehicleLabel(v)}`}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
