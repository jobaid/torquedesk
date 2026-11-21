import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck, ShieldOff, Activity, AlertTriangle, RotateCcw, Save, Download, Search, Ban, LogOut, CheckCircle2, Info } from 'lucide-react'
import { ownerApi, useOwner } from '../../store/useOwner'
import { Card, Btn, Input, Select, PageHeader, Th, Td } from './primitives'

// SaaS Owner → Security & UI Protection.
// Every protection has its own toggle; page overrides refine UI protections
// per screen; the master switch pauses browser deterrence only — backend
// auth, tenant isolation, rate limits and CSP are never affected.

const fmt = (d) => (d ? new Date(d).toLocaleString() : '—')

function Switch({ checked, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 44, height: 24, borderRadius: 999, border: 0, padding: 2, flexShrink: 0,
        background: checked ? '#16a34a' : '#cbd5e1', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1, transition: 'background .15s',
      }}>
      <span style={{ display: 'block', width: 20, height: 20, borderRadius: '50%', background: '#fff',
        transform: `translateX(${checked ? 20 : 0}px)`, transition: 'transform .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
    </button>
  )
}

const pill = (on) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
  background: on ? '#dcfce7' : '#f1f5f9', color: on ? '#166534' : '#475569',
})

export default function SecuritySettings() {
  const [tab, setTab] = useState('protection')
  const [data, setData] = useState(null)
  const [draft, setDraft] = useState(null)
  const [summary, setSummary] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const fromServer = (d) => ({
    master: { enabled: d.master.enabled, refreshSeconds: d.master.refreshSeconds },
    features: Object.fromEntries(d.features.map((f) => [f.key, f.enabled])),
    watermark: { ...d.watermark },
    overrides: JSON.parse(JSON.stringify(d.overrides || {})),
  })

  const load = async () => {
    setErr('')
    try {
      const [d, s] = await Promise.all([ownerApi('/security/settings'), ownerApi('/security/summary').catch(() => null)])
      setData(d); setDraft(fromServer(d)); setSummary(s)
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [])

  const original = useMemo(() => (data ? fromServer(data) : null), [data])
  const dirty = !!(draft && original && JSON.stringify(draft) !== JSON.stringify(original))

  const save = async () => {
    setBusy(true); setErr(''); setMsg('')
    try {
      // Send overrides as a diff so removed cells become null (inherit).
      const overrides = {}
      const pages = new Set([...Object.keys(original.overrides), ...Object.keys(draft.overrides)])
      pages.forEach((p) => {
        const a = original.overrides[p] || {}
        const b = draft.overrides[p] || {}
        new Set([...Object.keys(a), ...Object.keys(b)]).forEach((k) => {
          if (a[k] !== b[k]) {
            overrides[p] = overrides[p] || {}
            overrides[p][k] = b[k] === undefined ? null : b[k]
          }
        })
      })
      const d = await ownerApi('/security/settings', {
        method: 'PUT',
        body: { master: draft.master, features: draft.features, watermark: draft.watermark, overrides },
      })
      setData(d); setDraft(fromServer(d))
      setMsg('Saved. Open sessions pick up the change within their refresh interval.')
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const reset = async () => {
    if (!confirm('Reset every security setting and page override to the defaults?')) return
    setBusy(true); setErr(''); setMsg('')
    try {
      const d = await ownerApi('/security/settings/reset', { method: 'POST' })
      setData(d); setDraft(fromServer(d)); setMsg('Restored defaults.')
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (err && !data) return <Card style={{ color: '#b91c1c' }}>{err}</Card>
  if (!data || !draft) return <Card>Loading security settings…</Card>

  const ui = data.features.filter((f) => f.kind === 'ui')
  const mon = data.features.filter((f) => f.kind === 'monitor')
  const uiOn = ui.filter((f) => draft.features[f.key]).length
  const monOn = mon.filter((f) => draft.features[f.key]).length
  const setFeature = (k, v) => setDraft((d) => ({ ...d, features: { ...d.features, [k]: v } }))

  return (
    <div style={{ maxWidth: 1180 }}>
      <PageHeader title="Security & UI Protection"
        subtitle="Every protection has its own switch. Changes save to the database and reach open sessions without a redeploy."
        actions={tab === 'protection' && <>
          <Btn variant="secondary" onClick={reset} disabled={busy}><RotateCcw size={14} />Reset to default</Btn>
          <Btn onClick={save} disabled={busy || !dirty}><Save size={14} />{busy ? 'Saving…' : 'Save changes'}</Btn>
        </>} />

      {/* Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Stat icon={draft.master.enabled ? ShieldCheck : ShieldOff} tone={draft.master.enabled ? 'green' : 'gray'}
          label="Master switch" value={draft.master.enabled ? 'Protections ON' : 'Deterrence paused'} />
        <Stat icon={ShieldCheck} tone="blue" label="UI protections" value={`${uiOn} of ${ui.length} enabled`} />
        <Stat icon={Activity} tone="blue" label="Events (24h)" value={summary ? summary.last24h : '—'} sub={summary ? `${summary.last7d} in 7 days` : ''} />
        <Stat icon={AlertTriangle} tone={summary?.high24h ? 'red' : 'gray'} label="High severity (24h)" value={summary ? summary.high24h : '—'} sub={`${monOn} of ${mon.length} monitors on`} />
      </div>

      <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', marginBottom: 16 }}>
        {[['protection', 'Protection settings'], ['events', 'Security events']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            style={{ padding: '10px 14px', border: 0, background: 'transparent', cursor: 'pointer', fontSize: 14,
              fontWeight: tab === k ? 700 : 500, color: tab === k ? '#2554f5' : '#334155',
              borderBottom: `2px solid ${tab === k ? '#2554f5' : 'transparent'}`, marginBottom: -1 }}>{l}</button>
        ))}
      </div>

      {err && <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {msg && <div style={{ padding: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 8, fontSize: 13, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}><CheckCircle2 size={15} />{msg}</div>}

      {tab === 'events' ? <EventsPanel /> : (
        <>
          {/* Master */}
          <Card style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 320px' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Master Security Switch</div>
              <div style={{ fontSize: 13, color: '#475569', marginTop: 4, lineHeight: 1.5 }}>
                OFF temporarily pauses all browser deterrence (watermark, copy, screenshot, print…). Authentication, authorization,
                tenant isolation, rate limiting, CSP and monitoring stay active regardless.
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              Refresh open sessions every
              <Input type="number" min={15} max={3600} value={draft.master.refreshSeconds} style={{ width: 80 }}
                onChange={(e) => setDraft((d) => ({ ...d, master: { ...d.master, refreshSeconds: Number(e.target.value) || 60 } }))} />
              s
            </label>
            <Switch label="Master security switch" checked={draft.master.enabled}
              onChange={(v) => setDraft((d) => ({ ...d, master: { ...d.master, enabled: v } }))} />
            <div style={{ fontSize: 11, color: '#64748b', width: '100%' }}>
              Last updated {fmt(data.master.updatedAt)}{data.master.updatedBy ? ` by ${data.master.updatedBy}` : ''}
            </div>
          </Card>

          <FeatureGroup title="Browser deterrence (per page)" note="Best-effort: a browser cannot fully prevent OS screenshots, external recorders or developer tools. These deter and log; they never punish automatically."
            features={ui} draft={draft} data={data} setFeature={setFeature} masterOff={!draft.master.enabled} />

          {draft.features.dynamic_watermark && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Watermark appearance</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
                <Range label="Transparency" min={0.02} max={0.4} step={0.01} value={draft.watermark.opacity} fmt={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => setDraft((d) => ({ ...d, watermark: { ...d.watermark, opacity: v } }))} />
                <Range label="Font size" min={8} max={40} step={1} value={draft.watermark.fontSize} fmt={(v) => `${v}px`}
                  onChange={(v) => setDraft((d) => ({ ...d, watermark: { ...d.watermark, fontSize: v } }))} />
                <Range label="Rotation" min={-90} max={90} step={1} value={draft.watermark.rotation} fmt={(v) => `${v}°`}
                  onChange={(v) => setDraft((d) => ({ ...d, watermark: { ...d.watermark, rotation: v } }))} />
                <label style={{ fontSize: 12 }}>
                  <div style={{ marginBottom: 4, fontWeight: 600 }}>Position</div>
                  <Select value={draft.watermark.position} onChange={(e) => setDraft((d) => ({ ...d, watermark: { ...d.watermark, position: e.target.value } }))}>
                    <option value="tiled">Tiled across screen</option>
                    <option value="center">Center</option>
                    <option value="bottom-right">Bottom right</option>
                  </Select>
                </label>
                <label style={{ fontSize: 12 }}>
                  <div style={{ marginBottom: 4, fontWeight: 600 }}>Update every (s)</div>
                  <Input type="number" min={10} max={3600} value={draft.watermark.refreshSeconds}
                    onChange={(e) => setDraft((d) => ({ ...d, watermark: { ...d.watermark, refreshSeconds: Number(e.target.value) || 60 } }))} />
                </label>
              </div>
              <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 10 }}>
                Shows: “Fixora ERP”, signed-in user, tenant ID, date/time and a non-secret session tag. Never passwords, tokens or customer data.
              </div>
            </Card>
          )}

          <PageMatrix data={data} draft={draft} setDraft={setDraft} />

          <FeatureGroup title="Monitoring & logging (global)" note="Backend features. Not affected by the master switch or page overrides."
            features={mon} draft={draft} data={data} setFeature={setFeature} />
        </>
      )}
    </div>
  )
}

