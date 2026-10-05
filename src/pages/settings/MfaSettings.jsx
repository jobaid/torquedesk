import { useEffect, useState } from 'react'
import { ShieldCheck, ShieldOff } from 'lucide-react'
import { SectionHead } from './kit'
import { api } from '../../lib/api'
import { toast } from '../../store/useApp'

export function MfaSettings() {
  const [enabled, setEnabled] = useState(false)
  const [available, setAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [setupData, setSetupData] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const refresh = async () => {
    setLoading(true)
    try {
      const res = await api('/me/mfa/status')
      setEnabled(res.enabled); setAvailable(res.available)
    } catch { /* ignore */ } finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  const start = async () => {
    setErr(''); setBusy(true)
    try { setSetupData(await api('/me/mfa/setup', { method: 'POST' })) }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const enable = async () => {
    setErr(''); setBusy(true)
    try {
      await api('/me/mfa/enable', { method: 'POST', body: { code } })
      setSetupData(null); setCode(''); setEnabled(true)
      toast.success('MFA enabled', 'You will be asked for a code next sign-in.')
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const disable = async () => {
    setErr(''); setBusy(true)
    try {
      await api('/me/mfa/disable', { method: 'POST', body: { code } })
      setCode(''); setEnabled(false)
      toast.success('MFA disabled')
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const qrURL = setupData ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(setupData.otpauthUrl)}` : null

  if (loading) return null
  if (!available) {
    return (
      <div className="stack gap-16">
        <SectionHead title="Two-factor authentication (MFA)" description="MFA is only available for shop accounts. Demo-mode sign-ins can't enable it." />
      </div>
    )
  }
  return (
    <div className="stack gap-16">
      <SectionHead title="Two-factor authentication (MFA)" description="Add a one-time code to your sign-in. Works with Google Authenticator, 1Password, Authy, Microsoft Authenticator." />
      <div className="card card-pad stack gap-12" style={{ maxWidth: 560 }}>
        <div className="row gap-8">
          {enabled ? <ShieldCheck size={18} color="#28a745" /> : <ShieldOff size={18} />}
          <div className="strong">{enabled ? 'MFA is enabled' : 'MFA is off'}</div>
        </div>

        {!enabled && !setupData && (
          <button className="btn btn-primary" onClick={start} disabled={busy}>{busy ? 'Starting…' : 'Enable MFA'}</button>
        )}

        {!enabled && setupData && (
          <div className="stack gap-12">
            <div className="row gap-16" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <img src={qrURL} alt="MFA QR code" width={180} height={180} style={{ background: '#fff', padding: 8, borderRadius: 6 }} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <div className="small">1. Scan the QR with your authenticator app.</div>
                <div className="small muted" style={{ margin: '6px 0 4px' }}>Or enter this secret manually:</div>
                <code style={{ display: 'block', padding: 8, background: 'var(--surface-sunken,#f3f4f6)', borderRadius: 4, wordBreak: 'break-all' }}>{setupData.secret}</code>
              </div>
            </div>
            <div className="small">2. Enter the 6-digit code shown by the app:</div>
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} inputMode="numeric"
              placeholder="123456" className="input" style={{ letterSpacing: 4, textAlign: 'center', fontSize: 18, maxWidth: 180 }} />
            <div className="row gap-8">
              <button className="btn btn-primary" onClick={enable} disabled={busy || code.length !== 6}>Confirm & enable</button>
              <button className="btn btn-secondary" onClick={() => { setSetupData(null); setCode('') }}>Cancel</button>
            </div>
          </div>
        )}

        {enabled && (
          <div className="stack gap-8">
            <div className="small">Enter a current code to disable:</div>
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} inputMode="numeric"
              placeholder="123456" className="input" style={{ letterSpacing: 4, textAlign: 'center', fontSize: 18, maxWidth: 180 }} />
            <div><button className="btn btn-danger" onClick={disable} disabled={busy || code.length !== 6}>Disable MFA</button></div>
          </div>
        )}

        {err && <div className="callout callout-danger" role="alert">{err}</div>}
      </div>
    </div>
  )
}
