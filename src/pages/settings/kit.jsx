import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { AlertTriangle, Lock, Save, RotateCcw } from 'lucide-react'
import Modal, { ConfirmDialog } from '../../components/ui/Modal'
import { Field, Switch } from '../../components/ui'
import { useApp, toast } from '../../store/useApp'
import { useSettings } from '../../store/useSettings'
import { api, ApiError } from '../../lib/api'

/* ---------------------------------------------------------------- page chrome */

export function SectionHead({ title, description, actions, perm }) {
  const can = useApp((s) => s.can)
  const locked = perm && !can(perm)
  return (
    <div className="set-head">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="row gap-8 wrap">
        {locked && <span className="badge"><Lock size={12} />View only</span>}
        {!locked && actions}
      </div>
    </div>
  )
}

export function useCanEdit(perm) {
  return useApp((s) => s.can)(perm)
}

/* ---------------------------------------------------------------- unsaved changes */

/** Blocks in-app navigation and tab close while `dirty`. */
export function useUnsavedGuard(dirty) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!dirty) return
    const onUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])
  return blocker
}

export function UnsavedBar({ dirty, saving, onSave, onDiscard, blocker }) {
  return (
    <>
      {dirty && (
        <div className="unsaved-bar" role="status">
          <AlertTriangle size={18} />
          <span className="grow strong">You have unsaved changes.</span>
          <button className="btn btn-ghost btn-sm" onClick={onDiscard} disabled={saving}><RotateCcw size={15} />Discard changes</button>
          <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}><Save size={15} />{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      )}
      {blocker?.state === 'blocked' && (
        <Modal open onClose={() => blocker.reset()} title="Leave without saving?"
          footer={<>
            <button className="btn btn-secondary" onClick={() => blocker.reset()}>Stay on page</button>
            <button className="btn btn-ghost" onClick={() => { onDiscard(); blocker.proceed() }}>Discard & leave</button>
            <button className="btn btn-primary" data-autofocus onClick={async () => { if (await onSave()) blocker.proceed(); else blocker.reset() }}>Save & leave</button>
          </>}>
          <p className="muted">You have unsaved changes on this page.</p>
        </Modal>
      )}
    </>
  )
}

/**
 * Form state for a singleton settings resource (e.g. 'shop', 'document-options').
 * Saves with PUT /api/settings/<path>, maps validation errors to fields, logs to toast.
 * Pages pair it with one useUnsavedGuard(dirty) + <UnsavedBar>.
 */
export function useSectionForm(key, { path = key, perm, successMsg = 'Settings saved' } = {}) {
  const server = useSettings((s) => s.data?.[key])
  const patch = useSettings((s) => s.patch)
  const [form, setForm] = useState(server || {})
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const canEdit = useCanEdit(perm)

  useEffect(() => { setForm(server || {}) }, [server])
  const dirty = useMemo(() => Object.keys(form).some((k) => JSON.stringify(form[k]) !== JSON.stringify(server?.[k])), [form, server])

  const set = useCallback((k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })) }, [])
  const discard = useCallback(() => { setForm(server || {}); setErrors({}) }, [server])
  const save = useCallback(async () => {
    setSaving(true)
    try {
      const changed = Object.fromEntries(Object.keys(form).filter((k) => JSON.stringify(form[k]) !== JSON.stringify(server?.[k])).map((k) => [k, form[k]]))
      const row = await api(`/settings/${path}`, { method: 'PUT', body: changed })
      patch(key, row)
      setErrors({})
      toast.success(successMsg)
      return true
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.fields)
      toast.error('Could not save', e.message)
      return false
    } finally {
      setSaving(false)
    }
  }, [form, server, path, key, patch, successMsg])

  return { form, set, errors, dirty, saving, save, discard, canEdit, server }
}

/* ---------------------------------------------------------------- generic fields */

/**
 * Field config: { name, label, type: text|email|tel|url|number|date|select|textarea|switch|segmented,
 *   options: [[value,label]], required, hint, span, placeholder, step, prefix, suffix, show(form) }
 */