function Stat({ icon: Icon, label, value, sub, tone }) {
  const c = { green: ['#dcfce7', '#16a34a'], blue: ['#dbeafe', '#2554f5'], red: ['#fee2e2', '#dc2626'], gray: ['#f1f5f9', '#64748b'] }[tone]
  return (
    <Card style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: c[0], color: c[1], display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon size={19} /></div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{value}</div>
        {sub && <div style={{ fontSize: 11.5, color: '#64748b' }}>{sub}</div>}
      </div>
    </Card>
  )
}

function Range({ label, value, min, max, step, onChange, fmt: f }) {
  return (
    <label style={{ fontSize: 12 }}>
      <div style={{ marginBottom: 4, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}><span>{label}</span><span style={{ color: '#64748b' }}>{f(value)}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%' }} />
    </label>
  )
}

function FeatureGroup({ title, note, features, draft, data, setFeature, masterOff }) {
  const meta = Object.fromEntries(data.features.map((f) => [f.key, f]))
  return (
    <Card style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 4, display: 'flex', gap: 6 }}><Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />{note}</div>
      </div>
      {features.map((f) => {
        const on = !!draft.features[f.key]
        const m = meta[f.key]
        return (
          <div key={f.key} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px', minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{f.label}</span>
                <span style={pill(on && !masterOff)}>{on ? (masterOff ? 'Paused' : 'Enabled') : 'Disabled'}</span>
              </div>
              <div style={{ fontSize: 12.5, color: '#475569', marginTop: 3, lineHeight: 1.45 }}>{f.description}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                {m.updatedAt ? `Updated ${fmt(m.updatedAt)}${m.updatedBy ? ` by ${m.updatedBy}` : ''}` : `Default (${f.default ? 'on' : 'off'})`}
              </div>
            </div>
            <Switch label={f.label} checked={on} onChange={(v) => setFeature(f.key, v)} />
          </div>
        )
      })}
    </Card>
  )
}

