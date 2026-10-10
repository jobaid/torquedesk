import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Check, Loader2, AlertCircle } from 'lucide-react'
import Logo from '../components/layout/Logo'

// Landing page Stripe redirects to after a successful signup Checkout.
// Polls POST /api/public/signup/sync/{session} until the subscription row
// is activated server-side, then shows a success panel with a Sign-in link.

export default function SignupComplete() {
  const [params] = useSearchParams()
  const session = params.get('session')
  const [status, setStatus] = useState('activating') // activating | ready | failed
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!session) { setStatus('failed'); setErr('Missing session id in URL.'); return }
    let alive = true
    let tries = 0
    const sync = async () => {
      tries++
      try {
        const res = await fetch('/api/public/signup/sync/' + encodeURIComponent(session), { method: 'POST' })
        const body = await res.json().catch(() => ({}))
        if (!alive) return
        if (!res.ok) throw new Error(body?.error || `Sync failed (${res.status})`)
        if (body.ready) { setStatus('ready'); return }
      } catch (e) {
        if (!alive) return
        if (tries >= 10) { setStatus('failed'); setErr(e.message); return }
      }
      if (tries < 10) setTimeout(sync, 2000)
      else { setStatus('failed'); setErr('Your payment is still processing. Refresh in a minute, or contact support if this persists.') }
    }
    sync()
    return () => { alive = false }
  }, [session])

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center"><Logo /></div>
      </header>
      <main className="max-w-xl mx-auto px-4 py-16">
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          {status === 'activating' && (
            <>
              <Loader2 className="mx-auto text-blue-600 animate-spin" size={40} />
              <h1 className="mt-5 text-xl font-bold text-slate-900">Activating your TorqueDesk account…</h1>
              <p className="mt-2 text-sm text-slate-600">Payment received. Setting up your shop workspace, enabling features, and sending your welcome email. This usually takes just a few seconds.</p>
            </>
          )}
          {status === 'ready' && (
            <>
              <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 grid place-items-center">
                <Check className="text-emerald-600" size={32} />
              </div>
              <h1 className="mt-5 text-2xl font-bold text-slate-900">You're all set</h1>
              <p className="mt-2 text-sm text-slate-600">Your trial is active. We've emailed you a confirmation with next steps.</p>
              <Link to="/" className="mt-6 inline-flex items-center justify-center w-full px-5 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold hover:brightness-110">
                Sign in to your shop
              </Link>
            </>
          )}
          {status === 'failed' && (
            <>
              <AlertCircle className="mx-auto text-red-500" size={40} />
              <h1 className="mt-5 text-xl font-bold text-slate-900">We hit a snag activating your account</h1>
              <p className="mt-2 text-sm text-slate-600">{err}</p>
              <p className="mt-2 text-xs text-slate-500">If you were charged, no worries — your subscription exists. Contact support with your email and we'll finish activation manually.</p>
              <Link to="/" className="mt-6 inline-flex items-center justify-center w-full px-5 py-3 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800">
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
