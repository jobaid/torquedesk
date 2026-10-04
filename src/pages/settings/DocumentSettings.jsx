import { useEffect, useRef, useState } from 'react'
import { Upload, Trash2, ImageOff, Info, Save, Eye, CalendarClock } from 'lucide-react'
import { SectionHead, useSectionForm, useUnsavedGuard, UnsavedBar, useCanEdit, FormFields } from './kit'
import { ConfirmDialog } from '../../components/ui/Modal'
import { Field, Switch, Tabs } from '../../components/ui'
import { useSettings, PAYMENT_METHODS, DOC_TYPE_LABELS, logoUrl } from '../../store/useSettings'
import { toast } from '../../store/useApp'
import { api, ApiError } from '../../lib/api'
import DocumentSheet, { buildPreviewDoc, SAMPLE_STATEMENT } from '../../components/documents/DocumentSheet'

/* ---------------------------------------------------------------- Live preview */

const PREVIEW_TABS = [
  { id: 'estimate', label: 'Estimate' },
  { id: 'invoice', label: 'Invoice' },
  { id: 'statement', label: 'Statement' },
  { id: 'repair_order', label: 'Repair Order' },
]

/** Renders sample documents from current settings merged with unsaved edits. */
export function LivePreview({ overrides = {} }) {
  const data = useSettings((s) => s.data)
  const [tab, setTab] = useState('estimate')
  const settings = { ...data, ...overrides }
  const doc = buildPreviewDoc(tab, settings)
  return (
    <aside className="preview-panel" aria-label="Live document preview">
      <div className="row between gap-8" style={{ padding: '12px 14px 0' }}>
        <h3 className="row gap-6"><Eye size={16} />Live preview</h3>
        <span className="xs subtle">Updates as you edit</span>
      </div>
      <div style={{ padding: '0 6px' }}><Tabs label="Preview document" value={tab} onChange={setTab} tabs={PREVIEW_TABS} /></div>
      <div className="preview-paper">
        <div className="preview-scale"><DocumentSheet doc={doc} settings={settings} statementRows={SAMPLE_STATEMENT} /></div>
      </div>
    </aside>
  )
}

/* ---------------------------------------------------------------- Numbering + odometer */

const NO_ROWS = []

