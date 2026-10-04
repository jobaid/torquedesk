import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, SearchX, X } from 'lucide-react'
import { useApp } from '../store/useApp'
import { search, groupResults, RESULT_TYPES, SUGGESTIONS } from '../lib/search'
import { TypeIcon } from '../components/search/TypeIcon'
import { EmptyState, SkeletonList, useLoading, SeverityBadge } from '../components/ui'
import { VehicleContext } from '../components/vehicle/RequireVehicle'

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const type = params.get('type') || 'all'
  const system = params.get('system') || 'all'
  const [draft, setDraft] = useState(q)
  const addHistory = useApp((s) => s.addHistory)
  const loading = useLoading(q, 320)

  useEffect(() => {
    setDraft(q)
    if (q) addHistory({ query: q, title: q, path: `/search?q=${encodeURIComponent(q)}` })
  }, [q, addHistory])

  const all = useMemo(() => search(q), [q])
  const groups = groupResults(all)
  const systems = [...new Set(all.map((r) => r.system).filter(Boolean))].sort()
  const filtered = all.filter((r) => (type === 'all' || r.type === type) && (system === 'all' || r.system === system))
  const filteredGroups = groupResults(filtered)

  const setParam = (k, v) => {
    const next = new URLSearchParams(params)
    if (!v || v === 'all') next.delete(k); else next.set(k, v)
    setParams(next)
  }
  const submit = (e) => {
    e.preventDefault()
    const next = new URLSearchParams()
    if (draft.trim()) next.set('q', draft.trim())
    setParams(next)
  }
  const record = (r) => addHistory({ query: q, title: r.title, type: r.type, path: r.path })

  return (
    <div className="page">
      <form className="search-bar" onSubmit={submit} role="search">
        <Search size={20} className="subtle" />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search vehicle, DTC, component, repair procedure…" aria-label="Search" autoFocus={!q} />
        {draft && <button type="button" className="icon-btn sm" onClick={() => setDraft('')} aria-label="Clear"><X size={16} /></button>}
        <button className="btn btn-primary" type="submit">Search</button>
      </form>
      <div className="mt-12"><VehicleContext /></div>

      {!q ? (
        <div className="card mt-16">
          <EmptyState icon={Search} title="Search everything" action={<div className="row gap-6 wrap" style={{ justifyContent: 'center' }}>{SUGGESTIONS.map((s) => <Link key={s} className="chip" to={`/search?q=${encodeURIComponent(s)}`}>{s}</Link>)}</div>}>
            Procedures, DTCs, wiring diagrams, components, specifications and bulletins — in one place.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="row between wrap gap-12 mt-24">
            <h2>Search results for “{q}”</h2>
            {!loading && <span className="muted small">{filtered.length} of {all.length} results</span>}
          </div>

          <div className="row gap-8 wrap mt-12" role="group" aria-label="Filter by type">
            <button className="chip" aria-pressed={type === 'all'} onClick={() => setParam('type', 'all')}>All <span className="count">{all.length}</span></button>
            {Object.entries(RESULT_TYPES).filter(([k]) => groups[k]).map(([k, t]) => (
              <button key={k} className="chip" aria-pressed={type === k} onClick={() => setParam('type', k)}>{t.label} <span className="count">{groups[k].length}</span></button>
            ))}
            {systems.length > 1 && (
              <select className="select" style={{ width: 'auto', height: 32, borderRadius: 99, fontSize: 13 }} value={system} onChange={(e) => setParam('system', e.target.value)} aria-label="Filter by system">
                <option value="all">All systems</option>
                {systems.map((s) => <option key={s}>{s}</option>)}
              </select>
            )}
          </div>

          <div className="mt-16">
            {loading ? (
              <div className="card card-pad"><SkeletonList rows={6} /></div>
            ) : filtered.length === 0 ? (
              <div className="card">
                <EmptyState icon={SearchX} title="No results found">
                  Try a different keyword or select another vehicle. You can search by DTC (P0300), part (alternator), or symptom (overheating).
                </EmptyState>
              </div>
            ) : (
              <div className="stack gap-24">
                {Object.entries(RESULT_TYPES).filter(([k]) => filteredGroups[k]).map(([k, t]) => (
                  <section key={k} className="stack gap-8" aria-label={t.label}>
                    <div className="row gap-8">
                      <h3>{t.label}</h3>
                      <span className="badge">{filteredGroups[k].length} {filteredGroups[k].length === 1 ? 'result' : 'results'}</span>
                    </div>
                    <div className="card" style={{ padding: 6 }}>
                      {filteredGroups[k].slice(0, type === 'all' ? 6 : undefined).map((r) => (
                        <Link key={r.id} to={r.path} className="list-row" onClick={() => record(r)}>
                          <TypeIcon type={r.type} />
                          <span className="grow" style={{ minWidth: 0 }}>
                            <div className="strong"><Highlight text={r.title} q={q} /></div>
                            <div className="small muted clamp-1">{r.subtitle}</div>
                          </span>
                          {r.severity && <SeverityBadge level={r.severity} />}
                          {r.system && <span className="badge desktop-only">{r.system}</span>}
                        </Link>
                      ))}
                      {type === 'all' && filteredGroups[k].length > 6 && (
                        <button className="btn btn-ghost btn-sm" style={{ margin: 6 }} onClick={() => setParam('type', k)}>Show all {filteredGroups[k].length} {t.label.toLowerCase()}</button>
                      )}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function Highlight({ text, q }) {
  const terms = (q || '').trim().split(/\s+/).filter((t) => t.length > 1).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!terms.length) return text
  const parts = text.split(new RegExp(`(${terms.join('|')})`, 'ig'))
  return parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))
}
