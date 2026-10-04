import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Car, Clock, CornerDownLeft, Search, X } from 'lucide-react'
import { useApp, useUI } from '../../store/useApp'
import { search, RESULT_TYPES, SUGGESTIONS } from '../../lib/search'
import { TypeIcon } from './TypeIcon'
import { normalizeDtc } from '../../data/dtcs'

export default function CommandPalette() {
  const open = useUI((s) => s.paletteOpen)
  const close = useUI((s) => s.closePalette)
  if (!open) return null
  return createPortal(<Palette close={close} />, document.body)
}

function Palette({ close }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const navigate = useNavigate()
  const history = useApp((s) => s.searchHistory)
  const addHistory = useApp((s) => s.addHistory)
  const openVehiclePicker = useUI((s) => s.openVehiclePicker)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setActive(0) }, [q])

  const results = useMemo(() => search(q, { limit: 12 }), [q])

  // Flat list of selectable entries
  const entries = useMemo(() => {
    if (!q.trim()) {
      const recent = history.slice(0, 5).map((h) => ({ kind: 'recent', key: h.id, title: h.title || h.query, subtitle: h.vehicleLabel, path: h.path, query: h.query, type: h.type }))
      const sugg = SUGGESTIONS.map((s) => ({ kind: 'suggest', key: `s-${s}`, title: s, path: `/search?q=${encodeURIComponent(s)}`, query: s }))
      return [{ kind: 'action', key: 'veh', title: 'Select or change vehicle', icon: Car, run: () => openVehiclePicker() }, ...recent, ...sugg]
    }
    const list = results.map((r) => ({ kind: 'result', key: `${r.type}-${r.id}`, ...r, query: q }))
    const code = normalizeDtc(q)
    if (/^[PBCU][0-9A-F]{4}$/.test(code) && !results.some((r) => r.type === 'dtc' && r.id === code)) {
      list.unshift({ kind: 'result', key: 'dtc-lookup', type: 'dtc', title: `Look up DTC ${code}`, subtitle: 'Decode code structure', path: `/dtc/${code}`, query: code })
    }
    list.push({ kind: 'all', key: 'all', title: `See all results for “${q.trim()}”`, path: `/search?q=${encodeURIComponent(q.trim())}`, query: q.trim() })
    return list
  }, [q, results, history, openVehiclePicker])

  const choose = (e) => {
    if (!e) return
    close()
    if (e.run) return e.run()
    if (e.kind === 'result' || e.kind === 'recent') addHistory({ query: e.query, title: e.title, type: e.type, path: e.path })
    navigate(e.path)
  }

  const onKey = (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); close() }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive((a) => Math.min(a + 1, entries.length - 1)) }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (ev.key === 'Enter') { ev.preventDefault(); choose(entries[active]) }
  }

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  // Group rendering while keeping a flat index
  let idx = -1
  const row = (e) => {
    idx++
    const i = idx
    const Icon = e.icon
    return (
      <li key={e.key} role="option" aria-selected={active === i} id={`pal-${i}`}>
        <button
          data-idx={i}
          className="palette-row"
          onMouseMove={() => setActive(i)}
          onClick={() => choose(e)}
        >
          {e.kind === 'recent' ? <span className="icon-tile sm neutral"><Clock size={15} /></span>
            : e.kind === 'suggest' ? <span className="icon-tile sm neutral"><Search size={15} /></span>
            : e.kind === 'all' ? <span className="icon-tile sm"><ArrowRight size={15} /></span>
            : Icon ? <span className="icon-tile sm"><Icon size={15} /></span>
            : <TypeIcon type={e.type} size="sm" />}
          <span className="grow" style={{ minWidth: 0 }}>
            <div className="palette-title">{e.title}</div>
            {e.subtitle && <div className="palette-sub">{e.subtitle}</div>}
          </span>
          {e.type && e.kind === 'result' && <span className="badge">{RESULT_TYPES[e.type]?.singular}</span>}
          {active === i && <CornerDownLeft size={14} className="subtle" />}
        </button>
      </li>
    )
  }

  const empty = !q.trim()
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal palette" role="dialog" aria-modal="true" aria-label="Search">
        <div className="palette-input">
          <Search size={20} className="subtle" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search vehicle, DTC, component, repair procedure…"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={`pal-${active}`}
          />
          {q && <button className="icon-btn sm" onClick={() => setQ('')} aria-label="Clear search"><X size={16} /></button>}
          <span className="kbd">Esc</span>
        </div>
        <ul className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {empty ? (
            <>
              <li className="palette-group" role="presentation">Quick actions</li>
              {row(entries[0])}
              {history.length > 0 && <li className="palette-group" role="presentation">Recent searches</li>}
              {entries.filter((e) => e.kind === 'recent').map(row)}
              <li className="palette-group" role="presentation">Try searching</li>
              {entries.filter((e) => e.kind === 'suggest').map(row)}
            </>
          ) : entries.length === 1 ? (
            <>
              <li className="palette-empty" role="presentation">
                <Search size={22} />
                <div className="strong">No results for “{q}”</div>
                <div className="small muted">Try a different keyword, a DTC like P0300, or a component name.</div>
              </li>
              {row(entries[0])}
            </>
          ) : (
            entries.map(row)
          )}
        </ul>
        <div className="palette-foot">
          <span><span className="kbd">↑</span> <span className="kbd">↓</span> navigate</span>
          <span><span className="kbd">Enter</span> open</span>
          <span><span className="kbd">Esc</span> close</span>
        </div>
      </div>
    </div>
  )
}
