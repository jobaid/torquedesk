import { useEffect, useRef, useState } from 'react'
import { Download, Upload, Plus, Zap, Trash2, HardDrive, Archive, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Card, Btn, PageHeader } from './primitives'
import { ownerApi, useOwner } from '../../store/useOwner'

const fmtSize = (b) => (b > 1_000_000_000 ? `${(b / 1_073_741_824).toFixed(2)} GB` : b > 1_000_000 ? `${(b / 1_048_576).toFixed(2)} MB` : b > 1000 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`)
const fmtDate = (ms) => new Date(ms).toLocaleString()

export default function Backups() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [summary, setSummary] = useState(null)
  const [confirmRestore, setConfirmRestore] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const fileRef = useRef(null)

  const refresh = async () => {
    setLoading(true); setErr('')
    try { setList((await ownerApi('/backups')) || []) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  const createManual = async () => {
    setBusy('manual'); setErr('')
    try {
      const r = await ownerApi('/backups/manual', { method: 'POST' })
      setErr(''); alertOk(`Backup created: ${r.name}`)
      await refresh()
    } catch (e) { setErr(e.message) }
    finally { setBusy('') }
  }
  const runAuto = async () => {
    setBusy('auto'); setErr('')
    try {
      await ownerApi('/backups/auto/run', { method: 'POST' })
      alertOk('Platform auto backup replaced.')
      await refresh()
    } catch (e) { setErr(e.message) }
    finally { setBusy('') }
  }
  const download = async (b) => {
    const token = useOwner.getState().owner?.token
    const res = await fetch(`/api/owner/backups/download/${b.kind}/${encodeURIComponent(b.name)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!res.ok) { setErr('Download failed'); return }
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
    try { await ownerApi(`/backups/manual/${encodeURIComponent(b.name)}`, { method: 'DELETE' }); await refresh() }
    catch (e) { setErr(e.message) }
  }

  const pickFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setConfirmRestore(f)
  }
  const doRestore = async () => {
    const f = confirmRestore; setConfirmRestore(null); if (!f) return
    setBusy('restore'); setErr(''); setSummary(null)
    try {
      const token = useOwner.getState().owner?.token
      const buf = await f.arrayBuffer()
      const res = await fetch('/api/owner/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: buf,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Restore failed')
      setSummary(data.summary)
      alertOk('Restore completed.')
      if (fileRef.current) fileRef.current.value = ''
      await refresh()
    } catch (e) { setErr(e.message) }
    finally { setBusy('') }
  }

  const alertOk = (m) => setSummary((s) => s || { _msg: m })

  return (
    <div>
      <PageHeader title="Platform backup & restore"
        subtitle="One ZIP contains every company's full data plus SaaS tables. Auto backup replaces a single current file weekly; manual backups stay until you delete them. Keep these files safe — anyone with one can rebuild the platform." />

      {/* Action row */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Btn onClick={createManual} disabled={!!busy}><Plus size={14} />{busy === 'manual' ? 'Creating…' : 'Create backup'}</Btn>
          <Btn variant="secondary" onClick={runAuto} disabled={!!busy}><Zap size={14} />{busy === 'auto' ? 'Running…' : 'Replace auto backup now'}</Btn>
          <div style={{ marginLeft: 'auto', position: 'relative' }}>
            <input ref={fileRef} type="file" accept=".zip,application/zip" onChange={pickFile}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
            <Btn variant="ghost" disabled={!!busy}><Upload size={14} />Restore from file…</Btn>
          </div>
        </div>
      </Card>

      {/* Error / notice */}
      {err && <Card style={{ background: '#2a0d10', borderColor: '#51232a', color: '#fda4af', marginBottom: 12 }}><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> {err}</Card>}
      {summary && (
        <Card style={{ background: '#0d2a1b', borderColor: '#1f5a3a', color: '#86efac', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: summary._msg ? 0 : 8 }}>
            <CheckCircle2 size={16} /> <strong>{summary._msg || 'Restore completed successfully'}</strong>
          </div>
          {!summary._msg && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, fontSize: 13, marginTop: 6 }}>
              <div>Companies: <strong>{summary.companies}</strong></div>
              <div>Customers: <strong>{summary.customers}</strong></div>
              <div>Documents: <strong>{summary.documents}</strong></div>
              <div>Payments: <strong>{summary.payments}</strong></div>
              <div>Inspections: <strong>{summary.inspections}</strong></div>
              <div>Photos: <strong>{summary.photos}</strong></div>
              <div>Messages: <strong>{summary.messages}</strong></div>
              <div>SaaS admins: <strong>{summary.saasAdmins}</strong></div>
              <div>Shop owners: <strong>{summary.owners}</strong></div>
            </div>
          )}
        </Card>
      )}

      {/* List */}
      <Card style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', color: '#e5edf5', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#0b1220' }}>
              <th style={th}>Type</th>
              <th style={th}>File</th>
              <th style={th}>Date</th>
              <th style={th}>Size</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: '#8da2bf' }}>Loading…</td></tr>}
            {!loading && list.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#8da2bf' }}>
                No backups yet. Click <strong>Create backup</strong> for a manual snapshot, or <strong>Replace auto backup now</strong> to produce the current auto file.
              </td></tr>
            )}
            {list.map((b) => (
              <tr key={b.kind + '/' + b.name} style={{ borderTop: '1px solid #1e2a44' }}>
                <td style={td}>
                  {b.kind === 'auto'
                    ? <span style={pill('#102236', '#93c5fd')}><Zap size={11} /> Auto (current)</span>
                    : <span style={pill('#1a1a2e', '#c4b5fd')}><Archive size={11} /> Manual</span>}
                </td>
                <td style={{ ...td, fontFamily: 'ui-monospace, Menlo, monospace' }}><HardDrive size={13} style={{ marginRight: 6, verticalAlign: -2 }} />{b.name}</td>
                <td style={td}>{fmtDate(b.takenAt)}</td>
                <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{fmtSize(b.size)}</td>
                <td style={td}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Btn variant="secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => download(b)}><Download size={12} />Download</Btn>
                    {b.kind === 'manual' && (
                      <Btn variant="danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => askDelete(b)}><Trash2 size={12} /></Btn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div style={{ marginTop: 14, fontSize: 12, color: '#8da2bf' }}>
        <strong>Auto backup</strong> runs weekly (first run 10 minutes after each server boot). It replaces the single current file via safe-swap — the previous backup is only deleted after the new one is verified, so a failed build never leaves the platform without a backup.
        <br />
        <strong>Restore</strong> rebuilds every company's data, SaaS admin users, company owners, subscriptions and feature flags from the backup. Use it to recover from a crash or to migrate the platform to a new server.
      </div>

      {/* Dialogs */}
      {confirmRestore && (
        <Dialog title="Restore platform backup?" onClose={() => setConfirmRestore(null)}>
          <div style={{ color: '#fda4af', marginBottom: 10 }}>
            <AlertTriangle size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
            <strong>This replaces every company's data</strong> with the contents of <code style={{ color: '#fff' }}>{confirmRestore.name}</code>. Documents, payments, inspections, chat and settings currently on the platform will be overwritten. This cannot be undone.
          </div>
          <div style={{ color: '#8da2bf', fontSize: 12, marginBottom: 14 }}>Only run this on a crashed or empty server, or after confirming the current state can be lost.</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setConfirmRestore(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={doRestore}>Yes, restore</Btn>
          </div>
        </Dialog>
      )}
      {confirmDelete && (
        <Dialog title="Delete this backup?" onClose={() => setConfirmDelete(null)}>
          <div style={{ color: '#8da2bf', marginBottom: 14 }}>Permanently delete <code style={{ color: '#fff' }}>{confirmDelete.name}</code>? This cannot be undone.</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={doDelete}>Delete</Btn>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function Dialog({ title, children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#0e1627', border: '1px solid #1e2a44', color: '#e5edf5', borderRadius: 12, padding: 20, maxWidth: 520, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 10 }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

const th = { textAlign: 'left', padding: '10px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: '#8da2bf', fontWeight: 600 }
const td = { padding: '10px 14px', color: '#e5edf5' }
const pill = (bg, fg) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 600 })
