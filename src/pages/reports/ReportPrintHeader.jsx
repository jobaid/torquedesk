import { useSettings } from '../../store/useSettings'
import { toDateStr } from './common'

/**
 * Renders a document-style header that only appears when printing a report
 * (hidden on screen via the .report-print-header CSS, shown via @media print).
 * Includes shop name/contact, report title, applied date range, and the
 * timestamp of print, so a printed PDF reads like a formal report.
 */
export default function ReportPrintHeader({ title, filters, extra }) {
  const shop = useSettings((s) => s.data?.shop) || {}
  const addr = [shop.street, shop.city && [shop.city, shop.state, shop.zip].filter(Boolean).join(', ')].filter(Boolean).join(' · ')
  const now = new Date().toLocaleString()
  const from = filters?.from ? toDateStr(filters.from) : null
  const to = filters?.to ? toDateStr(filters.to) : null
  const range = from && to ? (from === to ? from : `${from} → ${to}`) : 'All dates'
  return (
    <div className="report-print-header">
      <div className="rph-top">
        <div className="rph-shop">{shop.shopName || 'TorqueDesk'}</div>
        <div className="rph-contact">
          {addr && <div>{addr}</div>}
          {shop.phone && <div>{shop.phone}</div>}
          {shop.email && <div>{shop.email}</div>}
        </div>
      </div>
      <div className="rph-title">{title}</div>
      <div className="rph-meta">
        <div><strong>Period:</strong> {range}</div>
        {extra && <div>{extra}</div>}
        <div><strong>Generated:</strong> {now}</div>
      </div>
    </div>
  )
}
