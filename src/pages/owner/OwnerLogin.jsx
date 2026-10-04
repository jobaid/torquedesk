import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Lock } from 'lucide-react'
import { useOwner, ownerApi } from '../../store/useOwner'

export default function OwnerLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const login = useOwner((s) => s.login)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await ownerApi('/auth/login', { method: 'POST', body: { email, password } })
      login({ token: res.token, user: res.user })
      navigate('/owner', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b1220', color: '#e5edf5', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <form onSubmit={submit} style={{ width: 'min(420px, 92vw)', background: '#111a2b', border: '1px solid #1e2a44', borderRadius: 14, padding: 28, boxShadow: '0 20px 50px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{ background: 'linear-gradient(135deg,#5b8def,#8b5cf6)', borderRadius: 10, padding: 8, display: 'flex' }}><ShieldCheck size={20} color="#fff" /></div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Toraquedesk</div>
            <div style={{ fontSize: 12, color: '#8da2bf' }}>SaaS Owner Portal</div>
          </div>
        </div>
        <h1 style={{ margin: '12px 0 6px', fontSize: 22 }}>Sign in</h1>
        <p style={{ margin: '0 0 18px', color: '#8da2bf', fontSize: 13 }}>Restricted administrative access.</p>

        <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: '#8da2bf' }}>Email</label>
        <input
          type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />

        <label style={{ display: 'block', fontSize: 12, margin: '14px 0 4px', color: '#8da2bf' }}>Password</label>
        <input
          type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />

        {error && <div style={{ marginTop: 14, padding: '8px 10px', borderRadius: 8, background: '#3a0d12', color: '#ffb3b8', fontSize: 13 }}>{error}</div>}

        <button type="submit" disabled={loading} style={{ marginTop: 20, width: '100%', padding: '11px 14px', borderRadius: 10, border: 'none', background: 'linear-gradient(90deg,#2a6cf0,#5b8def)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Signing in…' : <><Lock size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Sign in</>}
        </button>

        <div style={{ marginTop: 16, fontSize: 11, color: '#5c6c86', textAlign: 'center' }}>
          Not a CuraNex administrator? <a href="/" style={{ color: '#8da2bf' }}>Go to the main app</a>.
        </div>
      </form>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #2a3650',
  background: '#0b1220', color: '#e5edf5', fontSize: 14, outline: 'none',
}
