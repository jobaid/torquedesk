import { useEffect, useState } from 'react'
import { ShieldCheck, ShieldOff } from 'lucide-react'
import { ownerApi } from '../../store/useOwner'

export default function MfaCard() {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [setupData, setSetupData] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const refresh = async () => {
    setLoading(true)
    try {
      const res = await ownerApi('/mfa/status')
      setEnabled(res.enabled)
    } catch { /* ignore */ } finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  const startSetup = async () => {
    setMsg(''); setBusy(true)
    try {
      const res = await ownerApi('/mfa/setup', { method: 'POST' })
      setSetupData(res)
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  const enable = async () => {
    setMsg(''); setBusy(true)
    try {
      await ownerApi('/mfa/enable', { method: 'POST', body: { code } })
      setSetupData(null); setCode(''); setEnabled(true); setMsg('MFA enabled.')
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  const disable = async () => {
    setMsg(''); setBusy(true)
    try {
      await ownerApi('/mfa/disable', { method: 'POST', body: { code } })
      setCode(''); setEnabled(false); setMsg('MFA disabled.')
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }

  const qrURL = setupData ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(setupData.otpauthUrl)}` : null

  if (loading) return null
  return (
    <div style={{ background: '#111a2b', padding: 16, borderRadius: 8, border: '1px solid #26324a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        {enabled ? <ShieldCheck size={18} color="#4ade80" /> : <ShieldOff size={18} color="#8da2bf" />}
        <div style={{ fontSize: 15, fontWeight: 600, color: '#e5edf5' }}>Two-factor authentication (MFA)</div>
      </div>
      <div style={{ fontSize: 12, color: '#8da2bf', marginBottom: 12 }}>
        {enabled
          ? 'MFA is active. On sign-in you will be asked for a 6-digit code from your authenticator app.'
          : 'Add a one-time code to your sign-in. Compatible with Google Authenticator, 1Password, Authy, Microsoft Authenticator.'}
      </div>

      {!enabled && !setupData && (
        <button type="button" onClick={startSetup} disabled={busy}
          style={{ padding: '8px 12px', background: '#4f8cff', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>
          {busy ? 'Starting…' : 'Enable MFA'}
        </button>
      )}

      {!enabled && setupData && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <img src={qrURL} alt="MFA QR code" width={180} height={180} style={{ background: '#fff', padding: 8, borderRadius: 6 }} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 12, color: '#c5d2e1', marginBottom: 4 }}>1. Scan the QR code in your authenticator app.</div>
              <div style={{ fontSize: 12, color: '#c5d2e1', marginBottom: 8 }}>Or enter this secret manually:</div>
              <code style={{ display: 'block', padding: 8, background: '#0b1220', borderRadius: 4, fontSize: 12, color: '#e5edf5', wordBreak: 'break-all' }}>{setupData.secret}</code>
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#c5d2e1' }}>2. Enter the 6-digit code the app shows now:</div>
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} inputMode="numeric"
            placeholder="123456"
            style={{ padding: 10, background: '#111a2b', color: '#e5edf5', border: '1px solid #26324a', borderRadius: 6, fontSize: 18, letterSpacing: 4, textAlign: 'center' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={enable} disabled={busy || code.length !== 6}
              style={{ padding: '8px 12px', background: '#4f8cff', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>Confirm & enable</button>
            <button onClick={() => { setSetupData(null); setCode('') }}
              style={{ padding: '8px 12px', background: 'transparent', color: '#8da2bf', border: '1px solid #26324a', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {enabled && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, color: '#c5d2e1' }}>Enter a current code to disable:</div>
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} inputMode="numeric"
            placeholder="123456"
            style={{ padding: 10, background: '#111a2b', color: '#e5edf5', border: '1px solid #26324a', borderRadius: 6, fontSize: 18, letterSpacing: 4, textAlign: 'center' }} />
          <button onClick={disable} disabled={busy || code.length !== 6}
            style={{ padding: '8px 12px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>Disable MFA</button>
        </div>
      )}

      {msg && <div style={{ marginTop: 10, fontSize: 12, color: '#8da2bf' }}>{msg}</div>}
    </div>
  )
}
