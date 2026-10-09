import { useEffect, useState } from 'react'
import { FileText, Save, RotateCcw, Eye } from 'lucide-react'
import { Card, PageHeader, Btn, Field, Input } from './primitives'
import { ownerApi } from '../../store/useOwner'

// Platform-level email templates editor. The SaaS owner can rewrite the
// subject / HTML / text for every email the platform mailer sends
// (welcome, status change, subscription updates). Reverting a template is
// one click away — it falls back to the built-in default in the Go binary.

export default function PlatformTemplates() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState(null)
  const [err, setErr] = useState('')

  const load = async () => {
    setLoading(true); setErr('')
    try {
      const r = await ownerApi('/mail/templates')
      setList(Array.isArray(r) ? r : [])
      if (!sel && r?.length) setSel(r[0].kind)
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const current = list.find((t) => t.kind === sel)

  return (
    <div>
      <PageHeader
        title="Platform Email Templates"
        subtitle="Customize the welcome, status-change, and subscription emails that the platform sends to shop owners. Revert to default any time."
      />
      {err && <div style={{ padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13, background: 'rgba(220,53,69,0.12)', border: '1px solid rgba(220,53,69,0.35)', color: '#fda1aa' }}>{err}</div>}
      {loading ? <div style={{ color: '#8da2bf' }}>Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {list.map((t) => (
              <button key={t.kind} type="button" onClick={() => setSel(t.kind)}
                style={{
                  textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid ' + (t.kind === sel ? '#5b8def' : '#1e2a44'),
                  background: t.kind === sel ? 'rgba(91,141,239,.1)' : '#111a2b',
                  color: '#e5edf5', cursor: 'pointer', fontSize: 13,
                }}>
                <div style={{ fontWeight: 600 }}>{t.label}</div>
                <div style={{ fontSize: 11, color: '#8da2bf', marginTop: 2 }}>
                  {t.isCustom ? (t.enabled ? 'Customized' : 'Customized · disabled') : 'Using default'}
                </div>
              </button>
            ))}
          </aside>
          {current && <TemplateEditor template={current} onSaved={load} />}
        </div>
      )}
    </div>
  )
}

function TemplateEditor({ template, onSaved }) {
  const [subject, setSubject] = useState('')
  const [html, setHtml] = useState('')
  const [text, setText] = useState('')
  const [enabled, setEnabled] = useState(true)
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
      await ownerApi(`/mail/templates/${template.kind}`, { method: 'PUT', body: { subject, html, text, enabled } })
      onSaved()
    } finally { setBusy(false) }
  }
  const revert = async () => {
    if (!confirm('Revert this template to the built-in default?')) return
    setBusy(true)
    try {
      await ownerApi(`/mail/templates/${template.kind}`, { method: 'DELETE' })
      onSaved()
    } finally { setBusy(false) }
  }
  const resetFromDefault = () => {
    setSubject(template.defaultSubject || '')
    setHtml(template.defaultHtml || '')
    setText(template.defaultText || '')
  }
  const preview = (s) => (template.placeholders || []).reduce((acc, p) => acc.replaceAll(`{{${p}}}`, `[${p}]`), s)

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <FileText size={18} color="#5b8def" />
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{template.label}</div>
          <div style={{ fontSize: 11, color: '#8da2bf' }}>{template.description}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <Btn variant="secondary" onClick={() => setTab('edit')} style={{ background: tab === 'edit' ? 'rgba(91,141,239,.1)' : undefined }}>Edit</Btn>
          <Btn variant="secondary" onClick={() => setTab('preview')} style={{ background: tab === 'preview' ? 'rgba(91,141,239,.1)' : undefined }}><Eye size={14} /> Preview</Btn>
        </div>
      </div>

      {template.placeholders?.length > 0 && (
        <div style={{ padding: '8px 10px', background: '#0b1220', border: '1px solid #1e2a44', borderRadius: 6, fontSize: 12, color: '#c5d2e1', marginBottom: 12 }}>
          <strong>Placeholders:</strong>{' '}
          {template.placeholders.map((p) => (
            <code key={p} style={{ padding: '1px 6px', margin: 2, background: '#1e2a44', color: '#93c5fd', borderRadius: 4 }}>{`{{${p}}}`}</code>
          ))}
        </div>
      )}

      {tab === 'edit' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <Field label="Subject">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="HTML body">
            <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={10}
              style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid #2a3650', background: '#0b1220', color: '#e5edf5', fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace' }} />
          </Field>
          <Field label="Plain-text body">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6}
              style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid #2a3650', background: '#0b1220', color: '#e5edf5', fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace' }} />
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#c5d2e1' }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Use this customization (uncheck to send the built-in default instead)
          </label>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 11, color: '#8da2bf', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Subject</div>
          <div style={{ padding: '8px 10px', background: '#0b1220', border: '1px solid #1e2a44', borderRadius: 6, color: '#c5d2e1', marginBottom: 10 }}>{preview(subject)}</div>
          <div style={{ fontSize: 11, color: '#8da2bf', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>HTML preview</div>
          <div style={{ padding: 14, background: '#fff', color: '#111', border: '1px solid #1e2a44', borderRadius: 6 }} dangerouslySetInnerHTML={{ __html: preview(html) }} />
          <div style={{ fontSize: 11, color: '#8da2bf', textTransform: 'uppercase', letterSpacing: '.05em', margin: '10px 0 4px' }}>Plain text preview</div>
          <pre style={{ padding: 10, background: '#0b1220', border: '1px solid #1e2a44', borderRadius: 6, fontSize: 12, color: '#c5d2e1', whiteSpace: 'pre-wrap' }}>{preview(text)}</pre>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {template.isCustom && <Btn variant="danger" onClick={revert} disabled={busy}><RotateCcw size={14} /> Revert to default</Btn>}
          <Btn variant="secondary" onClick={resetFromDefault} disabled={busy}>Load default into editor</Btn>
        </div>
        <Btn onClick={save} disabled={busy}><Save size={14} /> {busy ? 'Saving…' : 'Save template'}</Btn>
      </div>
    </Card>
  )
}
