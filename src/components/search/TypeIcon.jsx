import { Wrench, ScanLine, Cpu, Zap, ClipboardList, Megaphone, Stethoscope, FileText } from 'lucide-react'

const MAP = {
  procedure: [Wrench, ''],
  dtc: [ScanLine, 'warning'],
  component: [Cpu, 'neutral'],
  wiring: [Zap, 'info'],
  spec: [ClipboardList, 'success'],
  tsb: [Megaphone, 'danger'],
  symptom: [Stethoscope, 'info'],
  document: [FileText, ''],
}

export function TypeIcon({ type, size }) {
  const [Icon, tone] = MAP[type] || [FileText, 'neutral']
  return <span className={`icon-tile ${size || ''} ${tone}`}><Icon size={size === 'sm' ? 15 : 19} /></span>
}
