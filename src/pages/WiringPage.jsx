import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Zap, ArrowLeft, ChevronRight, Search } from 'lucide-react'
import { DIAGRAMS, DIAGRAM_INDEX } from '../data/wiring'
import RequireVehicle, { VehicleContext } from '../components/vehicle/RequireVehicle'
import DiagramViewer from '../components/wiring/DiagramViewer'
import { EmptyState, FavoriteButton, SkeletonCard, useLoading } from '../components/ui'
import { useApp } from '../store/useApp'

export default function WiringPage() {
  const { id } = useParams()
  const d = id ? DIAGRAM_INDEX[id] : null
  return (
    <div className="page full">
      <RequireVehicle what="wiring diagrams">
        {id ? (d ? <Viewer d={d} key={d.id} /> : <div className="card"><EmptyState icon={Zap} title="Diagram not found" action={<Link to="/wiring" className="btn btn-primary">All diagrams</Link>}>This wiring diagram doesn't exist for this vehicle.</EmptyState></div>) : <Index />}
      </RequireVehicle>
    </div>
  )
}

function Index() {
  const [q, setQ] = useState('')
  const loading = useLoading('wiring', 280)
  const list = DIAGRAMS.filter((d) => `${d.title} ${d.system} ${d.description} ${d.components.map((c) => c.label).join(' ')}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div style={{ maxWidth: 1480, margin: '0 auto' }}>
      <div className="page-head">
        <div><h1>Wiring Diagrams</h1><p>System schematics with circuit colors, connectors and grounds.</p></div>
        <div className="input-wrap" style={{ width: 280 }}><Search size={16} /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search system or component…" aria-label="Search diagrams" /></div>
      </div>
      <VehicleContext />
      <div className="grid-3 mt-16">
        {loading ? [1, 2, 3].map((i) => <SkeletonCard key={i} />) : list.length === 0 ? (
          <div className="card" style={{ gridColumn: '1 / -1' }}><EmptyState icon={Search} title="No diagrams found">Try a different keyword, such as “starter” or “fan”.</EmptyState></div>
        ) : list.map((d) => (
          <Link key={d.id} to={`/wiring/${d.id}`} className="card card-clickable diagram-card">
            <div className="diagram-thumb"><Thumb d={d} /></div>
            <div className="card-pad" style={{ paddingTop: 14 }}>
              <div className="row between"><h3>{d.title}</h3><ChevronRight size={16} className="subtle" /></div>
              <p className="small muted mt-4 clamp-2">{d.description}</p>
              <div className="row gap-6 mt-8"><span className="badge badge-info">{d.system}</span><span className="badge">Sheet {d.sheet}</span></div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function Thumb({ d }) {
  return (
    <svg viewBox="0 0 1000 640" aria-hidden="true">
      {d.wires.map((w) => <polyline key={w.id} points={w.points.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--brand)" strokeOpacity="0.55" strokeWidth="6" />)}
      {d.components.map((c) => <rect key={c.id} x={c.x} y={c.y} width={c.w} height={c.h} rx="10" fill="var(--surface)" stroke="var(--text-3)" strokeWidth="5" />)}
    </svg>
  )
}

function Viewer({ d }) {
  const navigate = useNavigate()
  const addHistory = useApp((s) => s.addHistory)
  useEffect(() => { addHistory({ query: d.title, title: `${d.title} Wiring Diagram`, type: 'wiring', path: `/wiring/${d.id}` }) }, [d, addHistory])
  const loading = useLoading(d.id, 300)
  return (
    <div className="stack gap-12">
      <div className="row between wrap gap-12">
        <div className="row gap-12">
          <Link to="/wiring" className="icon-btn bordered" aria-label="Back to diagrams"><ArrowLeft size={18} /></Link>
          <div>
            <h1 style={{ fontSize: 20 }}>{d.title}</h1>
            <div className="small muted">{d.description} · Sheet {d.sheet}</div>
          </div>
        </div>
        <div className="row gap-8 wrap">
          <select className="select" style={{ width: 'auto' }} value={d.id} onChange={(e) => navigate(`/wiring/${e.target.value}`)} aria-label="Switch diagram">
            {DIAGRAMS.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
          <FavoriteButton type="wiring" refId={d.id} title={`${d.title} Wiring Diagram`} subtitle={d.system} path={`/wiring/${d.id}`} />
        </div>
      </div>
      {loading ? <SkeletonCard lines={8} /> : <DiagramViewer diagram={d} />}
    </div>
  )
}
