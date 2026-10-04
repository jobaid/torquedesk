import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ScanLine, Search, FileText, ListChecks, AlertCircle, Cpu, Wrench, Zap, Megaphone, ChevronRight, Activity, SearchX, Check } from 'lucide-react'
import { DTCS, DTC_INDEX, explainCode, normalizeDtc } from '../data/dtcs'
import { PROCEDURE_INDEX } from '../data/procedures'
import { COMPONENT_INDEX } from '../data/components'
import { DIAGRAM_INDEX } from '../data/wiring'
import { TSBS } from '../data/tsbs'
import { useApp } from '../store/useApp'
import { EmptyState, SeverityBadge, SkeletonCard, useLoading, FavoriteButton, SEVERITY } from '../components/ui'
import { VehicleContext } from '../components/vehicle/RequireVehicle'

export default function DtcPage() {
  const { code: raw } = useParams()
  const code = normalizeDtc(raw)
  const [input, setInput] = useState(code || '')
  const [err, setErr] = useState('')
  const navigate = useNavigate()
  useEffect(() => { setInput(code || '') }, [code])

  const submit = (e) => {
    e.preventDefault()
    const c = normalizeDtc(input)
    if (!c) { setErr('Enter a code, e.g. P0300.'); return }
    if (!/^[PBCU][0-9A-F]{4}$/.test(c)) { setErr('Codes look like P0300: a letter (P, B, C, U) followed by 4 characters.'); return }
    setErr('')
    navigate(`/dtc/${c}`)
  }

  return (
    <div className="page">
      <form className="card card-pad dtc-search" onSubmit={submit} noValidate role="search">
        <label htmlFor="dtc-in" className="h-label"><ScanLine size={18} />Enter DTC</label>
        <div className="row gap-8 wrap">
          <input
            id="dtc-in"
            className={`input input-lg mono grow${err ? ' invalid' : ''}`}
            style={{ letterSpacing: '0.06em', minWidth: 200 }}
            value={input}
            onChange={(e) => { setInput(e.target.value.toUpperCase()); setErr('') }}
            placeholder="P0300"
            maxLength={8}
            autoComplete="off"
            aria-invalid={!!err}
            aria-describedby={err ? 'dtc-err' : undefined}
            autoFocus={!code}
          />
          <button className="btn btn-primary btn-lg" type="submit"><Search size={18} />Search</button>
        </div>
        {err && <span id="dtc-err" className="field-error mt-8" role="alert"><AlertCircle size={13} />{err}</span>}
        <div className="mt-12"><VehicleContext /></div>
      </form>

      <div className="mt-24">
        {code ? <DtcDetail code={code} key={code} /> : <DtcBrowse />}
      </div>
    </div>
  )
}

