import { useRef, useState } from 'react'
import { Pencil, Plus, Trash2, Eye, Upload, FileText, X, BadgeCheck, UserCog, Wrench, Power, Phone, Mail, MapPin, Globe, CalendarX } from 'lucide-react'
import { SectionHead, useSectionForm, useUnsavedGuard, UnsavedBar, FormFields, EntityModal, useList, useCanEdit } from './kit'
import Modal, { ConfirmDialog } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui'
import { toast } from '../../store/useApp'
import { api, openFile } from '../../lib/api'

/* ---------------------------------------------------------------- Shop details */

const SHOP_FIELDS = [
  { name: 'shopName', label: 'Shop name', required: true, span: 2, max: 120 },
  { name: 'address1', label: 'Address', span: 2, placeholder: 'Street address' },
  { name: 'address2', label: 'Address line 2', span: 2, placeholder: 'Suite, unit, building (optional)' },
  { name: 'city', label: 'City' },
  { name: 'state', label: 'State' },
  { name: 'zip', label: 'ZIP code', max: 10 },
  { name: 'country', label: 'Country' },
  { name: 'phone', label: 'Phone', type: 'tel', placeholder: '(555) 555-0100' },
  { name: 'phone2', label: 'Secondary phone', type: 'tel', placeholder: 'Optional' },
  { name: 'email', label: 'Email', type: 'email', placeholder: 'service@yourshop.com' },
  { name: 'website', label: 'Website', type: 'url', placeholder: 'yourshop.com' },
  { name: 'description', label: 'Shop description', type: 'textarea', span: 2, max: 2000, placeholder: 'Shown on your profile and optional document headers.' },
]

