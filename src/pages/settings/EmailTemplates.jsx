import { useEffect, useState } from 'react'
import { FileText, Save, RotateCcw, Eye, AlertCircle } from 'lucide-react'
import { SectionHead } from './kit'
import { api } from '../../lib/api'
import { toast } from '../../store/useApp'

// Shop email templates editor. Lists every tenant-scoped template kind and
// lets the shop customize subject / HTML / text. Falling back to the built-in
// default is always one click away (Revert to default).

export function EmailTemplates() {
  return <TemplatesPanel endpoint="/settings/email-templates" scope="tenant" />
}

export function TemplatesPanel({ endpoint, scope, intro }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState(null)
  const [err, setErr] = useState('')

  const load = async () => {
    setLoading(true); setErr('')
    try {
      const r = await api(endpoint)
      setList(Array.isArray(r) ? r : [])
      if (!sel && r?.length) setSel(r[0].kind)
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [endpoint])

  const current = list.find((t) => t.kind === sel)

  return (
    <div>
      <SectionHead
        title={scope === 'platform' ? 'Platform email templates' : 'Email templates'}
        description={intro || 'Customize the subject and body for each outgoing email. Leave a template untouched to use the built-in default.'}
      />
      {err && <div className="callout callout-danger" role="alert"><AlertCircle size={18} /><div>{err}</div></div>}
      {loading ? <div className="muted">Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {list.map((t) => (
              <button key={t.kind} type="button" onClick={() => setSel(t.kind)}
                style={{
                  textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid ' + (t.kind === sel ? '#2563eb' : '#e5e7eb'),
                  background: t.kind === sel ? '#eff6ff' : '#fff',
                  cursor: 'pointer', fontSize: 13,
                }}>
                <div style={{ fontWeight: 600, color: '#111' }}>{t.label}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  {t.isCustom ? (t.enabled ? 'Customized' : 'Customized · disabled') : 'Using default'}
                </div>
              </button>
            ))}
          </aside>
          {current ? <TemplateEditor template={current} endpoint={endpoint} onSaved={load} /> : null}
        </div>
      )}
    </div>
  )
}

function TemplateEditor({ template, endpoint, onSaved }) {
  const [subject, setSubject] = useState(template.subject || '')
  const [html, setHtml] = useState(template.html || '')
  const [text, setText] = useState(template.text || '')
  const [enabled, setEnabled] = useState(template.enabled)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('edit')

  useEffect(() => {
    setSubject(template.subject || '')
    setHtml(template.html || '')
    setText(template.text || '')
    setEnabled(template.enabled)
    setTab('edit')
  }, [template.kind])

  const save = async () => {
    setBusy(true)
    try {
      await api(`${endpoint}/${template.kind}`, { method: 'PUT', body: { subject, html, text, enabled } })
      toast.success('Template saved')
      onSaved()
    } catch (e) { toast.error('Save failed', e.message) }
    finally { setBusy(false) }
  }

  const revert = async () => {
    if (!confirm('Revert this template to the built-in default?')) return
    setBusy(true)
    try {
      await api(`${endpoint}/${template.kind}`, { method: 'DELETE' })
      toast.success('Reverted to default')
      onSaved()
    } catch (e) { toast.error('Revert failed', e.message) }
    finally { setBusy(false) }
  }

  const resetFromDefault = () => {
    setSubject(template.defaultSubject || '')
    setHtml(template.defaultHtml || '')
    setText(template.defaultText || '')
  }

  const preview = (s) => (template.placeholders || []).reduce((acc, p) => acc.replaceAll(`{{${p}}}`, `[${p}]`), s)

  return (
    <section className="card card-pad stack gap-10">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={18} color="#2563eb" />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{template.label}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{template.description}</div>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn btn-secondary" onClick={() => setTab('edit')} style={{ background: tab === 'edit' ? '#eff6ff' : undefined }}>Edit</button>
          <button className="btn btn-secondary" onClick={() => setTab('preview')} style={{ background: tab === 'preview' ? '#eff6ff' : undefined }}><Eye size={14} /> Preview</button>
        </div>
      </div>

      {template.placeholders?.length > 0 && (
        <div style={{ padding: '8px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }}>
          <strong>Placeholders:</strong>{' '}
          {template.placeholders.map((p) => (
            <code key={p} style={{ padding: '1px 6px', margin: 2, background: '#eef2ff', color: '#3730a3', borderRadius: 4 }}>{`{{${p}}}`}</code>
          ))}
        </div>
      )}

      {tab === 'edit' ? (
        <>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Subject</div>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>HTML body</div>
            <textarea className="input" rows={10} value={html} onChange={(e) => setHtml(e.target.value)}
              style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }} />
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Plain-text body (fallback for clients that don't render HTML)</div>
            <textarea className="input" rows={6} value={text} onChange={(e) => setText(e.target.value)}
              style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }} />
          </label>
          <label className="row gap-8" style={{ alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Use this customization (uncheck to send the built-in default instead)
          </label>
        </>
      ) : (
        <div>
          <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Subject</div>
          <div style={{ padding: '8px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 10 }}>{preview(subject)}</div>
          <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>HTML preview</div>
          <div style={{ padding: 14, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6 }} dangerouslySetInnerHTML={{ __html: preview(html) }} />
          <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', margin: '10px 0 4px' }}>Plain text preview</div>
          <pre style={{ padding: 10, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap' }}>{preview(text)}</pre>
        </div>
      )}

      <div className="row gap-8" style={{ justifyContent: 'space-between', marginTop: 6 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {template.isCustom && (
            <button className="btn btn-secondary" onClick={revert} disabled={busy} style={{ color: '#991b1b' }}>
              <RotateCcw size={14} /> Revert to default
            </button>
          )}
          <button className="btn btn-secondary" onClick={resetFromDefault} disabled={busy}>Load default into editor</button>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={busy}><Save size={14} /> {busy ? 'Saving…' : 'Save template'}</button>
      </div>
    </section>
  )
}