export function Numbering() {
  const numbering = useSettings((s) => s.data?.numbering) || NO_ROWS
  const patch = useSettings((s) => s.patch)
  const canEdit = useCanEdit('document_settings.edit')
  const prefs = useSectionForm('document-preferences', { perm: 'document_settings.edit', successMsg: 'Default odometer unit saved' })
  const [rows, setRows] = useState({})
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(null)
  useEffect(() => {
    setRows(Object.fromEntries(numbering.map((n) => [n.docType, { nextNumber: String(n.nextNumber), prefix: n.prefix }])))
  }, [numbering])
  const rowDirty = (n) => rows[n.docType] && (rows[n.docType].nextNumber !== String(n.nextNumber) || rows[n.docType].prefix !== n.prefix)
  const anyDirty = numbering.some(rowDirty) || prefs.dirty
  const blocker = useUnsavedGuard(anyDirty)

  const saveRow = async (n) => {
    const r = rows[n.docType]
    setSaving(n.docType)
    try {
      const list = await api(`/settings/numbering/${n.docType}`, { method: 'PUT', body: { nextNumber: Number(r.nextNumber), prefix: r.prefix } })
      patch('numbering', list)
      setErrors((e) => ({ ...e, [n.docType]: undefined }))
      toast.success(`${DOC_TYPE_LABELS[n.docType]} numbering saved`, `Next: ${r.prefix}${r.nextNumber}`)
      return true
    } catch (e) {
      setErrors((x) => ({ ...x, [n.docType]: e instanceof ApiError ? (e.fields.nextNumber || e.fields.prefix || e.message) : e.message }))
      toast.error('Could not save numbering', e.message)
      return false
    } finally { setSaving(null) }
  }
  const saveAll = async () => {
    for (const n of numbering.filter(rowDirty)) if (!(await saveRow(n))) return false
    if (prefs.dirty) return prefs.save()
    return true
  }
  const discardAll = () => { setRows(Object.fromEntries(numbering.map((n) => [n.docType, { nextNumber: String(n.nextNumber), prefix: n.prefix }]))); setErrors({}); prefs.discard() }

  return (
    <div className="stack gap-16">
      <SectionHead title="Document Numbering" description="Each document type has its own sequence. Numbers are unique — the database rejects duplicates." perm="document_settings.edit" />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Document type</th><th>Current number</th><th>Prefix</th><th>New document number</th><th /></tr></thead>
          <tbody>{numbering.map((n) => {
            const r = rows[n.docType] || { nextNumber: '', prefix: '' }
            return (
              <tr key={n.docType}>
                <td className="strong">{DOC_TYPE_LABELS[n.docType]}</td>
                <td><span className="mono">{n.lastIssued ? `${n.prefix}${n.lastIssued}` : 'None issued'}</span><div className="xs subtle">Next: {n.prefix}{n.nextNumber}</div></td>
                <td><input className="input mono" style={{ width: 90, height: 34 }} value={r.prefix} maxLength={8} onChange={(e) => setRows({ ...rows, [n.docType]: { ...r, prefix: e.target.value } })} disabled={!canEdit} aria-label={`${DOC_TYPE_LABELS[n.docType]} prefix`} /></td>
                <td>
                  <input className={`input mono num${errors[n.docType] ? ' invalid' : ''}`} style={{ width: 150, height: 34 }} inputMode="numeric" value={r.nextNumber}
                    onChange={(e) => { setRows({ ...rows, [n.docType]: { ...r, nextNumber: e.target.value.replace(/\D/g, '') } }); setErrors((x) => ({ ...x, [n.docType]: undefined })) }}
                    disabled={!canEdit} aria-label={`${DOC_TYPE_LABELS[n.docType]} next number`} aria-invalid={!!errors[n.docType]} />
                  {errors[n.docType] && <div className="field-error mt-4" role="alert">{errors[n.docType]}</div>}
                </td>
                <td>{canEdit && <button className="btn btn-secondary btn-sm" disabled={!rowDirty(n) || saving === n.docType} onClick={() => saveRow(n)}><Save size={14} />Save</button>}</td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
      <div className="callout callout-info"><Info size={18} /><div>The new number must be higher than the last number issued for that type. Converting an estimate to a repair order or invoice keeps its original number.</div></div>

      <div className="card card-pad stack gap-12">
        <h3>Default odometer unit</h3>
        <p className="small muted">Used for new documents. Existing documents keep the unit they were created with.</p>
        <div className="segmented" role="radiogroup" aria-label="Default odometer unit" style={{ alignSelf: 'flex-start' }}>
          {[['mi', 'Miles'], ['km', 'Kilometers']].map(([v, l]) => <button key={v} role="radio" aria-checked={prefs.form.defaultOdometerUnit === v} aria-pressed={prefs.form.defaultOdometerUnit === v} onClick={() => prefs.set('defaultOdometerUnit', v)} disabled={!canEdit}>{l}</button>)}
        </div>
      </div>
      <UnsavedBar dirty={anyDirty} saving={!!saving || prefs.saving} onSave={saveAll} onDiscard={discardAll} blocker={blocker} />
    </div>
  )
}

/* ---------------------------------------------------------------- Printing + logo */

const MAX_LOGO = 2 * 1024 * 1024
export function Printing() {
  const printing = useSettings((s) => s.data?.printing)
  const patch = useSettings((s) => s.patch)
  const canEdit = useCanEdit('document_settings.edit')
  const paper = useSectionForm('printing', { perm: 'document_settings.edit', successMsg: 'Printing settings saved' })
  const blocker = useUnsavedGuard(paper.dirty)
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState('')
  const url = logoUrl(printing)

  const upload = async (file) => {
    setError('')
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Logo must be a PNG, JPG/JPEG or WebP image.'); return }
    if (file.size > MAX_LOGO) { setError(`Logo is ${(file.size / 1048576).toFixed(1)} MB. Maximum size is 2 MB.`); return }
    const form = new FormData()
    form.append('file', file)
    setBusy(true)
    try {
      const row = await api('/settings/printing/logo', { method: 'POST', form })
      patch('printing', row)
      toast.success(url ? 'Logo replaced' : 'Logo uploaded', file.name)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const remove = async () => {
    try { const row = await api('/settings/printing/logo', { method: 'DELETE' }); patch('printing', row); toast.info('Logo removed') }
    catch (e) { toast.error('Could not remove logo', e.message) }
  }

  return (
    <div className="stack gap-16">
      <SectionHead title="Printing" description="Your logo prints on estimates, repair orders, invoices and statements." perm="document_settings.edit" />
      <div className="card card-pad stack gap-16">
        <h3>Shop logo</h3>
        <div className="logo-row">
          <div className="logo-box" aria-label="Current logo">
            {url ? <img src={url} alt="Current shop logo" /> : <div className="stack gap-6" style={{ alignItems: 'center', color: 'var(--text-3)' }}><ImageOff size={26} /><span className="xs">No logo</span></div>}
          </div>
          <div className="stack gap-8">
            <div className="strong small">Current logo</div>
            <div className="small muted">{printing?.logoName || 'None uploaded'}</div>
            <div className="xs subtle">PNG, JPG/JPEG or WebP · up to 2 MB · wide logos print best</div>
            {canEdit && (
              <div className="row gap-8 wrap mt-4">
                <button className="btn btn-primary btn-sm" onClick={() => fileRef.current.click()} disabled={busy}><Upload size={15} />{busy ? 'Uploading…' : url ? 'Replace Logo' : 'Upload Logo'}</button>
                {url && <button className="btn btn-secondary btn-sm" onClick={() => setConfirm(true)}><Trash2 size={15} />Remove Logo</button>}
              </div>
            )}
            {error && <div className="field-error" role="alert">{error}</div>}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { upload(e.target.files[0]); e.target.value = '' }} />
        </div>
      </div>
      <div className="card card-pad stack gap-12">
        <h3>Paper size</h3>
        <div className="segmented" role="radiogroup" aria-label="Paper size" style={{ alignSelf: 'flex-start' }}>
          {[['letter', 'US Letter'], ['a4', 'A4']].map(([v, l]) => <button key={v} role="radio" aria-checked={paper.form.paperSize === v} aria-pressed={paper.form.paperSize === v} onClick={() => paper.set('paperSize', v)} disabled={!canEdit}>{l}</button>)}
        </div>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} danger confirmLabel="Remove" title="Remove shop logo?" body="Documents will print without a logo until you upload a new one." onConfirm={remove} />
      <UnsavedBar dirty={paper.dirty} saving={paper.saving} onSave={paper.save} onDiscard={paper.discard} blocker={blocker} />
    </div>
  )
}

/* ---------------------------------------------------------------- Document options */

const OPTION_TOGGLES = [
  ['showPartNumbers', 'Show Part Numbers', 'Part Numbers will be hidden if toggled OFF.'],
  ['showLaborRates', 'Show Labor Rates & Hours', 'Rate, Quantity (Hours), and Price will be hidden if toggled OFF.'],
  ['showTechnician', "Show Technician's Name", "Technician's name appears in the document header."],
  ['showPromisedDate', 'Show Proposed Completion Date', 'Proposed completion date appears in the document header.'],
  ['savePartsDefault', 'Save Parts for Inspection', 'New repair orders start with “save replaced parts for customer inspection” checked.'],
  ['showPaymentMethods', 'Show Intended Method of Payment', 'Appears above the Customer Signature Line.'],
]

export function DocumentOptions() {
  const s = useSectionForm('document-options', { perm: 'document_settings.edit', successMsg: 'Document options saved' })
  const blocker = useUnsavedGuard(s.dirty)
  const methods = s.form.paymentMethods || []
  const toggleMethod = (m) => s.set('paymentMethods', methods.includes(m) ? methods.filter((x) => x !== m) : [...methods, m])
  return (
    <div className="settings-with-preview">
      <div className="stack gap-16">
        <SectionHead title="Document Options" description="Control what customers see on printed documents. Hidden information is never deleted." perm="document_settings.edit" />
        <div className="card">
          {OPTION_TOGGLES.map(([k, label, hint], i) => (
            <div key={k} className="switch-row card-pad" style={{ borderTop: i ? '1px solid var(--border)' : 0 }}>
              <div><div className="strong">{label}</div><div className="small muted">{hint}</div></div>
              <Switch checked={!!s.form[k]} onChange={(v) => s.canEdit && s.set(k, v)} label={label} />
            </div>
          ))}
          {s.form.showPaymentMethods && (
            <div className="card-pad" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="strong small">Payment methods offered</div>
              <div className="row gap-8 wrap mt-8" role="group" aria-label="Payment methods">
                {Object.entries(PAYMENT_METHODS).map(([k, l]) => <button key={k} className="chip" aria-pressed={methods.includes(k)} onClick={() => s.canEdit && toggleMethod(k)}>{l}</button>)}
              </div>
              {s.errors.paymentMethods && <div className="field-error mt-4">{s.errors.paymentMethods}</div>}
            </div>
          )}
        </div>
        <div className="callout callout-info"><Info size={18} /><div>New documents use these options. Existing documents keep the options they were created with until you choose <strong>Apply current settings</strong> on that document.</div></div>
      </div>
      <LivePreview overrides={{ 'document-options': s.form }} />
      <UnsavedBar dirty={s.dirty} saving={s.saving} onSave={s.save} onDiscard={s.discard} blocker={blocker} />
    </div>
  )
}

/* ---------------------------------------------------------------- Header & footer */

const HEADER_SHOW = [['headerShowLogo', 'Shop logo'], ['headerShowName', 'Shop name'], ['headerShowAddress', 'Address'], ['headerShowPhone', 'Phone'], ['headerShowEmail', 'Email'], ['headerShowWebsite', 'Website']]
const FOOTER_SHOW = [['footerShowLicenses', 'Shop license information'], ['footerShowCertifications', 'Certification information'], ['footerShowRegistrations', 'Registration information']]
const FOOTER_TEXT = [
  { name: 'footerCustomText', label: 'Custom footer text', type: 'textarea', span: 2, rows: 2, max: 2000, placeholder: 'Thank you for your business!' },
  { name: 'paymentInstructions', label: 'Payment instructions', type: 'textarea', span: 2, rows: 2, max: 2000 },
  { name: 'warrantyText', label: 'Warranty / disclaimer text', type: 'textarea', span: 2, rows: 3, max: 4000 },
  { name: 'customNotes', label: 'Custom notes', type: 'textarea', span: 2, rows: 2, max: 2000 },
]

export function HeaderFooter() {
  const s = useSectionForm('header-footer', { perm: 'document_settings.edit', successMsg: 'Header & footer saved' })
  const blocker = useUnsavedGuard(s.dirty)
  const dis = !s.canEdit
  return (
    <div className="settings-with-preview">
      <div className="stack gap-16">
        <SectionHead title="Document Header & Footer" description="Choose what appears at the top and bottom of every printed document." perm="document_settings.edit" />
        <div className="card card-pad stack gap-16">
          <h3>Header</h3>
          <div className="check-grid">
            {HEADER_SHOW.map(([k, l]) => <label key={k} className="row gap-8 small"><input type="checkbox" className="checkbox" checked={!!s.form[k]} onChange={(e) => s.set(k, e.target.checked)} disabled={dis} />{l}</label>)}
          </div>
          <Field label="Logo position" htmlFor="hf-layout">
            <div className="segmented" role="radiogroup" aria-label="Logo position" style={{ alignSelf: 'flex-start' }}>
              {[['logo_left', 'Left'], ['logo_center', 'Centered'], ['logo_right', 'Right']].map(([v, l]) => <button key={v} role="radio" aria-checked={s.form.headerLayout === v} aria-pressed={s.form.headerLayout === v} onClick={() => s.set('headerLayout', v)} disabled={dis}>{l}</button>)}
            </div>
          </Field>
          <FormFields fields={[{ name: 'headerCustomText', label: 'Custom header text', type: 'textarea', span: 2, rows: 2, max: 1000, placeholder: 'e.g. ASE Certified · Family owned since 1998' }]} form={s.form} set={s.set} errors={s.errors} disabled={dis} />
        </div>
        <div className="card card-pad stack gap-16">
          <h3>Footer</h3>
          <div className="check-grid">
            {FOOTER_SHOW.map(([k, l]) => <label key={k} className="row gap-8 small"><input type="checkbox" className="checkbox" checked={!!s.form[k]} onChange={(e) => s.set(k, e.target.checked)} disabled={dis} />{l}</label>)}
          </div>
          <p className="xs subtle">License, certification and registration details come from Shop → Licenses & Certifications.</p>
          <FormFields fields={FOOTER_TEXT} form={s.form} set={s.set} errors={s.errors} disabled={dis} />
        </div>
      </div>
      <LivePreview overrides={{ 'header-footer': s.form }} />
      <UnsavedBar dirty={s.dirty} saving={s.saving} onSave={s.save} onDiscard={s.discard} blocker={blocker} />
    </div>
  )
}

/* ---------------------------------------------------------------- Estimate settings */

export function EstimateSettings() {
  const s = useSectionForm('estimate', { perm: 'document_settings.edit', successMsg: 'Estimate settings saved' })
  const blocker = useUnsavedGuard(s.dirty)
  const days = Number(s.form.validityDays) || 0
  const exp = new Date(Date.now() + days * 86400000)
  const set = (v) => s.set('validityDays', v === '' ? '' : Number(String(v).replace(/\D/g, '')))
  const save = async () => {
    if (!(days >= 1 && days <= 365)) { toast.error('Enter between 1 and 365 days'); return false }
    return s.save()
  }
  return (
    <div className="stack gap-16">
      <SectionHead title="Estimate Settings" description="How long the shop honors an estimate." perm="document_settings.edit" />
      <div className="card card-pad stack gap-16">
        <Field label="Estimates Are Valid For" htmlFor="est-days" hint="Indicates the number of days the shop will honor the Estimate." error={s.errors.validityDays || (s.form.validityDays !== '' && !(days >= 1 && days <= 365) ? 'Enter between 1 and 365 days.' : '')}>
          <div className="row gap-8 wrap">
            <div className="input-wrap" style={{ width: 160 }}>
              <input id="est-days" className="input num" inputMode="numeric" value={s.form.validityDays ?? ''} onChange={(e) => set(e.target.value)} disabled={!s.canEdit} style={{ paddingLeft: 12, paddingRight: 52 }} />
              <span className="input-suffix">days</span>
            </div>
            {[7, 14, 30, 60, 90].map((d) => <button key={d} className="chip" aria-pressed={days === d} onClick={() => s.canEdit && set(d)}>{d} days</button>)}
          </div>
        </Field>
        <div className="callout callout-info">
          <CalendarClock size={18} />
          <div>An estimate created today, <strong>{new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</strong>, would expire on <strong>{days >= 1 ? exp.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}</strong>. Existing estimates keep their original expiration date.</div>
        </div>
      </div>
      <UnsavedBar dirty={s.dirty} saving={s.saving} onSave={save} onDiscard={s.discard} blocker={blocker} />
    </div>
  )
}

