import { useEffect, useState } from 'react'

export default function ResetPassword() {
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    setToken(p.get('token') || '')
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!token) { setError('Missing reset token in the link.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/password-reset/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Reset failed (${res.status})`)
      setDone(true)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const dark = window.location.pathname.startsWith('/owner-reset-password')
  const bg = dark ? '#0b1220' : 'var(--surface, #fff)'
  const panel = dark ? '#111a2b' : 'var(--surface-raised, #fff)'
  const fg = dark ? '#e5edf5' : 'var(--text, #111)'
  const sub = dark ? '#8da2bf' : 'var(--text-2, #4b5563)'
  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: dark ? '1px solid #2a3650' : '1px solid var(--border, #e5e7eb)',
    background: dark ? '#0b1220' : '#fff', color: fg, fontSize: 14, outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: bg, color: fg, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <form onSubmit={submit} style={{ width: 'min(420px, 92vw)', background: panel, borderRadius: 14, padding: 28, border: dark ? '1px solid #1e2a44' : '1px solid var(--border, #e5e7eb)', boxShadow: '0 20px 50px rgba(0,0,0,.15)' }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 22 }}>Choose a new password</h1>
        <p style={{ margin: '0 0 18px', color: sub, fontSize: 13 }}>Reset links are valid for 1 hour.</p>

        {done ? (
          <div style={{ padding: 12, borderRadius: 8, background: dark ? '#0d3a15' : '#e8f8ee', color: dark ? '#95eab0' : '#116632', fontSize: 13 }}>
            Password updated. You can now sign in at <a href={dark ? '/owner-login' : '/'} style={{ color: 'inherit', textDecoration: 'underline' }}>the sign-in page</a>.
          </div>
        ) : (
          <>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: sub }}>New password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required style={inputStyle} />
            <label style={{ display: 'block', fontSize: 12, margin: '12px 0 4px', color: sub }}>Confirm new password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required style={inputStyle} />
            {error && <div style={{ marginTop: 14, padding: '8px 10px', borderRadius: 8, background: dark ? '#3a0d12' : '#fde8ea', color: dark ? '#ffb3b8' : '#991b1f', fontSize: 13 }}>{error}</div>}
            <button type="submit" disabled={busy} style={{ marginTop: 18, width: '100%', padding: '11px 14px', borderRadius: 10, border: 'none', background: 'linear-gradient(90deg,#2a6cf0,#5b8def)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Updating…' : 'Set new password'}
            </button>
          </>
        )}
      </form>
    </div>
  )
}
