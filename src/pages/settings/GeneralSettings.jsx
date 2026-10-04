import { useCallback, useEffect, useState } from 'react'
import { Sun, Moon, Monitor, PanelLeftClose, RotateCw, History, RotateCcw } from 'lucide-react'
import { SectionHead } from './kit'
import { ConfirmDialog } from '../../components/ui/Modal'
import { Switch, EmptyState, SkeletonList } from '../../components/ui'
import { useApp, toast } from '../../store/useApp'
import { useShop } from '../../store/useShop'
import { api } from '../../lib/api'

export function Appearance() {
  const theme = useApp((s) => s.theme)
  const setTheme = useApp((s) => s.setTheme)
  const collapsed = useApp((s) => s.sidebarCollapsed)
  const toggleSidebar = useApp((s) => s.toggleSidebar)
  return (
    <div className="stack gap-16">
      <SectionHead title="Appearance" description="Personal preferences for this browser." />
      <div className="card card-pad stack gap-16">
        <div className="setting-row">
          <div><div className="strong">Theme</div><div className="small muted">Dark mode is easier on the eyes in dim bays.</div></div>
          <div className="theme-picker" role="radiogroup" aria-label="Theme">
            {[['light', Sun, 'Light'], ['dark', Moon, 'Dark'], ['system', Monitor, 'System']].map(([v, I, l]) => (
              <button key={v} role="radio" aria-checked={theme === v} className={`theme-opt${theme === v ? ' on' : ''}`} onClick={() => { setTheme(v); toast.success('Settings updated', `Theme: ${l}`) }}>
                <span className={`theme-swatch ${v}`} /><span className="row gap-6 small strong"><I size={14} />{l}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="divider" />
        <div className="setting-row">
          <div><div className="strong row gap-6"><PanelLeftClose size={16} />Collapsed sidebar</div><div className="small muted">Show icons only. Shortcut: Alt + B.</div></div>
          <Switch checked={collapsed} onChange={toggleSidebar} label="Collapsed sidebar" />
        </div>
      </div>
    </div>
  )
}

const ENTITY_LABELS = {
  shop_details: 'Shop details', license: 'License', service_writer: 'Service writer', technician: 'Technician', labor_rate: 'Labor rate',
  tax_rate: 'Tax rate', markup: 'Markup', shop_fee: 'Shop fee', display_options: 'Display', document_numbering: 'Numbering',
  document_preferences: 'Document preferences', printing: 'Printing', document_options: 'Document options', estimate_settings: 'Estimate settings', header_footer: 'Header & footer',
}

export function AuditLog() {
  const [rows, setRows] = useState(null)
  const [entity, setEntity] = useState('')
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setRows(null); setError('')
    try { setRows(await api(`/settings/audit?limit=300${entity ? `&entity=${entity}` : ''}`)) } catch (e) { setError(e.message); setRows([]) }
  }, [entity])
  useEffect(() => { load() }, [load])

  return (
    <div className="stack gap-16">
      <SectionHead title="Audit Log" description="Every change to shop, staff, financial and document settings is recorded with who made it and when."
        actions={<button className="btn btn-secondary" onClick={load}><RotateCw size={16} />Refresh</button>} />
      <select className="select" style={{ width: 'auto', alignSelf: 'flex-start' }} value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Filter by setting">
        <option value="">All settings</option>
        {Object.entries(ENTITY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {error && <div className="callout callout-danger"><History size={18} /><div>{error}</div></div>}
      {rows === null ? <div className="card card-pad"><SkeletonList rows={6} /></div> : rows.length === 0 ? (
        <div className="card"><EmptyState icon={History} title="No changes recorded">Changes to settings will appear here.</EmptyState></div>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 620 }}>
          <table className="table">
            <thead><tr><th>Date</th><th>User</th><th>Setting</th><th>Change</th><th>Old</th><th>New</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td className="small nowrap">{new Date(r.at).toLocaleString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                <td className="small"><div className="strong">{r.user}</div><div className="xs subtle">{r.role}</div></td>
                <td className="small">{ENTITY_LABELS[r.entity] || r.entity}{r.entityId && r.entityId !== '1' ? <span className="xs subtle"> #{r.entityId}</span> : ''}</td>
                <td className="small"><span className={`badge ${r.action === 'create' ? 'badge-success' : r.action === 'delete' ? 'badge-danger' : 'badge-info'}`}>{r.action}</span> {r.field}</td>
                <td className="small muted audit-val">{r.old || '—'}</td>
                <td className="small strong audit-val">{r.new || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function DataSettings() {
  const clearHistory = useApp((s) => s.clearHistory)
  const resetCustomers = useShop((s) => s.resetDemoCustomers)
  const can = useApp((s) => s.can)
  const [confirm, setConfirm] = useState(null)
  return (
    <div className="stack gap-16">
      <SectionHead title="Local Data" description="Data kept in this browser only. Shop settings and documents are stored on the server." />
      <div className="card card-pad stack gap-12">
        <div className="setting-row"><div><div className="strong">Clear search history</div><div className="small muted">Removes all recent searches on this device.</div></div><button className="btn btn-secondary" onClick={() => setConfirm('history')}>Clear</button></div>
        <div className="divider" />
        <div className="setting-row"><div><div className="strong">Reset demo customers</div><div className="small muted">Restores the sample customer list in this browser.</div></div><button className="btn btn-danger" onClick={() => (can('settings.edit') ? setConfirm('reset') : toast.error('Permission required', 'Only admins can reset demo data.'))}><RotateCcw size={16} />Reset</button></div>
      </div>
      <ConfirmDialog open={confirm === 'history'} onClose={() => setConfirm(null)} title="Clear search history?" body="This cannot be undone." confirmLabel="Clear" danger onConfirm={() => { clearHistory(); toast.success('History cleared') }} />
      <ConfirmDialog open={confirm === 'reset'} onClose={() => setConfirm(null)} title="Reset demo customers?" body="Customers in this browser will be replaced with the sample list." confirmLabel="Reset" danger onConfirm={() => { resetCustomers(); toast.success('Demo customers restored') }} />
    </div>
  )
}
