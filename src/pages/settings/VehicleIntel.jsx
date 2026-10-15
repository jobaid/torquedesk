import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { SectionHead } from './kit'
import { CheckCircle2, AlertCircle, Plug, Trash2, Loader2, Info } from 'lucide-react'

// Vehicle Intelligence settings — CARFAX + parts merchant connections.
// Lives at /app/settings/general/vehicle-intel.

export function VehicleIntel() {
  const [loading, setLoading] = useState(true)
  const [providers, setProviders] = useState([])
  const [conns, setConns] = useState([])
  const [err, setErr] = useState('')

  const load = async () => {
    setLoading(true); setErr('')
    try {
      const [p, c] = await Promise.all([
        api('/vintel/providers'),
        api('/vintel/connections'),
      ])
      setProviders(p || [])
      setConns(c || [])
    } catch (e) {
      setErr(e?.message || 'Failed to load')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const byProvider = Object.fromEntries(conns.map(c => [c.provider, c]))
  const vhr = providers.filter(p => p.kind === 'vehicle_history')
  const parts = providers.filter(p => p.kind === 'parts_pricing')

  return (
    <div className="stack gap-24">
      <SectionHead title="Vehicle Intelligence & Parts Pricing"
        subtitle="Connect your authorized CARFAX and parts merchant accounts. Credentials are stored encrypted and never shown back to the UI." />

      {err && <div className="alert alert-danger">{err}</div>}
      {loading && <div className="row gap-8"><Loader2 className="spin" size={16} /> Loading…</div>}

      <section className="stack gap-12">
        <h3 style={{ margin: 0 }}>Vehicle history (CARFAX)</h3>
        <p className="muted xs" style={{ marginTop: -4 }}>
          Requires an authorized CARFAX Service Shops partnership. Contact CARFAX to obtain a Partner ID and API Key.
        </p>
        {vhr.map(p => (
          <ProviderCard key={p.provider} provider={p} conn={byProvider[p.provider]} onChanged={load} />
        ))}
      </section>

      <section className="stack gap-12">
        <h3 style={{ margin: 0 }}>Parts merchants</h3>
        <p className="muted xs" style={{ marginTop: -4 }}>
          PartsTech is the recommended aggregator (40+ suppliers in one API). Advance Auto Parts direct requires a commercial contract.
        </p>
        {parts.map(p => (
          <ProviderCard key={p.provider} provider={p} conn={byProvider[p.provider]} onChanged={load} />
        ))}
      </section>
    </div>
  )
}

function ProviderCard({ provider, conn, onChanged }) {
  const [open, setOpen] = useState(false)
  const [vals, setVals] = useState({ accountLabel: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const connected = conn && conn.status === 'connected'

  const connect = async () => {
    setBusy(true); setErr('')
    try {
      const creds = {}
      for (const f of provider.credentials) {
        if (f.required && !vals[f.key]) throw new Error('Missing ' + f.label)
        creds[f.key] = vals[f.key] || ''
      }
      await api('/vintel/connections/' + provider.provider, {
        method: 'POST',
        body: JSON.stringify({ accountLabel: vals.accountLabel || '', credentials: creds }),
      })
      setOpen(false); setVals({ accountLabel: '' })
      onChanged()
    } catch (e) {
      setErr(e?.message || 'Connect failed')
    } finally { setBusy(false) }
  }

  const disconnect = async () => {
    if (!window.confirm('Disconnect ' + provider.provider + '? Stored credentials will be removed.')) return
    setBusy(true); setErr('')
    try {
      await api('/vintel/connections/' + provider.provider, { method: 'DELETE' })
      onChanged()
    } catch (e) { setErr(e?.message || 'Failed') }
    finally { setBusy(false) }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
      <div className="row gap-12" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="row gap-8" style={{ alignItems: 'center' }}>
            <strong style={{ textTransform: 'capitalize' }}>{provider.provider}</strong>
            {connected
              ? <span className="row gap-4" style={{ color: '#16a34a' }}><CheckCircle2 size={14} /> Connected</span>
              : <span className="row gap-4" style={{ color: '#94a3b8' }}><AlertCircle size={14} /> Not connected</span>}
          </div>
          {conn?.accountLabel && <div className="xs muted">Account: {conn.accountLabel}</div>}
          {conn?.lastError && <div className="xs" style={{ color: '#dc2626' }}>Last error: {conn.lastError}</div>}
        </div>
        <div className="row gap-8">
          {connected
            ? <button className="btn btn-ghost danger" onClick={disconnect} disabled={busy}><Trash2 size={14} /> Disconnect</button>
            : <button className="btn btn-primary" onClick={() => setOpen(v => !v)} disabled={busy}><Plug size={14} /> Connect</button>}
        </div>
      </div>

      {open && !connected && (
        <div className="stack gap-8" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
          <div className="row gap-8" style={{ color: '#64748b' }}>
            <Info size={14} /><span className="xs">Credentials are encrypted at rest. Never shared with other shops.</span>
          </div>
          <label className="stack gap-4">
            <span className="xs">Account label (optional, shop-visible)</span>
            <input value={vals.accountLabel} onChange={e => setVals(v => ({ ...v, accountLabel: e.target.value }))} />
          </label>
          {provider.credentials.map(f => (
            <label key={f.key} className="stack gap-4">
              <span className="xs">{f.label}{f.required && ' *'}</span>
              <input
                type={f.secret ? 'password' : 'text'}
                autoComplete="off"
                value={vals[f.key] || ''}
                onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))}
              />
            </label>
          ))}
          {err && <div className="alert alert-danger xs">{err}</div>}
          <div className="row gap-8">
            <button className="btn btn-primary" onClick={connect} disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" /> : <Plug size={14} />} Save connection
            </button>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