function DtcBrowse() {
  const [sys, setSys] = useState('all')
  const [sev, setSev] = useState('all')
  const systems = [...new Set(DTCS.map((d) => d.system))].sort()
  const list = DTCS.filter((d) => (sys === 'all' || d.system === sys) && (sev === 'all' || d.severity === sev))
  return (
    <div className="stack gap-12">
      <div className="row between wrap gap-12">
        <h2>Code library <span className="badge">{list.length}</span></h2>
        <div className="row gap-8 wrap">
          <select className="select" style={{ width: 'auto' }} value={sys} onChange={(e) => setSys(e.target.value)} aria-label="Filter by system">
            <option value="all">All systems</option>{systems.map((s) => <option key={s}>{s}</option>)}
          </select>
          <div className="segmented" role="group" aria-label="Filter by severity">
            {['all', 'high', 'medium', 'low'].map((s) => <button key={s} aria-pressed={sev === s} onClick={() => setSev(s)}>{s === 'all' ? 'All' : SEVERITY[s].short}</button>)}
          </div>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Code</th><th>Description</th><th className="desktop-only">System</th><th>Severity</th></tr></thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.code} className="clickable-row">
                <td><Link to={`/dtc/${d.code}`} className="code-pill">{d.code}</Link></td>
                <td><Link to={`/dtc/${d.code}`} style={{ color: 'inherit' }}>{d.title}</Link></td>
                <td className="desktop-only muted">{d.system}</td>
                <td><SeverityBadge level={d.severity} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DtcDetail({ code }) {
  const dtc = DTC_INDEX[code]
  const loading = useLoading(code, 320)
  const addHistory = useApp((s) => s.addHistory)
  const [done, setDone] = useState(() => new Set())
  const tsbs = useMemo(() => TSBS.filter((t) => t.dtcs.includes(code)), [code])

  useEffect(() => { addHistory({ query: code, title: dtc ? `${code} — ${dtc.title}` : code, type: 'dtc', path: `/dtc/${code}` }) }, [code, dtc, addHistory])

  if (loading) return <div className="stack gap-16"><SkeletonCard lines={2} /><div className="grid-2"><SkeletonCard /><SkeletonCard /></div></div>

  if (!dtc) {
    const info = explainCode(code)
    return (
      <div className="card">
        <EmptyState icon={SearchX} title={`${code} isn't in the library yet`} action={<Link to="/dtc" className="btn btn-secondary">Browse code library</Link>}>
          {info ? `It's a ${info.type.toLowerCase()} ${info.system.toLowerCase()} code${info.subsystem ? ` in the ${info.subsystem.toLowerCase()} group` : ''}. Check the code with your scan tool or try a related code.` : 'This does not look like a valid DTC format.'}
        </EmptyState>
      </div>
    )
  }

  const toggle = (i) => setDone((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })

  return (
    <div className="stack gap-16">
      <div className={`card card-pad dtc-head sev-${dtc.severity}`}>
        <div className="row between wrap gap-12" style={{ alignItems: 'flex-start' }}>
          <div className="stack gap-8">
            <div className="row gap-12 wrap">
              <span className="dtc-code">{dtc.code}</span>
              <SeverityBadge level={dtc.severity} />
            </div>
            <h1 style={{ fontSize: 22 }}>{dtc.title}</h1>
            <div className="small muted">System: {dtc.system}</div>
          </div>
          <FavoriteButton type="dtc" refId={dtc.code} title={`${dtc.code} — ${dtc.title}`} subtitle={dtc.system} path={`/dtc/${dtc.code}`} />
        </div>
        {dtc.severity === 'high' && (
          <div className="callout callout-danger mt-16"><AlertCircle size={18} /><div><strong>Drive with caution.</strong> This condition can damage the engine or catalytic converter, or affect safety. Diagnose promptly.</div></div>
        )}
      </div>

      <div className="dtc-grid">
        <div className="stack gap-16">
          <Card icon={FileText} title="Description"><p>{dtc.description}</p>
            {dtc.symptoms.length > 0 && <><div className="section-title mt-16">Common symptoms</div><div className="row gap-6 wrap mt-8">{dtc.symptoms.map((s) => <span key={s} className="badge">{s}</span>)}</div></>}
          </Card>
          <Card icon={AlertCircle} title="Possible Causes">
            <ol className="cause-list">{dtc.causes.map((c, i) => <li key={c}><span className="cause-rank">{i + 1}</span>{c}</li>)}</ol>
            <p className="xs subtle mt-8">Listed from most to least likely.</p>
          </Card>
          <Card icon={ListChecks} title="Diagnostic Procedure" right={<span className="small muted num">{done.size}/{dtc.steps.length}</span>}>
            <ol className="steps compact">
              {dtc.steps.map((s, i) => (
                <li key={i} className={`step${done.has(i) ? ' done' : ''}`}>
                  <button className="step-num" onClick={() => toggle(i)} aria-pressed={done.has(i)} aria-label={`Mark step ${i + 1} done`}>{done.has(i) ? <Check size={16} /> : String(i + 1).padStart(2, '0')}</button>
                  <div className="step-body">
                    <h3>{s.title}</h3>
                    <p>{s.body}</p>
                    {s.spec && <span className="spec-chip mt-8">{s.spec}</span>}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="stack gap-16">
          <Card icon={Cpu} title="Related Components">
            <LinkList items={dtc.components.filter((c) => COMPONENT_INDEX[c]).map((c) => ({ to: `/components/${c}`, label: COMPONENT_INDEX[c].name, sub: COMPONENT_INDEX[c].location }))} empty="No related components." />
          </Card>
          <Card icon={Wrench} title="Related Repair Procedures">
            <LinkList items={dtc.procedures.filter((p) => PROCEDURE_INDEX[p]).map((p) => ({ to: `/repair/${p}`, label: PROCEDURE_INDEX[p].title, sub: `${PROCEDURE_INDEX[p].laborHours} hr · ${PROCEDURE_INDEX[p].difficulty}` }))} empty="No related procedures." />
          </Card>
          <Card icon={Zap} title="Related Wiring Diagrams">
            <LinkList items={dtc.wiring.filter((w) => DIAGRAM_INDEX[w]).map((w) => ({ to: `/wiring/${w}`, label: DIAGRAM_INDEX[w].title, sub: DIAGRAM_INDEX[w].description }))} empty="No related wiring diagrams." />
          </Card>
          <Card icon={Megaphone} title="Technical Bulletins">
            <LinkList items={tsbs.map((t) => ({ to: `/bulletins/${t.id}`, label: `${t.number}: ${t.title}`, sub: t.type }))} empty="No bulletins reference this code." />
          </Card>
          <Link to="/diagnostics" className="card card-clickable card-pad row gap-12">
            <span className="icon-tile info"><Activity size={18} /></span>
            <span className="grow"><span className="strong">Symptom-based diagnostics</span><span className="xs subtle" style={{ display: 'block' }}>Guided yes/no trees</span></span>
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  )
}

function Card({ icon: Icon, title, children, right }) {
  return (
    <section className="card">
      <div className="card-header"><h3><Icon size={17} className="subtle" />{title}</h3>{right}</div>
      <div className="card-body">{children}</div>
    </section>
  )
}

function LinkList({ items, empty }) {
  if (!items.length) return <p className="small muted">{empty}</p>
  return (
    <div className="stack gap-4" style={{ margin: '-8px -10px' }}>
      {items.map((i) => (
        <Link key={i.to} to={i.to} className="list-row">
          <span className="grow" style={{ minWidth: 0 }}><div className="strong small">{i.label}</div>{i.sub && <div className="xs subtle clamp-1">{i.sub}</div>}</span>
          <ChevronRight size={14} className="subtle" />
        </Link>
      ))}
    </div>
  )
}
