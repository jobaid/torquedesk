import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Megaphone, ArrowLeft, Calendar, Clock, Package, ScanLine, Wrench, ShieldAlert, Search, Printer, ChevronRight } from 'lucide-react'
import { TSBS, TSB_INDEX } from '../data/tsbs'
import { PROCEDURE_INDEX } from '../data/procedures'
import { useApp, toast } from '../store/useApp'
import { EmptyState, FavoriteButton, SkeletonList, useLoading } from '../components/ui'
import { VehicleContext } from '../components/vehicle/RequireVehicle'

export default function Bulletins() {
  const { id } = useParams()
  if (id) {
    const t = TSB_INDEX[id]
    return <div className="page">{t ? <Detail t={t} /> : <div className="card"><EmptyState icon={Megaphone} title="Bulletin not found" action={<Link to="/bulletins" className="btn btn-primary">All bulletins</Link>} /></div>}</div>
  }
  return <div className="page"><List /></div>
}

function List() {
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const [sys, setSys] = useState('all')
  const [sort, setSort] = useState('newest')
  const loading = useLoading('tsb', 300)
  const systems = [...new Set(TSBS.map((t) => t.system))].sort()
  const list = TSBS
    .filter((t) => (type === 'all' || t.type === type) && (sys === 'all' || t.system === sys) && `${t.number} ${t.title} ${t.summary} ${t.dtcs.join(' ')}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (sort === 'newest' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)))

  return (
    <>
      <div className="page-head"><div><h1>Technical Bulletins</h1><p>Service bulletins and safety recalls for the selected vehicle.</p></div></div>
      <VehicleContext />
      <div className="table-toolbar mt-16">
        <div className="input-wrap" style={{ flex: '1 1 260px', maxWidth: 380 }}><Search size={16} /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, title or DTC…" aria-label="Search bulletins" /></div>
        <div className="segmented" role="group" aria-label="Type">
          {[['all', 'All'], ['Service Bulletin', 'Bulletins'], ['Safety Recall', 'Recalls']].map(([v, l]) => <button key={v} aria-pressed={type === v} onClick={() => setType(v)}>{l}</button>)}
        </div>
        <select className="select" style={{ width: 'auto' }} value={sys} onChange={(e) => setSys(e.target.value)} aria-label="System"><option value="all">All systems</option>{systems.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="select" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
      </div>
      {loading ? <div className="card card-pad"><SkeletonList rows={5} /></div> : list.length === 0 ? (
        <div className="card"><EmptyState icon={Search} title="No bulletins found">Try a different keyword or clear filters.</EmptyState></div>
      ) : (
        <div className="stack gap-12">
          {list.map((t) => (
            <Link key={t.id} to={`/bulletins/${t.id}`} className="card card-clickable card-pad tsb-card">
              <span className={`icon-tile ${t.type === 'Safety Recall' ? 'danger' : 'info'}`}>{t.type === 'Safety Recall' ? <ShieldAlert size={19} /> : <Megaphone size={19} />}</span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row gap-8 wrap">
                  <span className="mono small strong">{t.number}</span>
                  <span className={`badge ${t.type === 'Safety Recall' ? 'badge-danger' : 'badge-info'}`}>{t.type}</span>
                  <span className="badge">{t.system}</span>
                </div>
                <h3 className="mt-4">{t.title}</h3>
                <p className="small muted mt-4 clamp-2">{t.summary}</p>
                {t.dtcs.length > 0 && <div className="row gap-6 mt-8 wrap">{t.dtcs.map((c) => <span key={c} className="code-pill" style={{ fontSize: 11.5 }}>{c}</span>)}</div>}
              </div>
              <div className="xs subtle nowrap desktop-only">{new Date(t.date).toLocaleDateString()}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

function Detail({ t }) {
  const addHistory = useApp((s) => s.addHistory)
  const can = useApp((s) => s.can)
  useEffect(() => { addHistory({ query: t.number, title: `${t.number}: ${t.title}`, type: 'tsb', path: `/bulletins/${t.id}` }) }, [t, addHistory])
  return (
    <div className="stack gap-16" style={{ maxWidth: 980 }}>
      <div className="row between wrap gap-8 no-print">
        <Link to="/bulletins" className="btn btn-ghost btn-sm"><ArrowLeft size={15} />All bulletins</Link>
        <div className="row gap-8">
          <FavoriteButton type="tsb" refId={t.id} title={`${t.number}: ${t.title}`} subtitle={t.system} path={`/bulletins/${t.id}`} />
          <button className="btn btn-secondary" onClick={() => (can('print') ? window.print() : toast.error('Printing not permitted for your role'))}><Printer size={16} />Print</button>
        </div>
      </div>
      <div className="card card-pad stack gap-12">
        <div className="row gap-8 wrap">
          <span className="mono strong">{t.number}</span>
          <span className={`badge ${t.type === 'Safety Recall' ? 'badge-danger' : 'badge-info'}`}>{t.type}</span>
          <span className="badge">{t.system}</span>
        </div>
        <h1>{t.title}</h1>
        <div className="row gap-16 wrap small muted">
          <span className="row gap-4"><Calendar size={14} />{new Date(t.date).toLocaleDateString(undefined, { dateStyle: 'long' })}</span>
          <span className="row gap-4"><Clock size={14} />{t.laborHours} hr labor</span>
          <span className="row gap-4"><Package size={14} />{t.parts}</span>
        </div>
        {t.type === 'Safety Recall' && <div className="callout callout-danger"><ShieldAlert size={18} /><div><strong>Safety recall.</strong> Repairs are performed free of charge at an authorized dealer. Verify the VIN is included before performing work.</div></div>}
      </div>
      <section className="card card-pad"><h2>Summary</h2><p className="mt-8">{t.summary}</p></section>
      <section className="card card-pad"><h2>Condition</h2><p className="mt-8">{t.condition}</p></section>
      <section className="card card-pad">
        <h2>Correction</h2>
        <ol className="steps compact mt-12">
          {t.correction.map((c, i) => <li key={i} className="step"><span className="step-num">{String(i + 1).padStart(2, '0')}</span><div className="step-body"><p style={{ marginTop: 6 }}>{c}</p></div></li>)}
        </ol>
      </section>
      <div className="grid-2">
        <section className="card card-pad stack gap-8">
          <h3 className="row gap-8"><ScanLine size={17} />Related DTCs</h3>
          {t.dtcs.length ? <div className="row gap-6 wrap">{t.dtcs.map((c) => <Link key={c} to={`/dtc/${c}`} className="code-pill">{c}</Link>)}</div> : <p className="small muted">None.</p>}
        </section>
        <section className="card card-pad stack gap-8">
          <h3 className="row gap-8"><Wrench size={17} />Related procedures</h3>
          {t.procedures.map((p) => PROCEDURE_INDEX[p] && <Link key={p} to={`/repair/${p}`} className="related-row"><Wrench size={15} /><span className="grow small strong">{PROCEDURE_INDEX[p].title}</span><ChevronRight size={14} /></Link>)}
        </section>
      </div>
    </div>
  )
}
