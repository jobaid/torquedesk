import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Cpu, MapPin, Plug, Activity, Search, ArrowLeft } from 'lucide-react'
import { COMPONENTS, COMPONENT_INDEX } from '../data/components'
import RequireVehicle, { VehicleContext } from '../components/vehicle/RequireVehicle'
import { EmptyState, FavoriteButton, SkeletonCard, useLoading } from '../components/ui'
import RelatedLinks from '../components/repair/RelatedLinks'
import { useApp } from '../store/useApp'

export default function ComponentsPage() {
  const { id } = useParams()
  const c = id ? COMPONENT_INDEX[id] : null
  return (
    <div className="page">
      <RequireVehicle what="component locations">
        {id ? (c ? <Detail c={c} key={c.id} /> : <div className="card"><EmptyState icon={Cpu} title="Component not found" action={<Link to="/components" className="btn btn-primary">All components</Link>} /></div>) : <List />}
      </RequireVehicle>
    </div>
  )
}

function List() {
  const [q, setQ] = useState('')
  const [sys, setSys] = useState('all')
  const loading = useLoading('comps', 280)
  const systems = [...new Set(COMPONENTS.map((c) => c.system))].sort()
  const list = COMPONENTS.filter((c) => (sys === 'all' || c.system === sys) && `${c.name} ${c.system} ${c.location}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <div className="page-head"><div><h1>Components</h1><p>Locations, function, connector pinouts and quick tests.</p></div></div>
      <VehicleContext />
      <div className="table-toolbar mt-16">
        <div className="input-wrap" style={{ flex: '1 1 260px', maxWidth: 380 }}><Search size={16} /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search components…" aria-label="Search components" /></div>
        <select className="select" style={{ width: 'auto' }} value={sys} onChange={(e) => setSys(e.target.value)} aria-label="System"><option value="all">All systems</option>{systems.map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      {loading ? <div className="grid-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div> : list.length === 0 ? (
        <div className="card"><EmptyState icon={Search} title="No components found">Try a different keyword or system.</EmptyState></div>
      ) : (
        <div className="grid-3">
          {list.map((c) => (
            <Link key={c.id} to={`/components/${c.id}`} className="card card-clickable card-pad stack gap-8">
              <div className="row gap-12"><span className="icon-tile neutral"><Cpu size={18} /></span><div className="grow" style={{ minWidth: 0 }}><h3>{c.name}</h3><span className="xs subtle">{c.system}</span></div></div>
              <p className="small muted clamp-2"><MapPin size={13} style={{ verticalAlign: -2 }} /> {c.location}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

function Detail({ c }) {
  const addHistory = useApp((s) => s.addHistory)
  useEffect(() => { addHistory({ query: c.name, title: c.name, type: 'component', path: `/components/${c.id}` }) }, [c, addHistory])
  return (
    <div className="stack gap-16" style={{ maxWidth: 1100 }}>
      <div className="row between wrap gap-8">
        <Link to="/components" className="btn btn-ghost btn-sm"><ArrowLeft size={15} />All components</Link>
        <FavoriteButton type="component" refId={c.id} title={c.name} subtitle={c.system} path={`/components/${c.id}`} />
      </div>
      <div className="card card-pad row gap-16" style={{ alignItems: 'flex-start' }}>
        <span className="icon-tile" style={{ width: 52, height: 52 }}><Cpu size={24} /></span>
        <div className="grow"><div className="section-title">{c.system}</div><h1 className="mt-4">{c.name}</h1><p className="muted mt-8">{c.function}</p></div>
      </div>
      <div className="grid-3">
        <div className="card card-pad stack gap-8"><h3 className="row gap-8"><MapPin size={17} className="subtle" />Location</h3><p className="small">{c.location}</p></div>
        <div className="card card-pad stack gap-8"><h3 className="row gap-8"><Plug size={17} className="subtle" />Connector</h3><p className="small mono">{c.connector}</p></div>
        <div className="card card-pad stack gap-8"><h3 className="row gap-8"><Activity size={17} className="subtle" />Quick test</h3><p className="small">{c.test}</p></div>
      </div>
      <section className="card card-pad stack gap-12">
        <h2>Related information</h2>
        <RelatedLinks related={{ procedures: c.procedures, dtcs: c.dtcs, wiring: c.wiring, components: [] }} />
      </section>
    </div>
  )
}
