import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, FilePlus2, ChevronRight, Gauge, Wrench } from 'lucide-react'
import { MAINT_ITEMS, itemsDueAt } from '../data/maintenance'
import { PROCEDURE_INDEX } from '../data/procedures'
import RequireVehicle, { VehicleContext } from '../components/vehicle/RequireVehicle'
import AddToOrderModal from '../components/documents/AddToOrderModal'
import { EmptyState, Field } from '../components/ui'
import { useSettings, laborRateOf } from '../store/useSettings'
import { money } from '../lib/format'

const STOPS = Array.from({ length: 30 }, (_, i) => (i + 1) * 5000)

export default function Maintenance() {
  const [condition, setCondition] = useState('normal')
  const [odo, setOdo] = useState('')
  const [stop, setStop] = useState(30000)
  const [picked, setPicked] = useState(() => new Set())
  const [addOpen, setAddOpen] = useState(false)
  const laborRate = useSettings((s) => laborRateOf(s.data))

  const due = useMemo(() => itemsDueAt(stop, condition), [stop, condition])
  const odoNum = Number(String(odo).replace(/\D/g, ''))
  const odoErr = odo && (!odoNum || odoNum > 500000) ? 'Enter mileage between 1 and 500,000.' : ''

  const applyOdo = () => {
    if (!odoNum || odoErr) return
    const next = STOPS.find((s) => s >= odoNum) || STOPS[STOPS.length - 1]
    setStop(next); setPicked(new Set())
  }

  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allOn = due.length > 0 && due.every((d) => picked.has(d.id))
  const selected = due.filter((d) => picked.has(d.id))
  const hours = selected.reduce((a, d) => a + d.hours, 0)
  const lines = selected.map((d) => ({ kind: 'labor', description: `${d.name} (${stop.toLocaleString()} mi service)`, qty: d.hours, price: laborRate, taxable: false, procedure: d.procedure, useDocRate: true }))

  return (
    <div className="page">
      <RequireVehicle what="the maintenance schedule">
        <div className="page-head">
          <div><h1>Maintenance</h1><p>Factory-style service schedule by mileage and driving condition.</p></div>
          <div className="segmented" role="group" aria-label="Driving condition">
            <button aria-pressed={condition === 'normal'} onClick={() => { setCondition('normal'); setPicked(new Set()) }}>Normal</button>
            <button aria-pressed={condition === 'severe'} onClick={() => { setCondition('severe'); setPicked(new Set()) }}>Severe</button>
          </div>
        </div>
        <VehicleContext />

        <div className="card card-pad mt-16 stack gap-16">
          <div className="row gap-12 wrap" style={{ alignItems: 'flex-end' }}>
            <Field label="Current odometer" htmlFor="odo" error={odoErr} hint="We'll jump to the next due interval." className="grow" >
              <div className="row gap-8">
                <input id="odo" className={`input${odoErr ? ' invalid' : ''}`} inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value.replace(/[^\d,]/g, ''))} onKeyDown={(e) => e.key === 'Enter' && applyOdo()} placeholder="e.g. 48,210" style={{ maxWidth: 220 }} />
                <button className="btn btn-secondary" onClick={applyOdo} disabled={!odoNum || !!odoErr}><Gauge size={16} />Find interval</button>
              </div>
            </Field>
          </div>
          <div>
            <div className="section-title">Service interval (miles)</div>
            <div className="interval-strip mt-8" role="listbox" aria-label="Service interval">
              {STOPS.map((s) => (
                <button key={s} role="option" aria-selected={stop === s} className={`interval${stop === s ? ' on' : ''}${itemsDueAt(s, condition).length >= 6 ? ' major' : ''}`} onClick={() => { setStop(s); setPicked(new Set()) }}>
                  {s >= 1000 ? `${s / 1000}k` : s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="split-main mt-16">
          <div className="card">
            <div className="card-header">
              <h2><CalendarCheck size={18} className="subtle" />{stop.toLocaleString()} mile service</h2>
              {due.length > 0 && <label className="row gap-8 small strong"><input type="checkbox" className="checkbox" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(due.map((d) => d.id)))} />Select all</label>}
            </div>
            {due.length === 0 ? (
              <EmptyState icon={CalendarCheck} title="Nothing scheduled">No items are due at this interval. Choose another mileage.</EmptyState>
            ) : (
              <ul className="maint-list">
                {due.map((d) => (
                  <li key={d.id} className={picked.has(d.id) ? 'on' : ''}>
                    <input type="checkbox" className="checkbox" id={`m-${d.id}`} checked={picked.has(d.id)} onChange={() => toggle(d.id)} />
                    <label htmlFor={`m-${d.id}`} className="grow">
                      <div className="strong">{d.name}</div>
                      <div className="xs subtle">Every {(condition === 'severe' ? d.severe : d.normal).toLocaleString()} mi · {d.hours} hr</div>
                    </label>
                    <span className={`badge ${d.type === 'Replace' ? 'badge-brand' : d.type === 'Inspect' ? 'badge-info' : ''}`}>{d.type}</span>
                    {d.procedure && PROCEDURE_INDEX[d.procedure] && <Link to={`/repair/${d.procedure}`} className="icon-btn sm" aria-label={`Open procedure: ${PROCEDURE_INDEX[d.procedure].title}`}><ChevronRight size={16} /></Link>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="stack gap-16">
            <div className="card card-pad stack gap-12">
              <div className="section-title">Selected service</div>
              <div className="quick-stats">
                <div><CalendarCheck size={16} /><span className="strong">{selected.length}</span><span className="xs subtle">Items</span></div>
                <div><Wrench size={16} /><span className="strong">{hours.toFixed(1)} hr</span><span className="xs subtle">Labor</span></div>
                <div><Gauge size={16} /><span className="strong">{money(hours * laborRate)}</span><span className="xs subtle">Est.</span></div>
              </div>
              <button className="btn btn-primary btn-block" disabled={!selected.length} onClick={() => setAddOpen(true)}><FilePlus2 size={16} />Add to repair order</button>
            </div>
            <div className="card card-pad stack gap-8">
              <div className="section-title">Full schedule</div>
              <div className="table-wrap" style={{ border: 0 }}>
                <table className="table">
                  <thead><tr><th>Item</th><th className="num">Every</th></tr></thead>
                  <tbody>{MAINT_ITEMS.map((m) => <tr key={m.id}><td className="small">{m.name}</td><td className="num small nowrap">{((condition === 'severe' ? m.severe : m.normal) / 1000)}k mi</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        {addOpen && <AddToOrderModal open onClose={() => setAddOpen(false)} lines={lines} title="Add maintenance to repair order" />}
      </RequireVehicle>
    </div>
  )
}
