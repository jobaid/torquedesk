import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Card, PageHeader } from './primitives'
import { ownerApi } from '../../store/useOwner'
import MfaCard from './MfaCard'

export default function OwnerSettings() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')
    if (next.length < 8) { setError('New password must be at least 8 characters.'); return }
    if (next !== confirm) { setError('New password and confirmation do not match.'); return }
    if (current === next) { setError('New password must be different from the current one.'); return }
    setBusy(true)
    try {
      await ownerApi('/me/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } })
      setCurrent(''); setNext(''); setConfirm('')
      setSuccess('Password changed. Use the new password next time you sign in.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Settings" />
      <div style={{ display: 'grid', gap: 16, maxWidth: 520 }}>
        <MfaCard />
        <Card>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#e5edf5', marginBottom: 4 }}>Change password</div>
          <div style={{ fontSize: 12, color: '#8da2bf', marginBottom: 16 }}>
            Rotate your CuraNex Owner Portal password. You stay signed in on this device.
          </div>
          <form onSubmit={submit} style={{ display: 'grid', gap: 12 }} noValidate>
            <Pwd label="Current password" value={current} onChange={setCurrent} show={show} autoComplete="current-password" />
            <Pwd label="New password" value={next} onChange={setNext} show={show} autoComplete="new-password" hint="At least 8 characters." />
            <Pwd label="Confirm new password" value={confirm} onChange={setConfirm} show={show} autoComplete="new-password" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8da2bf' }}>
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
              Show passwords
            </label>
            {error && <div style={{ background: 'rgba(220,53,69,0.12)', border: '1px solid rgba(220,53,69,0.35)', color: '#fda1aa', padding: 10, borderRadius: 6, fontSize: 13 }}>{error}</div>}
            {success && <div style={{ background: 'rgba(40,167,69,0.12)', border: '1px solid rgba(40,167,69,0.35)', color: '#95eab0', padding: 10, borderRadius: 6, fontSize: 13 }}>{success}</div>}
            <button type="submit" disabled={busy}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: busy ? '#3b4a62' : '#4f8cff', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>
              <KeyRound size={16} />{busy ? 'Changing…' : 'Change password'}
            </button>
          </form>
        </Card>
      </div>
    </div>
  )
}

function Pwd({ label, value, onChange, show, autoComplete, hint }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 12, color: '#c5d2e1' }}>{label}</span>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        style={{ padding: '10px 12px', background: '#111a2b', color: '#e5edf5', border: '1px solid #26324a', borderRadius: 6, fontSize: 14 }}
      />
      {hint && <span style={{ fontSize: 11, color: '#8da2bf' }}>{hint}</span>}
    </label>
  )
}