export function ShopDetails() {
  const s = useSectionForm('shop', { perm: 'shop.edit', successMsg: 'Shop details saved' })
  const [editing, setEditing] = useState(false)
  const blocker = useUnsavedGuard(s.dirty)
  const save = async () => { const ok = await s.save(); if (ok) setEditing(false); return ok }
  const cancel = () => { s.discard(); setEditing(false) }
  const v = s.server || {}

  return (
    <div className="stack gap-16">
      <SectionHead title="Shop Details" description="Your shop's name and contact information appear on documents and printouts." perm="shop.edit"
        actions={!editing && <button className="btn btn-secondary" onClick={() => setEditing(true)}><Pencil size={16} />Edit</button>} />
      {editing ? (
        <div className="card card-pad stack gap-16">
          <FormFields fields={SHOP_FIELDS} form={s.form} set={s.set} errors={s.errors} />
          <div className="row gap-8" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={cancel}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={s.saving || !s.dirty}>{s.saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      ) : (
        <div className="card card-pad">
          <div className="shop-view">
            <div>
              <div className="section-title">Shop</div>
              <h2 className="mt-4" style={{ fontSize: 20 }}>{v.shopName}</h2>
              {v.description && <p className="muted mt-8">{v.description}</p>}
            </div>
            <dl className="kv">
              <dt><MapPin size={14} /> Address</dt><dd>{[v.address1, v.address2].filter(Boolean).join(', ') || '—'}<br />{[v.city, v.state, v.zip].filter(Boolean).join(', ')} {v.country}</dd>
              <dt><Phone size={14} /> Phone</dt><dd>{v.phone || '—'}{v.phone2 ? ` · ${v.phone2}` : ''}</dd>
              <dt><Mail size={14} /> Email</dt><dd>{v.email || '—'}</dd>
              <dt><Globe size={14} /> Website</dt><dd>{v.website || '—'}</dd>
            </dl>
          </div>
          <p className="xs subtle mt-16">Last updated by {v.updatedBy} · {v.updatedAt ? new Date(v.updatedAt).toLocaleString() : ''}</p>
        </div>
      )}
      <UnsavedBar dirty={editing && s.dirty} saving={s.saving} onSave={save} onDiscard={cancel} blocker={blocker} />
    </div>
  )
}

/* ---------------------------------------------------------------- Licenses */

const LICENSE_TYPES = [['license', 'License'], ['certification', 'Certification'], ['registration', 'Registration'], ['other', 'Other']]
const LICENSE_FIELDS = [
  { name: 'type', label: 'Type', type: 'segmented', options: LICENSE_TYPES, required: true, span: 2 },
  { name: 'name', label: 'Name', required: true, span: 2, placeholder: 'e.g. State Repair Shop License', autoFocus: true },
  { name: 'number', label: 'License / certificate number', placeholder: 'ABC123456' },
  { name: 'issuingOrg', label: 'Issuing organization', placeholder: 'e.g. Maryland MVA' },
  { name: 'issueDate', label: 'Issue date', type: 'date' },
  { name: 'expirationDate', label: 'Expiration date', type: 'date' },
  { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
]
const fmtDate = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString() : '—')

function expiryState(d) {
  if (!d) return null
  const days = Math.round((new Date(`${d}T12:00:00`) - Date.now()) / 86400000)
  if (days < 0) return { cls: 'badge-danger', text: 'Expired' }
  if (days <= 60) return { cls: 'badge-warning', text: `Expires in ${days} days` }
  return { cls: 'badge-success', text: 'Valid' }
}

export function Licenses() {
  const { list, reload, remove } = useList('licenses')
  const canEdit = useCanEdit('shop.edit')
  const [edit, setEdit] = useState(null)
  const [del, setDel] = useState(null)
  const [view, setView] = useState(null)
  const fileRef = useRef(null)
  const [uploadFor, setUploadFor] = useState(null)

  const upload = async (file) => {
    if (!file || !uploadFor) return
    if (file.size > 5 * 1024 * 1024) { toast.error('File too large', 'Maximum size is 5 MB.'); return }
    if (!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(file.type)) { toast.error('Unsupported file', 'Upload a PDF, PNG, JPG or WebP.'); return }
    const form = new FormData()
    form.append('file', file)
    try {
      await api(`/settings/licenses/${uploadFor.id}/document`, { method: 'POST', form })
      toast.success('Document uploaded', file.name)
      await reload()
    } catch (e) { toast.error('Upload failed', e.message) }
    finally { setUploadFor(null) }
  }
  const removeDoc = async (l) => {
    try { await api(`/settings/licenses/${l.id}/document`, { method: 'DELETE' }); toast.info('Document removed'); await reload() }
    catch (e) { toast.error('Could not remove document', e.message) }
  }

  return (
    <div className="stack gap-16">
      <SectionHead title="Licenses, Certifications & Registrations" description="Keep credentials and their expiration dates in one place. They can appear in document footers." perm="shop.edit"
        actions={<button className="btn btn-primary" onClick={() => setEdit({ type: 'license', name: '', number: '', issuingOrg: '', issueDate: '', expirationDate: '', notes: '' })}><Plus size={16} />Add License / Certification / Registration</button>} />
      <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hidden onChange={(e) => { upload(e.target.files[0]); e.target.value = '' }} />
      {list.length === 0 ? (
        <div className="card"><EmptyState icon={BadgeCheck} title="No credentials yet">Add your shop license, technician certifications and registrations.</EmptyState></div>
      ) : (
        <div className="cred-grid">
          {list.map((l) => {
            const st = expiryState(l.expirationDate)
            return (
              <div key={l.id} className="card cred-card">
                <div className="row between gap-8">
                  <span className="badge badge-brand">{LICENSE_TYPES.find(([k]) => k === l.type)?.[1]}</span>
                  {st && <span className={`badge ${st.cls}`}>{st.text === 'Expired' && <CalendarX size={12} />}{st.text}</span>}
                </div>
                <h3 className="mt-8">{l.name}</h3>
                <dl className="kv small mt-8">
                  <dt>Number</dt><dd className="mono">{l.number || '—'}</dd>
                  <dt>Issued by</dt><dd>{l.issuingOrg || '—'}</dd>
                  <dt>Issued</dt><dd>{fmtDate(l.issueDate)}</dd>
                  <dt>Expires</dt><dd>{fmtDate(l.expirationDate)}</dd>
                </dl>
                <div className="cred-doc">
                  {l.documentName ? (
                    <>
                      <FileText size={15} />
                      <button className="link-btn grow small" style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }} onClick={() => openFile(`/settings/licenses/${l.id}/document`).catch((e) => toast.error(e.message))}>{l.documentName}</button>
                      {canEdit && <button className="icon-btn sm" onClick={() => removeDoc(l)} aria-label="Remove document"><X size={14} /></button>}
                    </>
                  ) : <span className="xs subtle grow">No supporting document</span>}
                  {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => { setUploadFor(l); fileRef.current.click() }}><Upload size={14} />{l.documentName ? 'Replace' : 'Upload'}</button>}
                </div>
                <div className="row gap-4 mt-8" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setView(l)}><Eye size={14} />View</button>
                  {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => setEdit(l)}><Pencil size={14} />Edit</button>}
                  {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => setDel(l)}><Trash2 size={14} />Delete</button>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {edit && (
        <EntityModal title={edit.id ? 'Edit credential' : 'Add license / certification / registration'} fields={LICENSE_FIELDS}
          initial={pick(edit, LICENSE_FIELDS)} path="/settings/licenses" onSaved={reload} onClose={() => setEdit(null)} />
      )}
      {view && (
        <Modal open onClose={() => setView(null)} title={view.name} description={LICENSE_TYPES.find(([k]) => k === view.type)?.[1]}
          footer={<>{canEdit && <button className="btn btn-secondary" onClick={() => { setEdit(view); setView(null) }}><Pencil size={15} />Edit</button>}<button className="btn btn-primary" onClick={() => setView(null)}>Close</button></>}>
          <dl className="kv">
            <dt>Number</dt><dd className="mono">{view.number || '—'}</dd>
            <dt>Issuing organization</dt><dd>{view.issuingOrg || '—'}</dd>
            <dt>Issue date</dt><dd>{fmtDate(view.issueDate)}</dd>
            <dt>Expiration date</dt><dd>{fmtDate(view.expirationDate)}</dd>
            <dt>Document</dt><dd>{view.documentName ? <button className="link-btn" onClick={() => openFile(`/settings/licenses/${view.id}/document`).catch((e) => toast.error(e.message))}>{view.documentName}</button> : '—'}</dd>
            <dt>Notes</dt><dd style={{ whiteSpace: 'pre-wrap', fontWeight: 400 }}>{view.notes || '—'}</dd>
            <dt>Last updated</dt><dd style={{ fontWeight: 400 }}>{view.updatedBy} · {new Date(view.updatedAt).toLocaleString()}</dd>
          </dl>
        </Modal>
      )}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger confirmLabel="Delete" title={`Delete ${del?.name}?`} body="This removes the credential and its uploaded document." onConfirm={() => remove(del.id, del.name)} />
    </div>
  )
}

function pick(row, fields) {
  const out = row.id ? { id: row.id } : {}
  for (const f of fields) out[f.name] = row[f.name] ?? (f.type === 'switch' ? false : '')
  return out
}

/* ---------------------------------------------------------------- Staff */

const STAFF_BASE = [
  { name: 'firstName', label: 'First name', required: true, autoFocus: true },
  { name: 'lastName', label: 'Last name' },
  { name: 'displayName', label: 'Display name', required: true, hint: 'Shown on documents, e.g. TEE' },
  { name: 'employeeId', label: 'Employee ID' },
  { name: 'phone', label: 'Phone', type: 'tel' },
  { name: 'email', label: 'Email', type: 'email' },
]
const STAFF = {
  writers: {
    key: 'service-writers', title: 'Service Writers', singular: 'Service Writer', icon: UserCog,
    description: 'Service writers can be selected on customers, estimates, repair orders and invoices.',
    fields: [...STAFF_BASE, { name: 'active', label: 'Active', type: 'switch', hint: 'Inactive writers stay on past documents but can’t be newly assigned.' }, { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }],
  },
  technicians: {
    key: 'technicians', title: 'Technicians', singular: 'Technician', icon: Wrench,
    description: 'Technicians can be assigned to repair orders. Past documents keep the original technician.',
    fields: [...STAFF_BASE, { name: 'technicianId', label: 'Technician ID' }, { name: 'certification', label: 'Certification', placeholder: 'e.g. ASE Master' },
      { name: 'specialty', label: 'Skill / specialty', placeholder: 'e.g. Electrical, Diesel' }, { name: 'active', label: 'Active', type: 'switch', hint: 'Inactive technicians stay on past repair orders.' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }],
  },
}

export function StaffPage({ kind }) {
  const cfg = STAFF[kind]
  const { list, reload, remove, patchRow } = useList(cfg.key)
  const canEdit = useCanEdit('staff_settings.edit')
  const [edit, setEdit] = useState(null)
  const [del, setDel] = useState(null)
  const [showInactive, setShowInactive] = useState(true)
  const rows = list.filter((x) => showInactive || x.active)
  const blank = Object.fromEntries(cfg.fields.map((f) => [f.name, f.type === 'switch' ? true : '']))

  return (
    <div className="stack gap-16">
      <SectionHead title={cfg.title} description={cfg.description} perm="staff_settings.edit"
        actions={<button className="btn btn-primary" onClick={() => setEdit(blank)}><Plus size={16} />Add {cfg.singular}</button>} />
      <label className="row gap-8 small"><input type="checkbox" className="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />Show inactive</label>
      {rows.length === 0 ? (
        <div className="card"><EmptyState icon={cfg.icon} title={`No ${cfg.title.toLowerCase()} yet`}>Add your team so they can be assigned to documents.</EmptyState></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Display</th><th className="desktop-only">Employee ID</th>{kind === 'technicians' && <th className="desktop-only">Certification · Specialty</th>}<th className="desktop-only">Contact</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} style={{ opacity: p.active ? 1 : 0.6 }}>
                  <td className="strong">{p.firstName} {p.lastName}</td>
                  <td><span className="code-pill" style={{ fontSize: 12 }}>{p.displayName}</span></td>
                  <td className="desktop-only mono small">{p.employeeId || '—'}{kind === 'technicians' && p.technicianId ? ` · ${p.technicianId}` : ''}</td>
                  {kind === 'technicians' && <td className="desktop-only small">{[p.certification, p.specialty].filter(Boolean).join(' · ') || '—'}</td>}
                  <td className="desktop-only small muted">{p.phone || p.email || '—'}</td>
                  <td><span className={`badge ${p.active ? 'badge-success' : ''}`}>{p.active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    {canEdit && (
                      <span className="row gap-4" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => patchRow(p.id, { active: !p.active }, `${p.displayName} ${p.active ? 'deactivated' : 'reactivated'}`)}><Power size={14} />{p.active ? 'Deactivate' : 'Reactivate'}</button>
                        <button className="icon-btn sm" onClick={() => setEdit(p)} aria-label={`Edit ${p.displayName}`}><Pencil size={15} /></button>
                        <button className="icon-btn sm" onClick={() => setDel(p)} aria-label={`Delete ${p.displayName}`}><Trash2 size={15} /></button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <EntityModal title={edit.id ? `Edit ${cfg.singular.toLowerCase()}` : `Add ${cfg.singular.toLowerCase()}`} fields={cfg.fields} initial={pick(edit, cfg.fields)} path={`/settings/${cfg.key}`} onSaved={reload} onClose={() => setEdit(null)} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger confirmLabel="Delete" title={`Delete ${del?.displayName}?`}
        body="Staff on existing documents can't be deleted — deactivate them instead so history is preserved." onConfirm={() => remove(del.id, del.displayName)} />
    </div>
  )
}
