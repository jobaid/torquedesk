import { useEffect, useRef, useState } from 'react'
import { Download, Upload, HardDrive, RefreshCw, AlertTriangle, Plus, Trash2, Archive, Zap } from 'lucide-react'
import { SectionHead } from './kit'
import { useApp, toast } from '../../store/useApp'
import { ConfirmDialog } from '../../components/ui/Modal'

const fmtSize = (b) => (b > 1_000_000 ? `${(b / 1_048_576).toFixed(2)} MB` : b > 1000 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`)
const fmtDate = (ms) => new Date(ms).toLocaleString()

export function BackupSettings() {
  const token = useApp((s) => s.user?.token)
  const [backups, setBackups] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [restoreFile, setRestoreFile] = useState(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [summary, setSummary] = useState(null)
  const fileRef = useRef(null)

  const authHeaders = () => ({ Authorization: `Bearer ${token}` })

  const refresh = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/backup/list', { headers: authHeaders() })
      setBackups(res.ok ? await res.json() : [])
    } catch { setBackups([]) } finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  const createManual = async () => {
    setBusy('manual')
    try {
      const res = await fetch('/api/backup/manual', { method: 'POST', headers: authHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Backup failed')
      toast.success('Manual backup created', data.name)
      await refresh()
    } catch (e) { toast.error('Backup failed', e.message) } finally { setBusy('') }
  }

  const runAuto = async () => {
    setBusy('auto')
    try {
      const res = await fetch('/api/backup/auto/run', { method: 'POST', headers: authHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Backup failed')
      toast.success('Auto backup updated', 'The current auto backup was replaced.')
      await refresh()
    } catch (e) { toast.error('Backup failed', e.message) } finally { setBusy('') }
  }

  const download = async (b) => {
    const res = await fetch(`/api/backup/download/${b.kind}/${encodeURIComponent(b.name)}`, { headers: authHeaders() })
    if (!res.ok) { toast.error('Download failed'); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = b.name; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const askDelete = (b) => setConfirmDelete(b)
  const doDelete = async () => {
    const b = confirmDelete; setConfirmDelete(null)
    if (!b) return
    setBusy(b.name)
    try {
      const res = await fetch(`/api/backup/manual/${encodeURIComponent(b.name)}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error('Delete failed')
      toast.success('Backup deleted', b.name)
      await refresh()
    } catch (e) { toast.error('Delete failed', e.message) } finally { setBusy('') }
  }

  const pickFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setRestoreFile(f); setConfirmRestore(true)
  }

  const restore = async () => {
    if (!restoreFile) return
    setBusy('restore'); setConfirmRestore(false); setSummary(null)
    try {
      const buf = await restoreFile.arrayBuffer()
      const res = await fetch('/api/backup/restore', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/zip' }, body: buf })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Restore failed')
      setSummary(data.summary)
      toast.success('Restore complete')
      setRestoreFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await refresh()
    } catch (e) { toast.error('Restore failed', e.message) } finally { setBusy('') }
  }

  return (
    <div className="stack gap-16">
      <SectionHead title="Backup & Restore" description="Download your shop's data or restore from a previous backup. Only shop owners/admins can use this." />

      {/* Action row */}
      <div className="row gap-12 wrap">
        <button className="btn btn-primary" onClick={createManual} disabled={!!busy}><Plus size={16} />{busy === 'manual' ? 'Creating…' : 'Create backup'}</button>
        <button className="btn btn-secondary" onClick={runAuto} disabled={!!busy}><Zap size={16} />{busy === 'auto' ? 'Running…' : 'Replace auto backup now'}</button>
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <input ref={fileRef} type="file" accept=".zip,.json,application/zip,application/json" onChange={pickFile}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
          <button className="btn btn-ghost" disabled={!!busy}><Upload size={16} />Restore from file…</button>
        </div>
      </div>

      {/* Backup list */}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th style={{ width: 110 }}>Type</th>
              <th>File</th>
              <th style={{ width: 160 }}>Date</th>
              <th style={{ width: 110 }}>Size</th>
              <th style={{ width: 180 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="small muted" style={{ textAlign: 'center', padding: 20 }}>Loading…</td></tr>}
            {!loading && backups.length === 0 && (
              <tr><td colSpan={5} className="small muted" style={{ textAlign: 'center', padding: 24 }}>
                No backups yet. Click <strong>Create backup</strong> for a manual snapshot, or wait for the daily auto backup.
              </td></tr>
            )}
            {backups.map((b) => (
              <tr key={b.kind + '/' + b.name}>
                <td>
                  {b.kind === 'auto'
                    ? <span className="badge" style={{ background: '#dbeafe', color: '#1e40af' }}><Zap size={11} />Auto (current)</span>
                    : <span className="badge" style={{ background: '#f3f4f6', color: '#4b5563' }}><Archive size={11} />Manual</span>}
                </td>
                <td style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}><HardDrive size={13} style={{ marginRight: 6, verticalAlign: -2 }} />{b.name}</td>
                <td className="small muted">{fmtDate(b.takenAt)}</td>
                <td className="small muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtSize(b.size)}</td>
                <td>
                  <div className="row gap-6">
                    <button className="btn btn-sm" onClick={() => download(b)}><Download size={13} />Download</button>
                    {b.kind === 'manual' && (
                      <button className="btn btn-sm btn-ghost" onClick={() => askDelete(b)} disabled={busy === b.name} style={{ color: '#dc2626' }}><Trash2 size={13} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend / help */}
      <div className="small muted">
        <strong>Auto backup</strong> is kept as a single current file per company — it gets replaced (not duplicated) on each run so storage stays bounded. The previous auto backup is only deleted after the new one is verified.
        <br />
        <strong>Manual backups</strong> stay until you delete them. They include everything a company needs to be restored: documents, payments, inspections (with photos), chat, authorizations, customers, and settings.
      </div>

      {/* Restore summary */}
      {summary && (
        <div className="card card-pad" style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#065f46' }}>
          <div className="row gap-8" style={{ marginBottom: 8 }}>
            <strong>Restore completed successfully</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, fontSize: 13 }}>
            <div>Customers: <strong>{summary.customers}</strong></div>
            <div>Documents: <strong>{summary.documents}</strong></div>
            <div>Payments: <strong>{summary.payments}</strong></div>
            <div>Inspections: <strong>{summary.inspections}</strong></div>
            <div>Photos: <strong>{summary.photos}</strong></div>
            <div>Messages: <strong>{summary.messages}</strong></div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmRestore}
        onClose={() => { setConfirmRestore(false); setRestoreFile(null); if (fileRef.current) fileRef.current.value = '' }}
        onConfirm={restore}
        title="Restore from backup?"
        confirmLabel="Yes, restore"
        destructive
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
          <AlertTriangle size={18} color="#dc2626" />
          <div>
            Restoring this backup may <strong>replace existing company data</strong>. Documents, payments, inspections, chat and settings currently in your shop will be overwritten with the contents of <code>{restoreFile?.name}</code>.
            Make sure you have a current backup before continuing. This cannot be undone.
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        title="Delete this backup?"
        confirmLabel="Delete"
        destructive
      >
        Permanently delete <code>{confirmDelete?.name}</code>? This cannot be undone.
      </ConfirmDialog>
    </div>
  )
}
