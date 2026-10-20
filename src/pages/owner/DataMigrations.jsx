import { useEffect, useState } from 'react'
import { ownerApi, useOwner } from '../../store/useOwner'
import { Upload, Database, Check, X, AlertCircle, Trash2, Loader2, ChevronRight, Play, FileSpreadsheet } from 'lucide-react'

export default function DataMigrations() {
  const [jobs, setJobs] = useState([])
  const [presets, setPresets] = useState(null)
  const [companies, setCompanies] = useState([])
  const [active, setActive] = useState(null)
  const [err, setErr] = useState('')

  const refresh = () => ownerApi('/migrations').then(setJobs).catch((e) => setErr(e.message))
  useEffect(() => {
    refresh()
    ownerApi('/migrations/presets').then(setPresets).catch((e) => setErr(e.message))
    ownerApi('/companies').then((rs) => setCompanies(rs || [])).catch(() => {})
  }, [])

  const openJob = (id) => ownerApi(`/migrations/${id}`).then(setActive).catch((e) => setErr(e.message))
  const closeJob = () => setActive(null)

  if (active) {
    return <JobDetail job={active} presets={presets} onClose={() => { closeJob(); refresh() }} onReload={() => openJob(active.id)} />
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Database size={24} color="#2554f5" />
            Data Migration Tool
          </h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
            Import customers, vehicles, or historical invoices from a competitor's shop-management software.
          </p>
        </div>
      </div>

      {err && <div style={errBox}>{err}</div>}

      <NewJobCard companies={companies} presets={presets} onCreated={(j) => { setActive(j); refresh() }} setErr={setErr} />

      <div style={{ marginTop: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', letterSpacing: '.03em', textTransform: 'uppercase', marginBottom: 10 }}>
          Recent jobs
        </div>
        {jobs.length === 0 ? (
          <div style={emptyBox}>No migration jobs yet. Upload a CSV above to begin.</div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
            {jobs.map((j) => (
              <div key={j.id} onClick={() => openJob(j.id)} style={jobRow}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{j.company_name} <span style={{ fontWeight: 400, color: '#64748b', fontSize: 13 }}>· {j.file_name}</span></div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {j.source_vendor} → {j.entity} · {j.row_count} rows · {new Date(j.created_at).toLocaleString()}
                  </div>
                </div>
                <StatusChip status={j.status} />
                <div style={{ fontSize: 12, color: '#64748b', width: 110, textAlign: 'right' }}>
                  {j.status === 'completed' && <>✓ {j.imported_count} imported</>}
                  {j.status === 'failed' && <>{j.skipped_count} skipped</>}
                </div>
                <ChevronRight size={16} color="#94a3b8" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- New job
function NewJobCard({ companies, presets, onCreated, setErr }) {
  const [companyId, setCompanyId] = useState('')
  const [entity, setEntity] = useState('customers')
  const [vendor, setVendor] = useState('custom')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    if (!companyId || !file) { setErr('Pick a target shop and a CSV file first.'); return }
    setBusy(true)
    try {
      const token = useOwner.getState().owner?.token
      const fd = new FormData()
      fd.append('company_id', companyId)
      fd.append('entity', entity)
      fd.append('source_vendor', vendor)
      fd.append('file', file)
      const res = await fetch('/api/owner/migrations', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || `Upload failed (${res.status})`)
      onCreated(body)
      setFile(null)
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  const entities = presets?.entities || [{ key: 'customers', label: 'Customers' }]

  return (
    <form onSubmit={submit} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>New migration</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <Field label="Target shop">
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} style={inp}>
            <option value="">Select a shop…</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Data type">
          <select value={entity} onChange={(e) => setEntity(e.target.value)} style={inp}>
            {entities.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>
        </Field>
        <Field label="Source software">
          <select value={vendor} onChange={(e) => setVendor(e.target.value)} style={inp}>
            {(presets?.vendors || [{ key: 'custom', label: 'Custom CSV' }]).map((v) => (
              <option key={v.key} value={v.key}>{v.label}</option>
            ))}
          </select>
        </Field>
      </div>
      {entity !== 'customers' && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12, color: '#1e40af' }}>
          {entity === 'vehicles' && 'Vehicles are matched to existing customers by phone (then name). Import customers first if you haven\'t.'}
          {entity === 'invoices' && 'Historical invoices are created as single-line records (status=paid). Customers must already exist in the target shop.'}
        </div>
      )}
      {entity === 'backup_bundle' && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#78350f', lineHeight: 1.5 }}>
          <strong>Fixora Universal Migration Bundle (.zip)</strong><br />
          Expected contents: <code>customers.csv</code> · <code>vehicles.csv</code> · <code>invoices.csv</code> · <code>settings.json</code> · <code>logo.png|jpg|webp</code> · <code>manifest.json</code> (optional). Each piece runs through its matching importer in one shot. CSV headers must use Fixora field names (name, phone, vehicle_year, …).
        </div>
      )}
      <Field label={entity === 'backup_bundle' ? 'Bundle file' : 'CSV file'} style={{ marginTop: 14 }}>
        <label style={{ ...inp, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderStyle: 'dashed' }}>
          <Upload size={16} color="#64748b" />
          <span style={{ color: file ? '#0f172a' : '#94a3b8', flex: 1 }}>
            {file ? file.name : entity === 'backup_bundle' ? 'Click to choose a .zip bundle (max 100 MB)' : 'Click to choose a .csv file (max 20 MB)'}
          </span>
          <input type="file"
            accept={entity === 'backup_bundle' ? '.zip,application/zip' : '.csv,text/csv'}
            onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
        </label>
      </Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button type="submit" disabled={busy || !file || !companyId} style={btnPrimary}>
          {busy ? <Loader2 size={14} className="spin" /> : <FileSpreadsheet size={14} />}
          {busy ? 'Uploading…' : 'Upload & map columns'}
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------- Job detail (mapping + dry-run + commit)
function JobDetail({ job: initialJob, presets, onClose, onReload }) {
  const [job, setJob] = useState(initialJob)
  const [mapping, setMapping] = useState(initialJob.mapping || {})
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const fields = job.fields || []
  const headers = job.csv_headers || []
  const requiredField = job.entity === 'invoices' ? 'invoice_number' : (job.entity === 'vehicles' ? 'customer_phone' : 'name')
  const isBundle = job.entity === 'backup_bundle'

  const saveMapping = async () => {
    setBusy('save'); setErr('')
    try {
      const r = await ownerApi(`/migrations/${job.id}`, { method: 'PATCH', body: { mapping } })
      setJob(r); setMapping(r.mapping || mapping)
    } catch (e) { setErr(e.message) } finally { setBusy('') }
  }
  const dryRun = async () => {
    setBusy('dry'); setErr('')
    try { const r = await ownerApi(`/migrations/${job.id}/dry-run`, { method: 'POST' }); setJob(r) }
    catch (e) { setErr(e.message) } finally { setBusy('') }
  }
  const commit = async () => {
    if (!window.confirm(`Import ${job.dry_run_report?.valid ?? '?'} ${job.entity} into ${job.company_name}? This cannot be undone from the migration tool.`)) return
    setBusy('commit'); setErr('')
    try { const r = await ownerApi(`/migrations/${job.id}/commit`, { method: 'POST' }); setJob(r) }
    catch (e) { setErr(e.message) } finally { setBusy('') }
  }
  const removeJob = async () => {
    if (!window.confirm('Delete this migration job and its uploaded CSV?')) return
    try { await ownerApi(`/migrations/${job.id}`, { method: 'DELETE' }); onClose() }
    catch (e) { setErr(e.message) }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <button onClick={onClose} style={{ ...btnSecondary, marginBottom: 16 }}>← Back to jobs</button>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{job.file_name}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
              {job.company_name} · {job.source_vendor} · {job.row_count} rows
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <StatusChip status={job.status} />
            <button onClick={removeJob} style={{ ...btnSecondary, color: '#dc2626' }}><Trash2 size={14} />Delete</button>
          </div>
        </div>
      </div>

      {err && <div style={errBox}>{err}</div>}

      {/* Mapping — bundles have fixed schema, no mapping needed */}
      {!isBundle && (
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={sectionHead}>1. Column mapping</div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
          Match our {job.entity} fields to columns in your CSV. Leave blank to skip. <strong>{prettyField(requiredField)}</strong> is required.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {fields.map((f) => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 180, fontSize: 13, color: '#334155', fontWeight: f === requiredField ? 600 : 400 }}>
                {prettyField(f)}{f === requiredField && <span style={{ color: '#dc2626' }}> *</span>}
              </div>
              <select value={mapping[f] || ''} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value })} style={{ ...inp, flex: 1 }}>
                <option value="">— skip —</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={saveMapping} disabled={busy === 'save' || !mapping[requiredField]} style={btnSecondary}>
            {busy === 'save' ? 'Saving…' : 'Save mapping'}
          </button>
        </div>
      </div>
      )}

      {/* Preview — only for CSV entities */}
      {!isBundle && job.preview && job.preview.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <div style={sectionHead}>2. First 10 rows (sanity check)</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>{headers.slice(0, 8).map((h) => <th key={h} style={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {job.preview.map((row, i) => (
                  <tr key={i}>
                    {headers.slice(0, 8).map((h) => <td key={h} style={td}>{row[h] || <span style={{ color: '#cbd5e1' }}>—</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {headers.length > 8 && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>+ {headers.length - 8} more columns</div>}
          </div>
        </div>
      )}

      {/* Dry run */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={sectionHead}>{isBundle ? '1.' : '3.'} Dry run ({isBundle ? 'inspect bundle contents' : 'validate without inserting'})</div>
        <button onClick={dryRun} disabled={busy === 'dry' || (!isBundle && !mapping[requiredField])} style={btnSecondary}>
          {busy === 'dry' ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
          {busy === 'dry' ? 'Validating…' : 'Run validation'}
        </button>
        {job.dry_run_report && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', gap: 20 }}>
              <Stat label={isBundle ? 'Sections found' : 'Total rows'} value={job.dry_run_report.total} />
              <Stat label="Valid" value={job.dry_run_report.valid} tone="green" />
              <Stat label="Invalid" value={job.dry_run_report.invalid} tone={job.dry_run_report.invalid ? 'red' : null} />
            </div>
            {isBundle && job.dry_run_report.sections && (
              <div style={{ marginTop: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, fontSize: 12, color: '#334155' }}>
                <div><strong>CSVs:</strong> {Object.entries(job.dry_run_report.sections.csvs || {}).map(([k, v]) => `${k} (${v})`).join(', ') || '—'}</div>
                <div><strong>Settings:</strong> {job.dry_run_report.sections.has_settings ? '✓ settings.json' : '—'}</div>
                <div><strong>Logo:</strong> {job.dry_run_report.sections.has_logo ? '✓ included' : '—'}</div>
              </div>
            )}
            {job.dry_run_report.issues?.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, color: '#dc2626' }}>Show {job.dry_run_report.issues.length} issue(s)</summary>
                <ul style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                  {job.dry_run_report.issues.map((i, k) => <li key={k}>Line {i.line}: {i.reason}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Commit */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
        <div style={sectionHead}>{isBundle ? '2.' : '4.'} Commit import</div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
          Inserts valid rows into <strong>{job.company_name}</strong>. The uploaded CSV is wiped after a successful commit.
        </div>
        <button onClick={commit}
          disabled={busy === 'commit' || !job.dry_run_report || job.dry_run_report.valid === 0 || job.status === 'completed'}
          style={btnPrimary}>
          {busy === 'commit' ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
          {busy === 'commit' ? 'Importing…' : job.status === 'completed' ? 'Already imported' : `Import ${job.dry_run_report?.valid ?? '?'} ${job.entity}`}
        </button>
        {job.commit_report && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', gap: 20 }}>
              <Stat label="Imported" value={job.imported_count} tone="green" />
              <Stat label="Skipped" value={job.skipped_count} tone={job.skipped_count ? 'red' : null} />
            </div>
            {job.commit_report.errors?.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, color: '#dc2626' }}>Show {job.commit_report.errors.length} error(s)</summary>
                <ul style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                  {job.commit_report.errors.map((e, k) => <li key={k}>{e}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// ---------------------------------------------------------------- bits
function Field({ label, children, style }) {
  return (
    <div style={style}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}
function Stat({ label, value, tone }) {
  const colors = { green: '#047857', red: '#dc2626' }
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: colors[tone] || '#0f172a' }}>{value}</div>
    </div>
  )
}
function StatusChip({ status }) {
  const map = {
    draft: { bg: '#f1f5f9', fg: '#64748b', label: 'Draft' },
    mapped: { bg: '#eff6ff', fg: '#1e40af', label: 'Mapped' },
    dry_run_ok: { bg: '#ecfdf5', fg: '#047857', label: 'Dry-run OK' },
    dry_run_failed: { bg: '#fef2f2', fg: '#b91c1c', label: 'Dry-run failed' },
    completed: { bg: '#ecfdf5', fg: '#047857', label: 'Completed' },
    failed: { bg: '#fef2f2', fg: '#b91c1c', label: 'Failed' },
  }
  const s = map[status] || map.draft
  return <span style={{ background: s.bg, color: s.fg, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99 }}>{s.label}</span>
}
function prettyField(f) {
  return f.replace(/^vehicle_/, 'Vehicle · ').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const inp = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, width: '100%', background: '#fff', color: '#0f172a' }
const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: 'linear-gradient(90deg,#2554f5,#1d4fd9)', color: '#fff', border: 0, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const btnSecondary = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }
const errBox = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14 }
const emptyBox = { background: '#f8fafc', border: '1px dashed #cbd5e1', padding: 24, borderRadius: 12, textAlign: 'center', color: '#94a3b8', fontSize: 13 }
const jobRow = { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }
const sectionHead = { fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 10 }
const th = { textAlign: 'left', padding: '8px 10px', background: '#f8fafc', fontSize: 11, color: '#64748b', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }
const td = { padding: '8px 10px', fontSize: 12, color: '#334155', borderBottom: '1px solid #f1f5f9' }
