import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Battery, Gauge, Zap, Thermometer, AppWindow, ArrowLeft, RotateCcw, CheckCircle2, XCircle, ChevronRight, ClipboardList, Stethoscope, ScanLine, Wrench, Flag } from 'lucide-react'
import { SYMPTOMS, SYMPTOM_INDEX } from '../data/symptoms'
import { PROCEDURE_INDEX } from '../data/procedures'
import { DTC_INDEX } from '../data/dtcs'
import { useApp } from '../store/useApp'
import { EmptyState, SeverityBadge, SEVERITY, FavoriteButton } from '../components/ui'
import { VehicleContext } from '../components/vehicle/RequireVehicle'

const ICONS = { battery: Battery, gauge: Gauge, zap: Zap, thermometer: Thermometer, window: AppWindow }

export default function Diagnostics() {
  const { id } = useParams()
  if (id) {
    const s = SYMPTOM_INDEX[id]
    return <div className="page">{s ? <Tree symptom={s} key={s.id} /> : <div className="card"><EmptyState icon={Stethoscope} title="Diagnostic not found" action={<Link className="btn btn-primary" to="/diagnostics">All symptoms</Link>}>This guided diagnostic doesn't exist.</EmptyState></div>}</div>
  }
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Diagnostics</h1>
          <p>Answer a few yes/no questions to narrow down the cause.</p>
        </div>
        <Link to="/dtc" className="btn btn-secondary"><ScanLine size={16} />Have a code? Look up DTC</Link>
      </div>
      <VehicleContext />
      <div className="grid-3 mt-16">
        {SYMPTOMS.map((s) => {
          const Icon = ICONS[s.icon] || Stethoscope
          return (
            <Link key={s.id} to={`/diagnostics/${s.id}`} className="card card-clickable card-pad stack gap-8">
              <span className="icon-tile info"><Icon size={20} /></span>
              <h3 className="mt-4">{s.title}</h3>
              <p className="small muted">{s.summary}</p>
              <div className="row between mt-8">
                <span className="badge">{s.system}</span>
                <span className="small strong row gap-4" style={{ color: 'var(--brand-text)' }}>Start <ChevronRight size={14} /></span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function Tree({ symptom }) {
  const [path, setPath] = useState([{ node: symptom.start }])
  const addHistory = useApp((s) => s.addHistory)
  const current = path[path.length - 1].node
  const node = symptom.nodes[current]
  const questionCount = Object.values(symptom.nodes).filter((n) => n.q).length

  useEffect(() => { addHistory({ query: symptom.title, title: symptom.title, type: 'symptom', path: `/diagnostics/${symptom.id}` }) }, [symptom, addHistory])

  const answer = (yes) => setPath((p) => {
    const copy = [...p]
    copy[copy.length - 1] = { ...copy[copy.length - 1], answer: yes }
    return [...copy, { node: yes ? node.yes : node.no }]
  })
  const back = () => setPath((p) => (p.length > 1 ? p.slice(0, -1).map((s, i, a) => (i === a.length - 1 ? { node: s.node } : s)) : p))
  const restart = () => setPath([{ node: symptom.start }])

  return (
    <div className="diag-layout">
      <div className="stack gap-16">
        <div className="row gap-8 wrap between">
          <Link to="/diagnostics" className="btn btn-ghost btn-sm"><ArrowLeft size={15} />All symptoms</Link>
          <FavoriteButton size="sm" type="symptom" refId={symptom.id} title={symptom.title} subtitle={symptom.system} path={`/diagnostics/${symptom.id}`} />
        </div>
        <div>
          <div className="section-title">Guided diagnostic · {symptom.system}</div>
          <h1 className="mt-4">{symptom.title}</h1>
          <p className="muted mt-4">{symptom.summary}</p>
        </div>
        <VehicleContext />

        {node.q ? (
          <div className="card question-card" aria-live="polite">
            <div className="small subtle strong">STEP {path.length}</div>
            <h2 className="mt-8" style={{ fontSize: 20 }}>{node.q}</h2>
            {node.help && <p className="muted mt-8">{node.help}</p>}
            {node.spec && <div className="spec-chip mt-12"><ClipboardList size={14} />{node.spec}</div>}
            <div className="row gap-12 mt-24 wrap">
              <button className="btn btn-lg answer yes" onClick={() => answer(true)}><CheckCircle2 size={19} />Yes</button>
              <button className="btn btn-lg answer no" onClick={() => answer(false)}><XCircle size={19} />No</button>
              {path.length > 1 && <button className="btn btn-ghost" onClick={back}><ArrowLeft size={16} />Back</button>}
            </div>
          </div>
        ) : (
          <div className={`card result-card ${SEVERITY[node.severity]?.tile || ''}`} aria-live="polite">
            <div className="row gap-12" style={{ alignItems: 'flex-start' }}>
              <span className={`icon-tile ${SEVERITY[node.severity]?.tile || ''}`}><Flag size={20} /></span>
              <div className="grow">
                <div className="section-title">Likely cause</div>
                <h2 className="mt-4" style={{ fontSize: 20 }}>{node.result}</h2>
                <div className="mt-8"><SeverityBadge level={node.severity} /></div>
              </div>
            </div>
            <p className="mt-12">{node.detail}</p>
            {(node.procedures?.length > 0 || node.dtcs?.length > 0) && (
              <div className="stack gap-6 mt-16">
                {node.procedures?.map((p) => PROCEDURE_INDEX[p] && (
                  <Link key={p} to={`/repair/${p}`} className="related-card"><Wrench size={16} /><span className="grow"><span className="strong small">{PROCEDURE_INDEX[p].title}</span><span className="xs subtle" style={{ display: 'block' }}>Repair procedure · {PROCEDURE_INDEX[p].laborHours} hr</span></span><ChevronRight size={14} /></Link>
                ))}
                {node.dtcs?.map((c) => DTC_INDEX[c] && (
                  <Link key={c} to={`/dtc/${c}`} className="related-card"><ScanLine size={16} /><span className="grow"><span className="strong small">{c} — {DTC_INDEX[c].title}</span><span className="xs subtle" style={{ display: 'block' }}>Related DTC</span></span><ChevronRight size={14} /></Link>
                ))}
              </div>
            )}
            <div className="row gap-8 mt-24">
              <button className="btn btn-secondary" onClick={back}><ArrowLeft size={16} />Back</button>
              <button className="btn btn-ghost" onClick={restart}><RotateCcw size={16} />Start over</button>
            </div>
          </div>
        )}
      </div>

      <aside className="card card-pad stack gap-12 diag-trail" aria-label="Diagnostic path">
        <div className="row between"><div className="section-title">Your path</div><span className="xs subtle">≤ {questionCount} questions</span></div>
        <ol className="trail">
          {path.map((p, i) => {
            const n = symptom.nodes[p.node]
            return (
              <li key={i} className={p.answer === undefined ? 'cur' : ''}>
                <span className={`trail-dot ${p.answer === true ? 'yes' : p.answer === false ? 'no' : ''}`} />
                <div>
                  <div className="small">{n.q || n.result}</div>
                  {p.answer !== undefined && <div className={`xs strong ${p.answer ? 'text-success' : 'text-danger'}`}>{p.answer ? 'Yes' : 'No'}</div>}
                </div>
              </li>
            )
          })}
        </ol>
        {path.length > 1 && <button className="btn btn-ghost btn-sm" onClick={restart}><RotateCcw size={14} />Restart</button>}
      </aside>
    </div>
  )
}
