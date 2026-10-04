import { PROCEDURES, GROUP_INDEX } from '../data/procedures'
import { DTCS, normalizeDtc } from '../data/dtcs'
import { COMPONENTS } from '../data/components'
import { DIAGRAMS } from '../data/wiring'
import { SPECS } from '../data/specs'
import { TSBS } from '../data/tsbs'
import { SYMPTOMS } from '../data/symptoms'

export const RESULT_TYPES = {
  procedure: { label: 'Repair Procedures', singular: 'Repair Procedure' },
  dtc: { label: 'DTCs', singular: 'DTC' },
  component: { label: 'Components', singular: 'Component' },
  wiring: { label: 'Wiring Diagrams', singular: 'Wiring Diagram' },
  spec: { label: 'Specifications', singular: 'Specification' },
  tsb: { label: 'Technical Bulletins', singular: 'Bulletin' },
  symptom: { label: 'Diagnostics', singular: 'Symptom' },
}

function build() {
  const docs = []
  for (const p of PROCEDURES) {
    docs.push({ type: 'procedure', id: p.id, title: p.title, subtitle: `${GROUP_INDEX[p.group]?.categoryLabel} › ${GROUP_INDEX[p.group]?.label}`, system: p.system, path: `/repair/${p.id}`, text: [p.title, p.overview, p.system, ...p.keywords, ...p.parts.map((x) => x.name)].join(' ') })
  }
  for (const d of DTCS) {
    docs.push({ type: 'dtc', id: d.code, title: `${d.code} — ${d.title}`, subtitle: d.system, system: d.system, path: `/dtc/${d.code}`, text: [d.code, d.title, d.system, d.description, ...d.causes, ...d.symptoms].join(' '), severity: d.severity })
  }
  for (const c of COMPONENTS) {
    docs.push({ type: 'component', id: c.id, title: c.name, subtitle: c.location, system: c.system, path: `/components/${c.id}`, text: [c.name, c.system, c.function, c.location].join(' ') })
  }
  for (const w of DIAGRAMS) {
    docs.push({ type: 'wiring', id: w.id, title: `${w.title} Wiring Diagram`, subtitle: w.description, system: w.system, path: `/wiring/${w.id}`, text: [w.title, w.system, w.description, ...w.components.map((c) => c.label)].join(' ') })
  }
  for (const s of SPECS) {
    docs.push({ type: 'spec', id: s.id, title: s.item, subtitle: `${s.value} ${s.unit}${s.note ? ` • ${s.note}` : ''}`, system: s.category, path: `/specifications?q=${encodeURIComponent(s.item)}`, text: [s.item, s.category, s.value, s.note].join(' ') })
  }
  for (const t of TSBS) {
    docs.push({ type: 'tsb', id: t.id, title: `${t.number}: ${t.title}`, subtitle: t.summary, system: t.system, path: `/bulletins/${t.id}`, text: [t.number, t.title, t.system, t.summary, ...t.dtcs].join(' ') })
  }
  for (const s of SYMPTOMS) {
    docs.push({ type: 'symptom', id: s.id, title: s.title, subtitle: s.summary, system: s.system, path: `/diagnostics/${s.id}`, text: [s.title, s.summary, s.system].join(' ') })
  }
  return docs.map((d) => ({ ...d, _title: d.title.toLowerCase(), _text: d.text.toLowerCase() }))
}

const INDEX = build()

export function search(query, { limit } = {}) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return []
  const terms = q.split(/\s+/).filter(Boolean)
  const code = normalizeDtc(q)
  const scored = []
  for (const doc of INDEX) {
    let score = 0
    let matchedAll = true
    for (const t of terms) {
      const inTitle = doc._title.includes(t)
      const inText = doc._text.includes(t)
      if (!inTitle && !inText) { matchedAll = false; break }
      score += inTitle ? 10 : 3
      if (doc._title.startsWith(t)) score += 6
    }
    if (!matchedAll) continue
    if (doc.type === 'dtc' && doc.id === code) score += 100
    if (doc._title === q) score += 30
    scored.push({ ...doc, score })
  }
  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  return limit ? scored.slice(0, limit) : scored
}

export function groupResults(results) {
  const groups = {}
  for (const r of results) (groups[r.type] ||= []).push(r)
  return groups
}

export const SUGGESTIONS = ['P0300', 'Brake pads', 'Alternator', 'Window regulator', 'Thermostat', 'Torque specs', 'Oxygen sensor', 'P0420']