export function FormFields({ fields, form, set, errors, disabled }) {
  return (
    <div className="form-grid">
      {fields.filter((f) => !f.show || f.show(form)).map((f) => {
        const id = `ff-${f.name}`
        const err = errors?.[f.name]
        const v = form[f.name]
        const cls = f.span === 2 ? 'span-2' : ''
        if (f.type === 'switch') {
          return (
            <div key={f.name} className={`switch-row ${cls}`}>
              <div><label htmlFor={id} className="strong small">{f.label}</label>{f.hint && <div className="xs subtle">{f.hint}</div>}</div>
              <Switch id={id} checked={!!v} onChange={(x) => set(f.name, x)} label={f.label} />
            </div>
          )
        }
        let input
        if (f.type === 'select') {
          input = <select id={id} className="select" value={v ?? ''} onChange={(e) => set(f.name, e.target.value)} disabled={disabled}>{f.options.map(([o, l]) => <option key={o} value={o}>{l}</option>)}</select>
        } else if (f.type === 'segmented') {
          input = (
            <div className="segmented" role="radiogroup" aria-label={f.label}>
              {f.options.map(([o, l]) => <button type="button" key={o} role="radio" aria-checked={v === o} aria-pressed={v === o} onClick={() => set(f.name, o)} disabled={disabled}>{l}</button>)}
            </div>
          )
        } else if (f.type === 'textarea') {
          input = <textarea id={id} className={`textarea${err ? ' invalid' : ''}`} rows={f.rows || 3} value={v ?? ''} onChange={(e) => set(f.name, e.target.value)} placeholder={f.placeholder} disabled={disabled} maxLength={f.max} />
        } else {
          const isNum = f.type === 'number'
          input = (
            <div className="input-wrap">
              {f.prefix && <span className="input-prefix">{f.prefix}</span>}
              <input
                id={id}
                type={isNum ? 'text' : f.type || 'text'}
                inputMode={isNum ? 'decimal' : undefined}
                className={`input${isNum ? ' num' : ''}${err ? ' invalid' : ''}`}
                style={{ paddingLeft: f.prefix ? 28 : 12, paddingRight: f.suffix ? 44 : 12 }}
                value={v ?? ''}
                onChange={(e) => set(f.name, isNum ? e.target.value.replace(/[^\d.]/g, '') : e.target.value)}
                placeholder={f.placeholder}
                disabled={disabled}
                maxLength={f.max}
                data-autofocus={f.autoFocus || undefined}
              />
              {f.suffix && <span className="input-suffix">{f.suffix}</span>}
            </div>
          )
        }
        return <Field key={f.name} label={f.label} required={f.required} htmlFor={id} error={err} hint={f.hint} className={cls}>{input}</Field>
      })}
    </div>
  )
}

/** Converts numeric-string form values to numbers / null before sending. */
export function toPayload(form, fields) {
  const out = {}
  for (const f of fields) {
    if (!(f.name in form)) continue
    let v = form[f.name]
    if (f.type === 'number') v = v === '' || v == null ? (f.nullable ? null : 0) : Number(v)
    if (f.type === 'date' && v === '') v = null
    out[f.name] = v
  }
  return out
}

/* ---------------------------------------------------------------- list CRUD */

/**
 * Create / edit modal for a list resource. Warns before discarding edits.
 * Required fields are checked client-side; the API validates everything again.
 */
export function EntityModal({ title, fields, initial, path, onSaved, onClose, footerExtra }) {
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })) }

  const submit = async (e) => {
    e?.preventDefault()
    const missing = {}
    for (const f of fields) {
      if (f.required && (!f.show || f.show(form)) && (form[f.name] === '' || form[f.name] == null)) missing[f.name] = `${f.label} is required.`
    }
    if (Object.keys(missing).length) { setErrors(missing); return }
    setSaving(true)
    try {
      const body = toPayload(form, fields)
      const row = initial.id ? await api(`${path}/${initial.id}`, { method: 'PUT', body }) : await api(path, { method: 'POST', body })
      toast.success(initial.id ? 'Saved' : 'Added', row.name || row.displayName || '')
      onSaved(row)
      onClose()
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields)
      toast.error('Could not save', err.message)
    } finally {
      setSaving(false)
    }
  }
  const tryClose = () => (dirty ? setConfirmClose(true) : onClose())

  return (
    <>
      <Modal open onClose={tryClose} title={title} size="lg"
        footer={<>{footerExtra}<button className="btn btn-secondary" onClick={tryClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={saving}><Save size={16} />{saving ? 'Saving…' : 'Save'}</button></>}>
        <form onSubmit={submit} noValidate>
          <FormFields fields={fields} form={form} set={set} errors={errors} />
          <button type="submit" hidden />
        </form>
      </Modal>
      <ConfirmDialog open={confirmClose} onClose={() => setConfirmClose(false)} onConfirm={onClose} title="Discard changes?" body="You have unsaved changes in this form." confirmLabel="Discard" danger />
    </>
  )
}

/** Loads a list from the settings bundle and offers refresh/remove helpers. */
export function useList(key, path = key) {
  const list = useSettings((s) => s.data?.[key]) || []
  const reloadList = useSettings((s) => s.reloadList)
  const reload = () => reloadList(key, path)
  const remove = async (id, label) => {
    try {
      await api(`/settings/${path}/${id}`, { method: 'DELETE' })
      toast.success('Deleted', label)
      await reload()
    } catch (e) {
      toast.error('Could not delete', e.message)
    }
  }
  const patchRow = async (id, body, msg) => {
    try {
      await api(`/settings/${path}/${id}`, { method: 'PATCH', body })
      if (msg) toast.success(msg)
      await reload()
    } catch (e) {
      toast.error('Could not update', e.message)
    }
  }
  return { list, reload, remove, patchRow }
}

export const money2 = (n) => (n == null || n === '' ? '—' : `$${Number(n).toFixed(2)}`)
