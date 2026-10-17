import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Handshake, X } from 'lucide-react'
import { useApp } from '../../store/useApp'

// Shown to any signed-in shop user who hasn't yet accepted the Service
// Agreement. "I accept" is a per-account permanent flag (localStorage keyed
// by user email). "Skip for now" dismisses it until the next sign-in so the
// user is reminded but never blocked.
export default function AgreementBanner() {
  const user = useApp((s) => s.user)
  const email = user?.email || ''
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!email) { setVisible(false); return }
    try {
      const accepted = localStorage.getItem(`td.agreement.accepted.${email}`)
      const snoozed = sessionStorage.getItem(`td.agreement.snoozed.${email}`)
      setVisible(!accepted && !snoozed)
    } catch { setVisible(false) }
  }, [email])

  if (!visible || !email) return null

  const accept = () => {
    try { localStorage.setItem(`td.agreement.accepted.${email}`, new Date().toISOString()) } catch {}
    setVisible(false)
  }
  const skip = () => {
    try { sessionStorage.setItem(`td.agreement.snoozed.${email}`, '1') } catch {}
    setVisible(false)
  }

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 60,
      width: 360, maxWidth: 'calc(100vw - 40px)',
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
      boxShadow: '0 20px 40px rgba(15,23,42,.18)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 16px', background: 'linear-gradient(90deg,#3c6dff,#2554f5)', color: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Handshake size={18} />
        <strong style={{ flex: 1 }}>Service Agreement</strong>
        <button onClick={skip} aria-label="Dismiss" style={{ background: 'transparent', border: 0, color: '#fff', cursor: 'pointer' }}><X size={16} /></button>
      </div>
      <div style={{ padding: 16, fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
        Please review and accept the <Link to="/legal/agreement" style={{ color: '#2554f5', fontWeight: 600 }}>Fixora Service Agreement</Link>,
        {' '}<Link to="/legal/terms" style={{ color: '#2554f5' }}>Terms</Link>, and <Link to="/legal/privacy" style={{ color: '#2554f5' }}>Privacy Policy</Link>.
        You can continue using the app and accept later.
        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button onClick={skip} style={{ padding: '8px 14px', background: '#fff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Skip for now
          </button>
          <button onClick={accept} style={{ padding: '8px 14px', background: 'linear-gradient(90deg,#3c6dff,#2554f5)', color: '#fff', border: 0, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            I accept
          </button>
        </div>
      </div>
    </div>
  )
}
