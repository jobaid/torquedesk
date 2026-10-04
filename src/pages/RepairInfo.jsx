import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ChevronDown, ChevronRight, Clock, Gauge, Wrench, Package, ShieldAlert, ListOrdered, ClipboardList, Link2,
  AlertTriangle, Printer, FilePlus2, Image as ImageIcon, Cpu, Check, Search, RotateCcw, Info,
} from 'lucide-react'
import { CATEGORIES, PROCEDURES, PROCEDURE_INDEX, GROUP_INDEX } from '../data/procedures'
import { COMPONENT_INDEX } from '../data/components'
import { useApp, toast } from '../store/useApp'
import { useSettings, laborRateOf } from '../store/useSettings'
import RequireVehicle from '../components/vehicle/RequireVehicle'
import { EmptyState, FavoriteButton, SkeletonCard, useLoading } from '../components/ui'
import Figure from '../components/repair/Figure'
import RelatedLinks from '../components/repair/RelatedLinks'
import AddToOrderModal from '../components/documents/AddToOrderModal'
import { vehicleLabel } from '../data/vehicles'
import { money } from '../lib/format'

export default function RepairInfo() {
  const { id } = useParams()
  const proc = id ? PROCEDURE_INDEX[id] : null
  const [group, setGroup] = useState(proc?.group || null)
  const [filter, setFilter] = useState('')
  const [openCats, setOpenCats] = useState(() => new Set([proc ? GROUP_INDEX[proc.group].category : 'engine']))

  useEffect(() => {
    if (proc) {
      setGroup(proc.group)
      setOpenCats((s) => new Set([...s, GROUP_INDEX[proc.group].category]))
    }
  }, [proc])

  const toggleCat = (cid) => setOpenCats((s) => { const n = new Set(s); n.has(cid) ? n.delete(cid) : n.add(cid); return n })

  return (
    <div className="page full">
      <RequireVehicle what="repair procedures">
        <div className="three-pane">
          <aside className="pane-left card" aria-label="Repair categories">
            <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
              <div className="input-wrap">
                <Search size={16} />
                <input className="input" style={{ height: 36 }} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter procedures…" aria-label="Filter procedures" />
              </div>
            </div>
            <nav className="tree">
              <button className={`tree-item top${!group && !filter ? ' active' : ''}`} onClick={() => { setGroup(null); setFilter('') }}>
                <ListOrdered size={16} />All procedures<span className="tree-count">{PROCEDURES.length}</span>
              </button>
              {CATEGORIES.map((c) => {
                const open = openCats.has(c.id) || !!filter
                return (
                  <div key={c.id}>
                    <button className="tree-item top" onClick={() => toggleCat(c.id)} aria-expanded={open}>
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}{c.label}
                    </button>
                    {open && c.groups.map((g) => {
                      const count = PROCEDURES.filter((p) => p.group === g.id && match(p, filter)).length
                      if (filter && !count) return null
                      return (
                        <button key={g.id} className={`tree-item${group === g.id ? ' active' : ''}`} onClick={() => setGroup(g.id)} aria-current={group === g.id}>
                          {g.label}<span className="tree-count">{count}</span>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </nav>
          </aside>

          {proc ? <ProcedureView proc={proc} key={proc.id} /> : <ProcedureList group={group} filter={filter} />}
        </div>
      </RequireVehicle>
    </div>
  )
}

const match = (p, f) => !f || `${p.title} ${p.keywords.join(' ')} ${p.system}`.toLowerCase().includes(f.toLowerCase())

function ProcedureList({ group, filter }) {
  const loading = useLoading(`${group}|${filter}`, 260)
  const list = PROCEDURES.filter((p) => (!group || p.group === group) && match(p, filter))
  const g = group ? GROUP_INDEX[group] : null
  const vehicle = useApp((s) => s.vehicle)
  return (
    <section className="pane-center" aria-label="Repair procedures" style={{ gridColumn: 'span 2' }}>
      <div className="stack gap-4" style={{ marginBottom: 14 }}>
        <span className="small subtle">{g ? g.categoryLabel : 'All categories'}</span>
        <h1>{g ? g.label : filter ? `Procedures matching “${filter}”` : 'Repair procedures'}</h1>
        <span className="small muted">{list.length} procedures for {vehicleLabel(vehicle)}</span>
      </div>
      {loading ? (
        <div className="grid-2"><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
      ) : list.length === 0 ? (
        <div className="card"><EmptyState icon={Search} title="No procedures found">Try a different keyword or choose another category.</EmptyState></div>
      ) : (
        <div className="grid-2">
          {list.map((p) => (
            <Link key={p.id} to={`/repair/${p.id}`} className="card card-clickable proc-card">
              <div className="row gap-8 between">
                <span className="badge badge-brand">{GROUP_INDEX[p.group].label}</span>
                <span className={`badge ${p.difficulty === 'Advanced' ? 'badge-warning' : ''}`}>{p.difficulty}</span>
              </div>
              <h3 className="mt-8">{p.title}</h3>
              <p className="small muted clamp-2 mt-4">{p.overview}</p>
              <div className="row gap-16 mt-12 small subtle">
                <span className="row gap-4"><Clock size={14} />{p.laborHours} hr</span>
                <span className="row gap-4"><ListOrdered size={14} />{p.steps.length} steps</span>
                {p.parts.length > 0 && <span className="row gap-4"><Package size={14} />{p.parts.length} parts</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

const SECTIONS = [
  ['overview', 'Overview', Info], ['tools', 'Required Tools', Wrench], ['parts', 'Parts', Package], ['safety', 'Safety', ShieldAlert],
  ['procedure', 'Procedure', ListOrdered], ['specs', 'Specifications', ClipboardList], ['related', 'Related Information', Link2],
]

function ProcedureView({ proc }) {
  const vehicle = useApp((s) => s.vehicle)
  const can = useApp((s) => s.can)
  const addHistory = useApp((s) => s.addHistory)
  const laborRate = useSettings((s) => laborRateOf(s.data))
  const navigate = useNavigate()
  const loading = useLoading(proc.id, 300)
  const [done, setDone] = useState(() => new Set())
  const [expandAll, setExpandAll] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [activeSec, setActiveSec] = useState('overview')
  const group = GROUP_INDEX[proc.group]

  useEffect(() => { addHistory({ query: proc.title, title: proc.title, type: 'procedure', path: `/repair/${proc.id}` }) }, [proc, addHistory])

  useEffect(() => {
    const els = SECTIONS.map(([sid]) => document.getElementById(`sec-${sid}`)).filter(Boolean)
    const obs = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (vis[0]) setActiveSec(vis[0].target.id.replace('sec-', ''))
    }, { rootMargin: '-80px 0px -60% 0px' })
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [loading])

  const toggleStep = (i) => setDone((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })
  const pct = Math.round((done.size / proc.steps.length) * 100)
  const torques = proc.steps.filter((s) => s.torque).map((s) => s.torque)

  const lines = useMemo(() => [
    { kind: 'labor', description: proc.title, qty: proc.laborHours, price: laborRate, taxable: false, procedure: proc.id, useDocRate: true },
    ...proc.parts.map((p) => ({ kind: 'part', description: p.name, partNumber: p.number, qty: p.qty, price: p.price, taxable: true })),
  ], [proc, laborRate])

  if (loading) return <section className="pane-center" style={{ gridColumn: 'span 2' }}><div className="stack gap-16"><SkeletonCard lines={2} /><SkeletonCard lines={5} /><SkeletonCard lines={4} /></div></section>

  const jump = (sid) => document.getElementById(`sec-${sid}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <>
      <article className="pane-center procedure" aria-labelledby="proc-title">
        <div className="card card-pad stack gap-12">
          <div className="small subtle row gap-4 wrap">
            <button className="link-btn" onClick={() => navigate('/repair')}>Repair Information</button><ChevronRight size={12} />
            <span>{group.categoryLabel}</span><ChevronRight size={12} /><span>{group.label}</span>
          </div>
          <div className="row between gap-12 wrap" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="section-title">Repair Procedure</div>
              <h1 id="proc-title" className="mt-4">{proc.title}</h1>
            </div>
            <div className="row gap-8 no-print">
              <FavoriteButton type="procedure" refId={proc.id} title={proc.title} subtitle={`${group.categoryLabel} › ${group.label}`} path={`/repair/${proc.id}`} />
              <button className="btn btn-secondary" onClick={() => (can('print') ? window.print() : toast.error('Printing not permitted for your role'))}><Printer size={16} />Print</button>
            </div>
          </div>
          <dl className="proc-meta">
            <div><dt>Vehicle</dt><dd>{vehicleLabel(vehicle)}</dd></div>
            <div><dt>Engine</dt><dd>{vehicle.engineLabel}</dd></div>
            <div><dt>System</dt><dd>{proc.system}</dd></div>
            <div><dt>Labor time</dt><dd>{proc.laborHours} hr</dd></div>
            <div><dt>Difficulty</dt><dd>{proc.difficulty}</dd></div>
          </dl>
          <nav className="sec-nav no-print" aria-label="Procedure sections">
            {SECTIONS.map(([sid, label]) => <button key={sid} className={activeSec === sid ? 'on' : ''} onClick={() => jump(sid)}>{label}</button>)}
          </nav>
        </div>

        <Section id="overview" title="Overview" icon={Info}>
          <p>{proc.overview}</p>
        </Section>

        <div className="grid-2">
          <Section id="tools" title="Required Tools" icon={Wrench}>
            {proc.tools.length ? <ul className="check-list">{proc.tools.map((t) => <li key={t}><Check size={15} />{t}</li>)}</ul> : <p className="muted small">No special tools required.</p>}
          </Section>
          <Section id="parts" title="Parts" icon={Package}>
            {proc.parts.length ? (
              <ul className="parts-list">
                {proc.parts.map((p) => (
                  <li key={p.number}><span className="grow"><span className="strong">{p.name}</span><span className="mono xs subtle"> {p.number}</span></span><span className="small nowrap">Qty {p.qty}</span><span className="small strong num nowrap">{money(p.price)}</span></li>
                ))}
              </ul>
            ) : <p className="muted small">No parts required.</p>}
          </Section>
        </div>

        <Section id="safety" title="Safety" icon={ShieldAlert}>
          {proc.safety.length ? (
            <div className="stack gap-8">{proc.safety.map((s) => <div key={s} className="callout callout-warning"><AlertTriangle size={18} /><div>{s}</div></div>)}</div>
          ) : <p className="muted small">Follow standard shop safety practices.</p>}
        </Section>

        <Section
          id="procedure" title="Procedure" icon={ListOrdered}
          right={
            <div className="row gap-8 no-print">
              <span className="small muted num">{done.size}/{proc.steps.length} done</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setExpandAll((x) => !x)}><ImageIcon size={15} />{expandAll ? 'Hide' : 'Show'} illustrations</button>
              {done.size > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setDone(new Set())}><RotateCcw size={15} />Reset</button>}
            </div>
          }
        >
          <div className="progress no-print" aria-label={`${pct}% complete`}><span style={{ width: `${pct}%` }} /></div>
          <ol className="steps">
            {proc.steps.map((s, i) => <Step key={i} n={i + 1} step={s} done={done.has(i)} onToggle={() => toggleStep(i)} forceOpen={expandAll} />)}
          </ol>
          {pct === 100 && <div className="callout callout-success mt-12"><Check size={18} /><div><strong>All steps complete.</strong> Verify the repair and road test the vehicle.</div></div>}
        </Section>

        <Section id="specs" title="Specifications" icon={ClipboardList}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Specification</th><th>Value</th></tr></thead>
              <tbody>{proc.specs.map((s) => <tr key={s.label}><td>{s.label}</td><td className="strong mono">{s.value}</td></tr>)}</tbody>
            </table>
          </div>
        </Section>

        <Section id="related" title="Related Information" icon={Link2}>
          <RelatedLinks related={proc.related} />
        </Section>
      </article>

      <aside className="pane-right stack gap-12 no-print" aria-label="Quick information">
        <div className="card card-pad stack gap-12">
          <div className="section-title">Quick info</div>
          <div className="quick-stats">
            <div><Clock size={16} /><span className="strong">{proc.laborHours} hr</span><span className="xs subtle">Labor</span></div>
            <div><Gauge size={16} /><span className="strong">{proc.difficulty}</span><span className="xs subtle">Difficulty</span></div>
            <div><ListOrdered size={16} /><span className="strong">{proc.steps.length}</span><span className="xs subtle">Steps</span></div>
          </div>
          <button className="btn btn-primary btn-block" onClick={() => setAddOpen(true)}><FilePlus2 size={16} />Add to repair order</button>
          <div className="xs subtle">Labor {proc.laborHours} hr × {money(laborRate)} + {proc.parts.length} part line{proc.parts.length === 1 ? '' : 's'}</div>
        </div>
        {torques.length > 0 && (
          <div className="card card-pad stack gap-8">
            <div className="section-title">Torque values</div>
            {[...new Set(torques)].map((t) => <div key={t} className="torque-row"><Gauge size={14} /><span>{t}</span></div>)}
          </div>
        )}
        <div className="card card-pad stack gap-8">
          <div className="section-title">Related</div>
          <RelatedLinks related={proc.related} compact />
        </div>
      </aside>
      <AddToOrderModal open={addOpen} onClose={() => setAddOpen(false)} lines={lines} />
    </>
  )
}

function Section({ id, title, icon: Icon, children, right }) {
  return (
    <section id={`sec-${id}`} className="card proc-section" aria-labelledby={`h-${id}`}>
      <div className="card-header"><h2 id={`h-${id}`}><Icon size={18} className="subtle" />{title}</h2>{right}</div>
      <div className="card-body">{children}</div>
    </section>
  )
}

function Step({ n, step, done, onToggle, forceOpen }) {
  const [open, setOpen] = useState(false)
  const showFig = forceOpen || open
  return (
    <li className={`step${done ? ' done' : ''}`}>
      <button className="step-num" onClick={onToggle} aria-pressed={done} aria-label={`Mark step ${n} ${done ? 'not done' : 'done'}`}>
        {done ? <Check size={18} /> : String(n).padStart(2, '0')}
      </button>
      <div className="step-body">
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        {(step.warning || step.torque || step.spec || step.component) && (
          <div className="stack gap-8 mt-8">
            {step.warning && <div className="callout callout-danger"><AlertTriangle size={17} /><div><strong>Warning: </strong>{step.warning}</div></div>}
            <div className="row gap-8 wrap">
              {step.torque && <span className="spec-chip torque"><Gauge size={14} />{step.torque}</span>}
              {step.spec && <span className="spec-chip"><ClipboardList size={14} />{step.spec}</span>}
              {step.component && COMPONENT_INDEX[step.component] && <Link className="spec-chip link" to={`/components/${step.component}`}><Cpu size={14} />{COMPONENT_INDEX[step.component].name}</Link>}
            </div>
          </div>
        )}
        {step.figure && (
          <div className="mt-8">
            {!forceOpen && <button className="btn btn-ghost btn-sm no-print" onClick={() => setOpen(!open)} aria-expanded={showFig}><ImageIcon size={15} />{showFig ? 'Hide' : 'Show'} illustration</button>}
            {showFig && <Figure name={step.figure} />}
          </div>
        )}
      </div>
    </li>
  )
}