function PageMatrix({ data, draft, setDraft }) {
  const ui = data.features.filter((f) => f.kind === 'ui')
  const cycle = (page, key) => setDraft((d) => {
    const cur = d.overrides[page]?.[key]
    const next = cur === undefined ? true : cur === true ? false : undefined
    const pageMap = { ...(d.overrides[page] || {}) }
    if (next === undefined) delete pageMap[key]; else pageMap[key] = next
    return { ...d, overrides: { ...d.overrides, [page]: pageMap } }
  })
  return (
    <Card style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Page-level overrides</div>
        <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 4, lineHeight: 1.5 }}>
          Click a cell to cycle <b>Inherit → On → Off</b>. Priority: master switch OFF disables everything → a page override wins over the global setting → otherwise the global setting applies.
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
          <thead>
            <tr>
              <Th>Page</Th>
              {ui.map((f) => <Th key={f.key}><span style={{ whiteSpace: 'nowrap' }}>{f.label.replace(' Restriction', '').replace(' Deterrence', '')}</span></Th>)}
            </tr>
          </thead>
          <tbody>
            {data.pages.map((p) => (
              <tr key={p.key}>
                <Td bold style={{ whiteSpace: 'nowrap' }}>{p.label}</Td>
                {ui.map((f) => {
                  const ov = draft.overrides[p.key]?.[f.key]
                  const eff = draft.master.enabled && (ov === undefined ? !!draft.features[f.key] : ov)
                  return (
                    <Td key={f.key}>
                      <button type="button" onClick={() => cycle(p.key, f.key)}
                        aria-label={`${p.label} – ${f.label}: ${ov === undefined ? 'inherit' : ov ? 'on' : 'off'}`}
                        title={ov === undefined ? `Inherits global (${eff ? 'on' : 'off'})` : 'Page override'}
                        style={{
                          minWidth: 64, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11.5, fontWeight: 700,
                          border: ov === undefined ? '1px dashed #cbd5e1' : '1px solid transparent',
                          background: ov === undefined ? '#fff' : ov ? '#dcfce7' : '#f1f5f9',
                          color: ov === undefined ? (eff ? '#16a34a' : '#94a3b8') : ov ? '#166534' : '#475569',
                        }}>
                        {ov === undefined ? (eff ? 'inherit ✓' : 'inherit') : ov ? 'On' : 'Off'}
                      </button>
                    </Td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

const EVENT_TYPES = ['login_success', 'login_failed', 'brute_force_suspected', 'multiple_login', 'screenshot_attempt',
  'screen_capture_started', 'devtools_opened', 'inspection_shortcut', 'print_attempt', 'copy_attempt', 'right_click',
  'sessions_revoked', 'account_suspended', 'account_reactivated']

function EventsPanel() {
  const [f, setF] = useState({ ip: '', company: '', user: '', type: '', severity: '' })
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const qs = () => new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString()

  const load = async () => {
    setErr('')
    try { setRows(await ownerApi('/security/events?' + qs())) } catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [])

  const exportCsv = async () => {
    const token = useOwner.getState().owner?.token
    const res = await fetch(`/api/owner/security/events?format=csv&limit=5000&${qs()}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) { setErr('Export failed.'); return }
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url; a.download = `fixora-security-events-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const act = async (path, body, confirmText, done) => {
    if (!confirm(confirmText)) return
    setErr(''); setNote('')
    try { await ownerApi(path, { method: 'POST', body }); setNote(done); load() } catch (e) { setErr(e.message) }
  }

  const sev = { high: ['#fee2e2', '#b91c1c'], warning: ['#fef3c7', '#92400e'], info: ['#f1f5f9', '#475569'] }

  return (
    <>
      <Card style={{ marginBottom: 12 }}>
        <form onSubmit={(e) => { e.preventDefault(); load() }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Input placeholder="IP address" value={f.ip} onChange={(e) => setF({ ...f, ip: e.target.value })} aria-label="Filter by IP" />
          <Input placeholder="Tenant name or ID" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} aria-label="Filter by tenant" />
          <Input placeholder="User email" value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })} aria-label="Filter by user" />
          <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} aria-label="Filter by event">
            <option value="">All events</option>
            {EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </Select>
          <Select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })} aria-label="Filter by severity">
            <option value="">All severities</option>
            <option value="high">High</option><option value="warning">Warning</option><option value="info">Info</option>
          </Select>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn type="submit"><Search size={14} />Search</Btn>
            <Btn type="button" variant="secondary" onClick={exportCsv}><Download size={14} />CSV</Btn>
          </div>
        </form>
      </Card>
      {err && <div style={{ padding: 10, background: '#fef2f2', color: '#991b1b', borderRadius: 8, fontSize: 13, marginBottom: 10 }}>{err}</div>}
      {note && <div style={{ padding: 10, background: '#f0fdf4', color: '#166534', borderRadius: 8, fontSize: 13, marginBottom: 10 }}>{note}</div>}
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
        Detections from the browser are signals, not proof. Nothing is suspended automatically — review before acting.
      </div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 980 }}>
            <thead><tr><Th>Time</Th><Th>Event</Th><Th>User</Th><Th>Tenant</Th><Th>IP / Country</Th><Th>Browser</Th><Th>Page</Th><Th right>Actions</Th></tr></thead>
            <tbody>
              {rows === null && <tr><Td>Loading…</Td></tr>}
              {rows?.length === 0 && <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>No events match these filters.</td></tr>}
              {rows?.map((e) => (
                <tr key={e.id}>
                  <Td style={{ whiteSpace: 'nowrap' }}>{fmt(e.createdAt)}</Td>
                  <Td>
                    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: sev[e.severity][0], color: sev[e.severity][1] }}>
                      {e.type.replace(/_/g, ' ')}
                    </span>
                  </Td>
                  <Td>{e.email || <span style={{ color: '#94a3b8' }}>anonymous</span>}</Td>
                  <Td>{e.companyName || (e.companyId ? e.companyId.slice(0, 8) : <span style={{ color: '#94a3b8' }}>platform</span>)}</Td>
                  <Td style={{ whiteSpace: 'nowrap' }}>{e.ip || '—'}{e.country ? ` · ${e.country}` : ''}</Td>
                  <Td style={{ whiteSpace: 'nowrap' }}>{[e.browser, e.os].filter(Boolean).join(' / ') || '—'}</Td>
                  <Td>{e.page || '—'}</Td>
                  <Td right>
                    {e.email && (
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <Btn variant="secondary" style={{ padding: '4px 8px', fontSize: 12 }} title="Sign this user out everywhere"
                          onClick={() => act('/security/sessions/revoke', { email: e.email, companyId: e.companyId },
                            `Sign ${e.email} out of every session?`, `Sessions revoked for ${e.email}.`)}>
                          <LogOut size={13} />Revoke
                        </Btn>
                        {e.companyId && (
                          <Btn variant="danger" style={{ padding: '4px 8px', fontSize: 12 }} title="Disable this shop account"
                            onClick={() => act('/security/accounts/suspend', { email: e.email, companyId: e.companyId, suspend: true },
                              `Temporarily suspend ${e.email}? They are signed out and cannot log in until reactivated.`, `${e.email} suspended.`)}>
                            <Ban size={13} />Suspend
                          </Btn>
                        )}
                        {e.companyId && e.type === 'account_suspended' && (
                          <Btn variant="secondary" style={{ padding: '4px 8px', fontSize: 12 }}
                            onClick={() => act('/security/accounts/suspend', { email: e.email, companyId: e.companyId, suspend: false },
                              `Reactivate ${e.email}?`, `${e.email} reactivated.`)}>
                            Reactivate
                          </Btn>
                        )}
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
