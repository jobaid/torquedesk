import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Lock } from 'lucide-react'
import { useOwner, ownerApi } from '../../store/useOwner'

export default function OwnerLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaRequired, setMfaRequired] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [forgotOpen, setForgotOpen] = useState(false)
  const login = useOwner((s) => s.login)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await ownerApi('/auth/login', { method: 'POST', body: { email, password, mfaCode } })
      login({ token: res.token, user: res.user })
      navigate(window.location.pathname === '/owner-login' ? '/owner' : '/portal/admin', { replace: true })
    } catch (err) {
      // Server signals MFA needed via a flag in the response body.
      if (err.mfaRequired) {
        setMfaRequired(true)
        setError(err.message)
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#ffffff', color: '#000000', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <form onSubmit={submit} style={{ width: 'min(420px, 92vw)', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 28, boxShadow: '0 20px 50px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{ background: 'linear-gradient(135deg,#5b8def,#8b5cf6)', borderRadius: 10, padding: 8, display: 'flex' }}><ShieldCheck size={20} color="#fff" /></div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Fixora</div>
            <div style={{ fontSize: 12, color: '#000000' }}>SaaS Owner Portal</div>
          </div>
        </div>
        <h1 style={{ margin: '12px 0 6px', fontSize: 22 }}>Sign in</h1>
        <p style={{ margin: '0 0 18px', color: '#000000', fontSize: 13 }}>Restricted administrative access.</p>

        <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: '#000000' }}>Email</label>
        <input
          type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />

        <label style={{ display: 'block', fontSize: 12, margin: '14px 0 4px', color: '#000000' }}>Password</label>
        <input
          type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />

        {mfaRequired && (
          <>
            <label style={{ display: 'block', fontSize: 12, margin: '14px 0 4px', color: '#000000' }}>Authenticator code</label>
            <input
              value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6} inputMode="numeric" placeholder="123456" autoFocus
              style={{ ...inputStyle, letterSpacing: 4, textAlign: 'center', fontSize: 18 }}
            />
          </>
        )}

        {error && <div style={{ marginTop: 14, padding: '8px 10px', borderRadius: 8, background: '#3a0d12', color: '#dc2626', fontSize: 13 }}>{error}</div>}

        <button type="submit" disabled={loading} style={{ marginTop: 20, width: '100%', padding: '11px 14px', borderRadius: 10, border: 'none', background: 'linear-gradient(90deg,#2a6cf0,#5b8def)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Signing in…' : <><Lock size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Sign in</>}
        </button>

        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <button type="button" onClick={() => setForgotOpen(true)} style={{ background: 'none', border: 'none', color: '#000000', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Forgot password?</button>
        </div>

        <div style={{ marginTop: 10, fontSize: 11, color: '#000000', textAlign: 'center' }}>
          Not a Fixora administrator? <a href="/" style={{ color: '#000000' }}>Go to the main app</a>.
        </div>
      </form>
      {forgotOpen && <OwnerForgotPasswordModal initialEmail={email} onClose={() => setForgotOpen(false)} />}
    </div>
  )
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function OwnerForgotPasswordModal({ initialEmail, onClose }) {
  const [email, setEmail] = useState(initialEmail || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState('')

  const submit = async (e) => {
    e?.preventDefault()
    setErr(''); setSuccess('')
    const addr = email.trim().toLowerCase()
    if (!EMAIL_RE.test(addr)) { setErr('Enter a valid email address.'); return }
    setBusy(true)
    try {
      // Note: fetch doesn't throw on non-2xx, so we must check res.ok ourselves.
      const res = await fetch('/api/password-reset/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addr, kind: 'owner' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 404) {
          setErr('Email is incorrect — no active owner admin uses this address.')
        } else {
          setErr(body?.error || `Could not send reset link. (${res.status})`)
        }
        return
      }
      setSuccess(`Your password reset link has been sent to ${addr}. Please check your inbox — and your spam folder if you don't see it within a minute.`)
    } catch { setErr('Could not reach the server. Please try again.') }
    finally { setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{ background: '#fff', color: '#0f172a', borderRadius: 12, padding: 24, maxWidth: 420, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Reset your owner password</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          Enter the email you use to sign in to the owner portal. If it matches an active admin we'll email you a reset link.
        </div>
        <label style={{ display: 'block', marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>Email address</div>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus
            placeholder="you@fixoraerp.com"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }} />
        </label>
        {err && <div style={{ padding: 10, background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 6, fontSize: 13, marginBottom: 10 }}>{err}</div>}
        {success && <div style={{ padding: 10, background: '#dcfce7', border: '1px solid #86efac', color: '#065f46', borderRadius: 6, fontSize: 13, marginBottom: 10 }}>{success}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13 }}>{success ? 'Close' : 'Cancel'}</button>
          {!success && (
            <button type="submit" disabled={busy || !email.trim()} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#2554f5', color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', fontSize: 13, opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1',
  background: '#ffffff', color: '#000000', fontSize: 14, outline: 'none',
}
