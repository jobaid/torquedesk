import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Check, Loader2, AlertCircle, PartyPopper, Rocket, Mail, ShieldCheck, Sparkles } from 'lucide-react'
import Logo from '../components/layout/Logo'

// Landing page Stripe redirects to after a successful signup Checkout.
// Polls /api/public/signup/sync/{session} until the subscription row is
// activated server-side, then shows a celebratory success panel.
export default function SignupComplete() {
  const [params] = useSearchParams()
  const session = params.get('session')
  const [status, setStatus] = useState('activating') // activating | ready | failed
  const [err, setErr] = useState('')
  const [trialAbuse, setTrialAbuse] = useState(false)

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
        if (res.status === 409 && body?.trialAbuse) {
          setTrialAbuse(true); setStatus('failed'); setErr(body.error); return
        }
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
    <div className="sc-shell">
      <header className="sc-top">
        <div className="sc-top-inner"><Logo /></div>
      </header>

      <main className="sc-main">
        <div className="sc-card">
          {status === 'activating' && (
            <>
              <div className="sc-icon sc-icon-blue">
                <Loader2 className="spin" size={44} />
              </div>
              <h1>Activating your Fixora account…</h1>
              <p className="sc-sub">
                Payment received. We're setting up your shop workspace, enabling features, and sending your welcome email. This usually takes just a few seconds.
              </p>
              <div className="sc-steps">
                <div className="sc-step done"><Check size={14} /> Payment confirmed</div>
                <div className="sc-step active"><Loader2 size={14} className="spin" /> Provisioning your shop</div>
                <div className="sc-step"><span className="dot" /> Enabling features</div>
                <div className="sc-step"><span className="dot" /> Sending welcome email</div>
              </div>
            </>
          )}

          {status === 'ready' && (
            <>
              <div className="sc-confetti" aria-hidden>
                {Array.from({ length: 24 }).map((_, i) => (
                  <span key={i} style={{
                    left: `${(i * 4.3) % 100}%`,
                    background: ['#2554f5','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4'][i % 6],
                    animationDelay: `${(i % 8) * 0.1}s`,
                  }} />
                ))}
              </div>
              <div className="sc-icon sc-icon-green">
                <PartyPopper size={46} />
              </div>
              <div className="sc-eyebrow"><Sparkles size={12} /> You're in!</div>
              <h1>Welcome to Fixora 🎉</h1>
              <p className="sc-sub">
                Your trial is active and your shop workspace is live. Everything's ready — repair orders, invoices, customer management, and reports are waiting for you.
              </p>

              <div className="sc-next">
                <div className="sc-next-head">What's next</div>
                <ul>
                  <li>
                    <span className="sc-next-num">1</span>
                    <div>
                      <strong>Sign in to your shop</strong>
                      <div className="sc-next-sub">Use the email and password you just created.</div>
                    </div>
                  </li>
                  <li>
                    <span className="sc-next-num">2</span>
                    <div>
                      <strong>Set up your shop</strong>
                      <div className="sc-next-sub">Add labor rates, taxes, and your logo under Settings.</div>
                    </div>
                  </li>
                  <li>
                    <span className="sc-next-num">3</span>
                    <div>
                      <strong>Add your first customer</strong>
                      <div className="sc-next-sub">Then create a repair order and send your first invoice.</div>
                    </div>
                  </li>
                </ul>
              </div>

              <a href="https://my.fixoraerp.com/" className="sc-cta">
                <Rocket size={18} /> Sign in to your shop
              </a>
              <div className="sc-fine">
                <Mail size={13} /> We've emailed a copy of your welcome message. Check your inbox (and spam folder, just in case).
              </div>
              <div className="sc-trust">
                <ShieldCheck size={13} /> Your payment is secured by Stripe. You can cancel any time from Settings → Billing.
              </div>
            </>
          )}

          {status === 'failed' && (
            <>
              <div className="sc-icon sc-icon-red">
                <AlertCircle size={44} />
              </div>
              <h1>{trialAbuse ? 'Trial already used' : 'We hit a snag activating your account'}</h1>
              <p className="sc-sub">{err}</p>
              {!trialAbuse && (
                <p className="sc-fine">
                  If you were charged, no worries — your subscription exists. Contact support with your email and we'll finish activation manually.
                </p>
              )}
              {trialAbuse && (
                <p className="sc-fine">
                  Only one Fixora trial per email, card, or bank account is allowed. If this is in error, contact support.
                </p>
              )}
              <a href="https://my.fixoraerp.com/" className="sc-cta sc-cta-dark">Back to sign in</a>
            </>
          )}
        </div>
      </main>

      <style>{`
        .spin { animation: spin 1s linear infinite }
        @keyframes spin { to { transform: rotate(360deg) } }

        .sc-shell { min-height:100vh; background:
          radial-gradient(ellipse at top, #eef2ff, transparent 60%),
          radial-gradient(ellipse at bottom right, #ecfdf5, transparent 55%),
          #f8fafc;
        }
        .sc-top { background:#fff; border-bottom:1px solid #e5e7eb; }
        .sc-top-inner { max-width:800px; margin:0 auto; padding:0 20px; height:64px; display:flex; align-items:center; }
        .sc-main { max-width:620px; margin:0 auto; padding:48px 20px 80px; }
        .sc-card {
          position:relative; overflow:hidden;
          background:#fff; border:1px solid #e5e7eb; border-radius:20px;
          padding:40px 36px; text-align:center;
          box-shadow:0 20px 60px rgba(15,23,42,0.08);
        }
        .sc-icon {
          width:88px; height:88px; border-radius:50%;
          display:grid; place-items:center; margin:0 auto 20px;
          box-shadow:0 10px 30px rgba(0,0,0,.1);
        }
        .sc-icon-blue { background:linear-gradient(135deg,#3c6dff,#2554f5); color:#fff; }
        .sc-icon-green { background:linear-gradient(135deg,#10b981,#059669); color:#fff; }
        .sc-icon-red { background:linear-gradient(135deg,#f87171,#ef4444); color:#fff; }

        .sc-eyebrow {
          display:inline-flex; align-items:center; gap:5px;
          background:#ecfdf5; color:#047857; padding:4px 10px; border-radius:999px;
          font-size:11.5px; font-weight:700; letter-spacing:.03em; margin-bottom:10px;
        }
        .sc-card h1 {
          margin:0; font-size:30px; font-weight:800; letter-spacing:-0.02em;
          color:#0f172a; line-height:1.15;
        }
        .sc-sub { margin:12px auto 0; font-size:15px; color:#475569; line-height:1.55; max-width:460px; }

        .sc-steps { margin:28px auto 0; display:grid; gap:10px; max-width:360px; text-align:left; }
        .sc-step {
          display:flex; align-items:center; gap:10px;
          padding:10px 14px; border-radius:10px; font-size:13px; color:#64748b;
          background:#f8fafc; border:1px solid #e2e8f0;
        }
        .sc-step.done { color:#047857; background:#ecfdf5; border-color:#a7f3d0; font-weight:600; }
        .sc-step.active { color:#1e40af; background:#eff6ff; border-color:#bfdbfe; font-weight:600; }
        .sc-step .dot { width:14px; height:14px; border-radius:50%; border:1.5px solid #cbd5e1; display:inline-block; flex-shrink:0; }

        .sc-next {
          margin:28px auto 0; text-align:left;
          background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px;
          padding:18px 20px;
        }
        .sc-next-head {
          font-size:11px; letter-spacing:.08em; text-transform:uppercase;
          font-weight:700; color:#2554f5; margin-bottom:10px;
        }
        .sc-next ul { list-style:none; margin:0; padding:0; display:grid; gap:12px; }
        .sc-next li { display:flex; gap:12px; align-items:flex-start; }
        .sc-next-num {
          flex-shrink:0; width:26px; height:26px; border-radius:50%;
          background:linear-gradient(135deg,#3c6dff,#2554f5); color:#fff;
          display:grid; place-items:center; font-size:12px; font-weight:700;
          box-shadow:0 3px 8px rgba(37,84,245,.25);
        }
        .sc-next li strong { display:block; font-size:14px; color:#0f172a; }
        .sc-next-sub { font-size:12.5px; color:#64748b; margin-top:2px; line-height:1.4; }

        .sc-cta {
          margin-top:26px;
          display:inline-flex; align-items:center; justify-content:center; gap:8px;
          padding:14px 28px; border-radius:12px;
          background:linear-gradient(90deg,#2554f5,#1d4fd9); color:#fff;
          font-size:15.5px; font-weight:700; text-decoration:none;
          box-shadow:0 10px 25px rgba(37,84,245,.3);
          transition:filter .15s, transform .1s;
          width:100%; max-width:320px;
        }
        .sc-cta:hover { filter:brightness(1.05); }
        .sc-cta:active { transform:translateY(1px); }
        .sc-cta-dark { background:linear-gradient(90deg,#0f172a,#1e293b); box-shadow:0 10px 25px rgba(15,23,42,.3); }

        .sc-fine {
          margin-top:16px; display:inline-flex; align-items:center; gap:6px;
          font-size:12.5px; color:#64748b; line-height:1.5;
          justify-content:center;
        }
        .sc-trust {
          margin-top:8px; display:inline-flex; align-items:center; gap:6px;
          font-size:12px; color:#94a3b8;
        }

        /* Confetti burst */
        .sc-confetti { position:absolute; inset:0 0 auto 0; height:260px; pointer-events:none; overflow:hidden; }
        .sc-confetti span {
          position:absolute; top:-12px; width:8px; height:14px; border-radius:2px;
          animation: fall 2.2s ease-out forwards;
          transform-origin:center;
        }
        @keyframes fall {
          0% { transform:translateY(-20px) rotate(0deg); opacity:1; }
          100% { transform:translateY(260px) rotate(540deg); opacity:0; }
        }

        @media (max-width: 560px) {
          .sc-main { padding:28px 14px 60px; }
          .sc-card { padding:28px 20px; border-radius:16px; }
          .sc-card h1 { font-size:24px; }
          .sc-sub { font-size:14.5px; }
          .sc-icon { width:76px; height:76px; }
          .sc-cta { padding:13px 22px; font-size:15px; }
        }
      `}</style>
    </div>
  )
}
