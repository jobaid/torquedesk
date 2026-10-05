import { useEffect, useRef, useState } from 'react'
import { Download, Upload, HardDrive, RefreshCw, AlertTriangle } from 'lucide-react'
import { SectionHead } from './kit'
import { useApp, toast } from '../../store/useApp'
import { ConfirmDialog } from '../../components/ui/Modal'

const fmtSize = (b) => (b > 1_000_000 ? `${(b / 1_048_576).toFixed(2)} MB` : b > 1000 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`)
const fmtDate = (ms) => new Date(ms).toLocaleString()

export function BackupSettings() {
  const token = useApp((s) => s.user?.token)
  const [autoBackups, setAutoBackups] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [restoreFile, setRestoreFile] = useState(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const fileRef = useRef(null)

  const authHeaders = () => ({ Authorization: `Bearer ${token}` })

  const refresh = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/backup/auto', { headers: authHeaders() })
      setAutoBackups(res.ok ? await res.json() : [])
    } catch { setAutoBackups([]) } finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  const manualDownload = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/backup/download', { headers: authHeaders() })
      if (!res.ok) throw new Error('Backup failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers.get('Content-Disposition') || ''
      const m = cd.match(/filename="([^"]+)"/)
      a.download = m ? m[1] : `torquedesk-backup-${Date.now()}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      toast.success('Backup downloaded', 'Save this file somewhere safe.')
    } catch (e) { toast.error('Backup failed', e.message) } finally { setBusy(false) }
  }

  const runNow = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/backup/run-now', { method: 'POST', headers: authHeaders() })
      if (!res.ok) throw new Error('Could not create backup')
      toast.success('Auto backup created', 'Added to the list below.')
      await refresh()
    } catch (e) { toast.error('Backup failed', e.message) } finally { setBusy(false) }
  }

  const downloadAuto = async (name) => {
    const res = await fetch(`/api/backup/auto/${encodeURIComponent(name)}`, { headers: authHeaders() })
    if (!res.ok) { toast.error('Download failed', `${res.status}`); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = name; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const pickFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setRestoreFile(f)
    setConfirmRestore(true)
  }

  const restore = async () => {
    if (!restoreFile) return
    setBusy(true); setConfirmRestore(false)
    try {
      const buf = await restoreFile.arrayBuffer()
      const res = await fetch('/api/backup/restore', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/octet-stream' }, body: buf })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Restore failed')
      toast.success('Restore complete', `Restored ${data.restored?.documents ?? 0} documents.`)
      setRestoreFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) { toast.error('Restore failed', e.message) } finally { setBusy(false) }
  }

  return (
    <div className="stack gap-16">
      <SectionHead title="Backup & Restore" description="Download your shop's data or restore from a previous backup. Only shop owners/admins can use this." />

      <div className="card card-pad stack gap-12">
        <div className="row gap-12" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="strong">Manual backup</div>
            <div className="small muted">Download a JSON file with all documents, payments, settings and audit log for this shop. Nothing is sent anywhere.</div>
          </div>
          <button className="btn btn-primary" onClick={manualDownload} disabled={busy}><Download size={16} />Download backup now</button>
        </div>
      </div>

      <div className="card card-pad stack gap-12">
        <div className="row gap-12" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="strong">Automatic daily backups</div>
            <div className="small muted">The server keeps the last 30 days on disk. You can download any of them below.</div>
          </div>
          <button className="btn btn-secondary" onClick={runNow} disabled={busy}><RefreshCw size={16} />Run backup now</button>
        </div>
        {loading ? <div className="small muted">Loading…</div>
          : autoBackups.length === 0 ? <div className="small muted">No auto backups yet. The first daily backup runs within a few minutes of the server starting.</div>
          : (
            <table className="table">
              <thead><tr><th>Date</th><th>Size</th><th style={{ width: 1 }}></th></tr></thead>
              <tbody>
                {autoBackups.map((b) => (
                  <tr key={b.name}>
                    <td><HardDrive size={14} style={{ marginRight: 6 }} />{b.name.replace('.json.gz', '')} <span className="small muted">({fmtDate(b.takenAt)})</span></td>
                    <td className="small muted">{fmtSize(b.size)}</td>
                    <td><button className="btn btn-sm" onClick={() => downloadAuto(b.name)}><Download size={14} />Download</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      <div className="card card-pad stack gap-12" style={{ borderColor: 'rgba(220,53,69,0.3)' }}>
        <div className="row gap-8"><AlertTriangle size={16} color="#dc3545" /><div className="strong">Restore from backup</div></div>
        <div className="small muted">
          Restoring <strong>deletes all current documents and payments</strong> for this shop and replaces them with the backup's contents.
          Only backups from THIS shop can be restored.
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".json,.gz,application/json,application/gzip" onChange={pickFile} />
          <label htmlFor="file-restore" className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            <Upload size={16} />Choose backup file…
          </label>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRestore}
        onClose={() => { setConfirmRestore(false); setRestoreFile(null); if (fileRef.current) fileRef.current.value = '' }}
        onConfirm={restore}
        title="Replace all shop data?"
        confirmLabel="Yes, restore"
        destructive
      >
        This will <strong>delete every current document and payment</strong> for this shop and replace them with the contents of
        &nbsp;<code>{restoreFile?.name}</code>. This cannot be undone — download a manual backup first if you're not sure.
      </ConfirmDialog>
    </div>
  )
}
