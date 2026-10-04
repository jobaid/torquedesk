import { Link } from 'react-router-dom'
import { ChevronRight, Cpu, ScanLine, Wrench, Zap } from 'lucide-react'
import { PROCEDURE_INDEX } from '../../data/procedures'
import { DTC_INDEX } from '../../data/dtcs'
import { DIAGRAM_INDEX } from '../../data/wiring'
import { COMPONENT_INDEX } from '../../data/components'

export default function RelatedLinks({ related, compact }) {
  const rows = [
    ...related.procedures.filter((x) => PROCEDURE_INDEX[x]).map((x) => ({ to: `/repair/${x}`, icon: Wrench, label: PROCEDURE_INDEX[x].title, kind: 'Procedure' })),
    ...related.dtcs.filter((x) => DTC_INDEX[x]).map((x) => ({ to: `/dtc/${x}`, icon: ScanLine, label: `${x} ${compact ? '' : `— ${DTC_INDEX[x].title}`}`, kind: 'DTC' })),
    ...related.wiring.filter((x) => DIAGRAM_INDEX[x]).map((x) => ({ to: `/wiring/${x}`, icon: Zap, label: DIAGRAM_INDEX[x].title, kind: 'Wiring' })),
    ...related.components.filter((x) => COMPONENT_INDEX[x]).map((x) => ({ to: `/components/${x}`, icon: Cpu, label: COMPONENT_INDEX[x].name, kind: 'Component' })),
  ]
  if (!rows.length) return <p className="muted small">No related information.</p>
  return (
    <div className={compact ? 'stack gap-4' : 'related-grid'}>
      {rows.map((r) => (
        <Link key={r.to} to={r.to} className={compact ? 'related-row' : 'related-card'}>
          <r.icon size={16} />
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="strong small">{r.label}</span>
            {!compact && <span className="xs subtle" style={{ display: 'block' }}>{r.kind}</span>}
          </span>
          <ChevronRight size={14} className="subtle" />
        </Link>
      ))}
    </div>
  )
}
