import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ZoomIn, ZoomOut, RotateCcw, Maximize, Minimize, Scan, Printer, Search, X, Cpu, ChevronRight, MousePointerClick } from 'lucide-react'
import { WIRE_COLORS } from '../../data/wiring'
import { COMPONENT_INDEX } from '../../data/components'
import { useApp, toast } from '../../store/useApp'

const W = 1000, H = 640
const MIN = 0.6, MAX = 6

const colorOf = (code) => {
  const [base, stripe] = code.split('/')
  return { base: WIRE_COLORS[base] || '#888', stripe: stripe ? WIRE_COLORS[stripe] : null }
}

export default function DiagramViewer({ diagram }) {
  const wrapRef = useRef(null)
  const svgRef = useRef(null)
  const [view, setView] = useState({ x: 0, y: 0, z: 1 })
  const [sel, setSel] = useState(null) // { type: 'comp'|'wire', id }
  const [query, setQuery] = useState('')
  const [full, setFull] = useState(false)
  const drag = useRef(null)
  const [dragging, setDragging] = useState(false)
  const can = useApp((s) => s.can)

  const vw = W / view.z, vh = H / view.z

  const clampView = useCallback((v) => {
    const z = Math.min(MAX, Math.max(MIN, v.z))
    const w = W / z, h = H / z
    const pad = 200
    return { z, x: Math.min(Math.max(v.x, -pad - Math.max(0, w - W)), W + pad - w), y: Math.min(Math.max(v.y, -pad - Math.max(0, h - H)), H + pad - h) }
  }, [])

  const zoomAt = useCallback((factor, cx = 0.5, cy = 0.5) => {
    setView((v) => {
      const z = Math.min(MAX, Math.max(MIN, v.z * factor))
      const w0 = W / v.z, h0 = H / v.z, w1 = W / z, h1 = H / z
      return clampView({ z, x: v.x + (w0 - w1) * cx, y: v.y + (h0 - h1) * cy })
    })
  }, [clampView])

  const fit = () => setView({ x: 0, y: 0, z: 1 })
  const reset = () => { fit(); setSel(null); setQuery('') }

  const centerOn = (c, z = 2.2) => {
    const w = W / z, h = H / z
    setView(clampView({ z, x: c.x + c.w / 2 - w / 2, y: c.y + c.h / 2 - h / 2 }))
  }

  // wheel zoom around the cursor
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e) => {
      e.preventDefault()
      const r = svg.getBoundingClientRect()
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === wrapRef.current)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await wrapRef.current.requestFullscreen()
    } catch { toast.error('Full screen unavailable', 'Your browser blocked full-screen mode.') }
  }

  const onPointerDown = (e) => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, view, moved: false }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    const r = svgRef.current.getBoundingClientRect()
    const scale = Math.max(vw / r.width, vh / r.height)
    const dx = (e.clientX - d.x) * scale, dy = (e.clientY - d.y) * scale
    if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true
    setView(clampView({ ...d.view, x: d.view.x - dx, y: d.view.y - dy }))
  }
  const onPointerUp = () => { setDragging(false); setTimeout(() => { drag.current = null }, 0) }
  const click = (s) => () => { if (!drag.current?.moved) setSel(s) }

  const onKey = (e) => {
    if (e.target.tagName === 'INPUT') return
    const step = 40 / view.z
    if (e.key === '+' || e.key === '=') zoomAt(1.25)
    else if (e.key === '-') zoomAt(0.8)
    else if (e.key === '0') fit()
    else if (e.key === 'ArrowLeft') setView((v) => clampView({ ...v, x: v.x - step }))
    else if (e.key === 'ArrowRight') setView((v) => clampView({ ...v, x: v.x + step }))
    else if (e.key === 'ArrowUp') setView((v) => clampView({ ...v, y: v.y - step }))
    else if (e.key === 'ArrowDown') setView((v) => clampView({ ...v, y: v.y + step }))
    else if (e.key === 'Escape') setSel(null)
    else return
    e.preventDefault()
  }

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return diagram.components.filter((c) => `${c.label} ${c.sub}`.toLowerCase().includes(q))
  }, [query, diagram])

  const findComp = (e) => {
    e.preventDefault()
    if (!matches.length) { toast.warning('Component not found', `No “${query}” on this diagram.`); return }
    setSel({ type: 'comp', id: matches[0].id })
    centerOn(matches[0])
  }

  const print = () => {
    if (!can('wiring.print')) { toast.error('Printing not permitted', 'Your role cannot print wiring diagrams.'); return }
    const svg = svgRef.current.cloneNode(true)
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
    const vars = ['--surface', '--surface-2', '--text', '--text-2', '--text-3', '--brand', '--border', '--warning-soft', '--brand-soft', '--wire-bg', '--wire-grid']
    const light = { '--surface': '#fff', '--surface-2': '#f8fafb', '--text': '#121a24', '--text-2': '#475467', '--text-3': '#6b7787', '--brand': '#0c7d78', '--border': '#e1e6ec', '--warning-soft': '#fdf3e2', '--brand-soft': '#e3f4f2', '--wire-bg': '#fff', '--wire-grid': '#eef1f4' }
    const w = window.open('', '_blank', 'width=1100,height=800')
    if (!w) { toast.error('Pop-up blocked', 'Allow pop-ups to print diagrams.'); return }
    w.document.write(`<!doctype html><title>${diagram.title}</title><style>:root{${vars.map((v) => `${v}:${light[v]}`).join(';')}}body{font-family:Inter,system-ui,sans-serif;margin:24px}svg{width:100%;height:auto;border:1px solid #ccc}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 12px;color:#555;font-size:12px}</style><h1>${diagram.title} — Sheet ${diagram.sheet}</h1><p>${diagram.description}</p>${svg.outerHTML}<script>setTimeout(()=>{print()},300)<${'/'}script>`)
    w.document.close()
  }

  const selComp = sel?.type === 'comp' ? diagram.components.find((c) => c.id === sel.id) : null
  const selWire = sel?.type === 'wire' ? diagram.wires.find((w) => w.id === sel.id) : null
  const isActiveWire = (w) => !sel || (selWire ? w.id === selWire.id : selComp ? w.from === selComp.id || w.to === selComp.id : true)
  const usedColors = [...new Set(diagram.wires.flatMap((w) => w.color.split('/')))]
  const compName = (id) => diagram.components.find((c) => c.id === id)?.label || id

  return (
    <div className={`viewer${full ? ' is-full' : ''}`} ref={wrapRef}>
      <div className="viewer-toolbar" role="toolbar" aria-label="Diagram controls">
        <div className="row gap-4">
          <button className="icon-btn" onClick={() => zoomAt(1.25)} aria-label="Zoom in" title="Zoom in (+)"><ZoomIn size={18} /></button>
          <button className="icon-btn" onClick={() => zoomAt(0.8)} aria-label="Zoom out" title="Zoom out (−)"><ZoomOut size={18} /></button>
          <span className="zoom-label num" aria-live="polite">{Math.round(view.z * 100)}%</span>
          <button className="icon-btn" onClick={fit} aria-label="Fit to screen" title="Fit to screen (0)"><Scan size={18} /></button>
          <button className="icon-btn" onClick={reset} aria-label="Reset view" title="Reset"><RotateCcw size={18} /></button>
          <button className="icon-btn" onClick={toggleFull} aria-label={full ? 'Exit full screen' : 'Full screen'} title="Full screen">{full ? <Minimize size={18} /> : <Maximize size={18} />}</button>
          <button className="icon-btn" onClick={print} aria-label="Print diagram" title="Print"><Printer size={18} /></button>
        </div>
        <form className="viewer-search" onSubmit={findComp} role="search">
          <Search size={15} className="subtle" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search component…" aria-label="Search component on diagram" list={`comp-${diagram.id}`} />
          <datalist id={`comp-${diagram.id}`}>{diagram.components.map((c) => <option key={c.id} value={c.label} />)}</datalist>
          {query && <button type="button" className="icon-btn sm" onClick={() => { setQuery(''); setSel(null) }} aria-label="Clear"><X size={14} /></button>}
          <button className="btn btn-primary btn-sm" type="submit">Find</button>
        </form>
      </div>

      <div className="viewer-body">
        <div className="viewer-canvas" tabIndex={0} onKeyDown={onKey} aria-label={`${diagram.title} wiring diagram. Use arrow keys to pan, plus and minus to zoom.`}>
          <svg
            ref={svgRef}
            viewBox={`${view.x} ${view.y} ${vw} ${vh}`}
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={(e) => { if (e.target === e.currentTarget && !drag.current?.moved) setSel(null) }}
            role="img"
            style={{ cursor: dragging ? 'grabbing' : 'grab' }}
          >
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="var(--wire-grid)" strokeWidth="1" /></pattern>
            </defs>
            <rect x={-400} y={-400} width={W + 800} height={H + 800} fill="var(--wire-bg)" onClick={click(null)} />
            <rect x={-400} y={-400} width={W + 800} height={H + 800} fill="url(#grid)" pointerEvents="none" />
            <rect x="0" y="0" width={W} height={H} fill="none" stroke="var(--border)" strokeDasharray="4 6" pointerEvents="none" />

            {diagram.wires.map((w) => {
              const { base, stripe } = colorOf(w.color)
              const pts = w.points.map((p) => p.join(',')).join(' ')
              const active = isActiveWire(w)
              const hl = selWire?.id === w.id || (selComp && active)
              let best = 0, mid = w.points[0]
              for (let i = 1; i < w.points.length; i++) {
                const [a, b] = [w.points[i - 1], w.points[i]]
                const len = Math.hypot(b[0] - a[0], b[1] - a[1])
                if (len > best) { best = len; mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }
              }
              const label = `${w.color} ${w.label}`
              return (
                <g key={w.id} opacity={active ? 1 : 0.18} className="wire" onClick={click({ type: 'wire', id: w.id })}>
                  <polyline points={pts} fill="none" stroke="transparent" strokeWidth="14" />
                  {hl && <polyline points={pts} fill="none" stroke="var(--brand)" strokeWidth="9" strokeOpacity="0.25" strokeLinejoin="round" />}
                  <polyline points={pts} fill="none" stroke={base} strokeWidth={hl ? 4.5 : 3} strokeLinejoin="round" />
                  {stripe && <polyline points={pts} fill="none" stroke={stripe} strokeWidth={hl ? 2 : 1.4} strokeDasharray="8 8" strokeLinejoin="round" />}
                  {[w.points[0], w.points[w.points.length - 1]].map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill={base} />)}
                  <g transform={`translate(${mid[0]},${mid[1]})`} pointerEvents="none">
                    <rect x={-label.length * 3.4 - 6} y="-9" width={label.length * 6.8 + 12} height="18" rx="4" fill="var(--surface)" stroke="var(--border)" />
                    <text textAnchor="middle" y="4" fontSize="10.5" fontFamily="var(--font-mono)" fill="var(--text-2)">{label}</text>
                  </g>
                </g>
              )
            })}

            {(diagram.splices || []).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="5" fill="var(--text)" pointerEvents="none" />)}

            {diagram.grounds.map(([x, y, label]) => (
              <g key={label} pointerEvents="none" stroke="var(--text-2)" strokeWidth="2.5">
                <line x1={x - 14} y1={y} x2={x + 14} y2={y} />
                <line x1={x - 9} y1={y + 6} x2={x + 9} y2={y + 6} />
                <line x1={x - 4} y1={y + 12} x2={x + 4} y2={y + 12} />
                <text x={x + 20} y={y + 9} fontSize="11" fill="var(--text-3)" stroke="none" fontWeight="600">{label}</text>
              </g>
            ))}

            {diagram.components.map((c) => {
              const selected = selComp?.id === c.id
              const hit = matches.some((m) => m.id === c.id)
              const dim = sel && !selected && !(selWire && (selWire.from === c.id || selWire.to === c.id)) && !(selComp && diagram.wires.some((w) => (w.from === selComp.id && w.to === c.id) || (w.to === selComp.id && w.from === c.id)))
              const stroke = selected ? 'var(--brand)' : hit ? 'var(--brand)' : 'var(--text-2)'
              const sw = selected || hit ? 3 : 1.8
              const round = c.kind === 'motor' && c.w === c.h
              const cx = c.x + c.w / 2, cy = c.y + c.h / 2
              return (
                <g key={c.id} className="comp" opacity={dim ? 0.35 : 1} onClick={click({ type: 'comp', id: c.id })} role="button" aria-label={c.label}>
                  {round ? (
                    <>
                      <circle cx={cx} cy={cy} r={c.w / 2} fill="var(--surface)" stroke={stroke} strokeWidth={sw} />
                      <text x={cx} y={cy + 9} textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--text-2)">M</text>
                      <text x={cx} y={c.y - 8} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--text)">{c.label}</text>
                    </>
                  ) : (
                    <>
                      <rect x={c.x} y={c.y} width={c.w} height={c.h} rx="8"
                        fill={c.kind === 'fuse' ? 'var(--warning-soft)' : c.kind === 'module' ? 'var(--surface-2)' : c.kind === 'battery' ? 'var(--brand-soft)' : 'var(--surface)'}
                        stroke={stroke} strokeWidth={sw} strokeDasharray={c.kind === 'module' ? '7 4' : undefined} />
                      <text x={cx} y={c.y + (c.h > 70 ? 28 : 26)} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--text)">{c.label}</text>
                      <text x={cx} y={c.y + (c.h > 70 ? 46 : 44)} textAnchor="middle" fontSize="10.5" fill="var(--text-3)" fontFamily="var(--font-mono)">{c.sub}</text>
                      {c.kind === 'battery' && <text x={cx} y={c.y + c.h - 14} textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--text-2)">+  −</text>}
                      {c.kind === 'motor' && <g><circle cx={cx} cy={c.y + c.h - 34} r="20" fill="none" stroke="var(--text-2)" strokeWidth="2" /><text x={cx} y={c.y + c.h - 28} textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--text-2)">G</text></g>}
                      {c.kind === 'relay' && <g stroke="var(--text-2)" strokeWidth="1.6" fill="none"><rect x={cx - 34} y={c.y + c.h - 30} width="22" height="14" /><path d={`M${cx + 6} ${c.y + c.h - 16} l18 -12 M${cx + 24} ${c.y + c.h - 16} h6`} /></g>}
                    </>
                  )}
                </g>
              )
            })}
          </svg>
          <div className="viewer-hint xs"><MousePointerClick size={13} />Drag to pan · scroll to zoom · click a wire or component</div>
        </div>

        <aside className="viewer-panel" aria-label="Diagram details">
          {selComp ? (
            <div className="stack gap-8">
              <div className="row between"><div className="section-title">Component</div><button className="icon-btn sm" onClick={() => setSel(null)} aria-label="Clear selection"><X size={14} /></button></div>
              <h3>{selComp.label}</h3>
              <div className="mono xs subtle">{selComp.sub}</div>
              <div className="section-title mt-8">Connected circuits</div>
              {diagram.wires.filter((w) => w.from === selComp.id || w.to === selComp.id).map((w) => (
                <button key={w.id} className="wire-row" onClick={() => setSel({ type: 'wire', id: w.id })}>
                  <WireSwatch code={w.color} /><span className="grow small">{w.label}</span><span className="xs subtle mono">{w.color}</span>
                </button>
              ))}
              {(selComp.ref || COMPONENT_INDEX[selComp.id]) && (
                <Link to={`/components/${selComp.ref || selComp.id}`} className="related-card mt-8"><Cpu size={16} /><span className="grow small strong">Component location & tests</span><ChevronRight size={14} /></Link>
              )}
            </div>
          ) : selWire ? (
            <div className="stack gap-8">
              <div className="row between"><div className="section-title">Circuit</div><button className="icon-btn sm" onClick={() => setSel(null)} aria-label="Clear selection"><X size={14} /></button></div>
              <div className="row gap-8"><WireSwatch code={selWire.color} big /><h3>{selWire.label}</h3></div>
              <dl className="kv small">
                <dt>Color</dt><dd className="mono">{selWire.color}</dd>
                <dt>Circuit</dt><dd className="mono">{selWire.circuit}</dd>
                <dt>Gauge</dt><dd>{selWire.gauge}</dd>
                <dt>From</dt><dd><button className="link-btn" onClick={() => setSel({ type: 'comp', id: selWire.from })}>{compName(selWire.from)}</button></dd>
                <dt>To</dt><dd>{diagram.components.some((c) => c.id === selWire.to) ? <button className="link-btn" onClick={() => setSel({ type: 'comp', id: selWire.to })}>{compName(selWire.to)}</button> : `Ground ${selWire.to}`}</dd>
              </dl>
            </div>
          ) : (
            <div className="stack gap-8">
              <div className="section-title">Components</div>
              {diagram.components.map((c) => (
                <button key={c.id} className="wire-row" onClick={() => { setSel({ type: 'comp', id: c.id }); centerOn(c, 1.6) }}>
                  <Cpu size={14} className="subtle" /><span className="grow small">{c.label}</span>
                </button>
              ))}
            </div>
          )}
          <div className="divider" style={{ margin: '14px 0' }} />
          <div className="section-title">Wire color legend</div>
          <div className="legend">
            {usedColors.map((c) => <span key={c} className="row gap-6 xs"><WireSwatch code={c} />{c}</span>)}
          </div>
        </aside>
      </div>
    </div>
  )
}

function WireSwatch({ code, big }) {
  const { base, stripe } = colorOf(code)
  return (
    <span className="swatch" style={{ width: big ? 28 : 20, background: stripe ? `repeating-linear-gradient(90deg, ${base} 0 6px, ${stripe} 6px 9px)` : base }} aria-hidden="true" />
  )
}
