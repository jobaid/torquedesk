import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../store/useApp'
import {
  Send, ImagePlus, Users, Loader2, CheckCircle2, AlertTriangle, X,
  Megaphone, Mail, Sparkles, Lock, ArrowRight, Clock3,
} from 'lucide-react'

// Shop Manager → Customer Broadcast
// Compose one email + optional photo and send to every customer with an
// email on file. Photo is uploaded to a server dir with 24h TTL.
export default function CustomerBroadcast() {
  const features = useApp((s) => s.features)
  const enabled = !features || features.customer_broadcast
  const shopName = useApp((s) => s.settings?.shop?.shop_name) || 'Your Shop'

  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [count, setCount] = useState(null)
  const [image, setImage] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(null)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)

  const loadCount = async () => {
    try {
      const r = await api('/customer-broadcast/preview')
      setCount(r?.count ?? 0)
    } catch { setCount(null) }
  }
  useEffect(() => { if (enabled) loadCount() }, [enabled])

  const paragraphs = useMemo(
    () => body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
    [body],
  )

  if (!enabled) return <DisabledUpsell />

  const onPickImage = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setErr('Image must be under 10 MB.'); return }
    setUploading(true); setErr('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const token = useApp.getState().user?.token
      const res = await fetch('/api/customer-broadcast/upload', {
        method: 'POST',
        headers: token ? { Authorization: 'Bearer ' + token } : {},
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Upload failed')
      setImage(data)
    } catch (e) { setErr(e?.message || 'Upload failed') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const removeImage = () => setImage(null)

  const send = async () => {
    if (!subject.trim() || !body.trim()) { setErr('Subject and body are required.'); return }
    if (!window.confirm(`Send this email to ${count ?? '?'} customer${count === 1 ? '' : 's'}?`)) return
    setBusy(true); setErr(''); setSent(null)
    try {
      const r = await api('/customer-broadcast', {
        method: 'POST',
        body: { subject: subject.trim(), body: body.trim(), imageUrl: image?.url || '' },
      })
      setSent(r)
      setSubject(''); setBody(''); setImage(null)
    } catch (e) { setErr(e?.message || 'Send failed') }
    finally { setBusy(false) }
  }

  const canSend = subject.trim() && body.trim() && !busy && !uploading && (count ?? 0) > 0
  const subjectCount = subject.length
  const bodyCount = body.length

  return (
    <div className="cb-shell">
      {/* Hero */}
      <div className="cb-hero">
        <div className="cb-hero-left">
          <div className="cb-hero-icon"><Megaphone size={22} /></div>
          <div>
            <h1 className="cb-title">Customer Broadcast</h1>
            <p className="cb-sub">Send a deal, update, or announcement to every customer with an email on file.</p>
          </div>
        </div>
        <div className="cb-hero-pill">
          <Users size={14} />
          <span>{count === null ? 'Loading…' : <><strong>{count}</strong> recipient{count === 1 ? '' : 's'}</>}</span>
        </div>
      </div>

      {/* Success state */}
      {sent && (
        <div className="cb-success">
          <div className="cb-success-icon"><CheckCircle2 size={22} /></div>
          <div className="cb-success-text">
            <div className="cb-success-title">Sent successfully</div>
            <div className="cb-success-sub">Queued {sent.recipients} email{sent.recipients === 1 ? '' : 's'} · Batch {sent.batch}</div>
          </div>
          <button className="cb-ghost-btn" onClick={() => setSent(null)}>Send another</button>
        </div>
      )}

      {/* Two-column: compose + live preview */}
      <div className="cb-grid">
        {/* Compose */}
        <div className="cb-card">
          <div className="cb-section-label">Compose</div>

          <div className="cb-field">
            <label className="cb-label">Subject line</label>
            <input
              className="cb-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. 20% off oil changes this week"
              maxLength={200}
            />
            <div className="cb-help">
              <span>What your customers see in their inbox.</span>
              <span className={subjectCount > 100 ? 'warn' : ''}>{subjectCount}/200</span>
            </div>
          </div>

          <div className="cb-field">
            <label className="cb-label">Message</label>
            <textarea
              className="cb-textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={9}
              placeholder={'Hi there,\n\nWrite your message. Blank lines become new paragraphs.\n\nThanks,\n' + shopName}
              maxLength={5000}
            />
            <div className="cb-help">
              <span>Blank lines create paragraphs. Keep it short — under 150 words lands best.</span>
              <span className={bodyCount > 4000 ? 'warn' : ''}>{bodyCount}/5000</span>
            </div>
          </div>

          <div className="cb-field">
            <label className="cb-label">Photo attachment <span className="cb-badge">Optional</span></label>
            {!image ? (
              <label className="cb-drop" onClick={(e) => e.currentTarget.querySelector('input')?.click()}>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onPickImage} style={{ display: 'none' }} />
                {uploading ? (
                  <><Loader2 size={18} className="spin" /><span>Uploading…</span></>
                ) : (
                  <>
                    <div className="cb-drop-icon"><ImagePlus size={20} /></div>
                    <div className="cb-drop-text">
                      <strong>Click to add an image</strong>
                      <span>JPEG, PNG, WebP or GIF · up to 10 MB</span>
                    </div>
                  </>
                )}
              </label>
            ) : (
              <div className="cb-preview-image">
                <img src={image.url} alt="attachment preview" />
                <button className="cb-img-remove" onClick={removeImage} aria-label="Remove image"><X size={14} /></button>
                <div className="cb-img-meta"><Clock3 size={12} /> Hosted 24 h · expires {new Date(image.expiresAt).toLocaleString()}</div>
              </div>
            )}
          </div>

          {err && (
            <div className="cb-err"><AlertTriangle size={16} />{err}</div>
          )}

          <button className="cb-send-btn" onClick={send} disabled={!canSend}>
            {busy ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
            {busy ? 'Sending…' : <>Send to <strong>{count ?? '?'}</strong> customer{count === 1 ? '' : 's'}</>}
          </button>
          <div className="cb-help center">
            <Sparkles size={12} /> Delivered through Fixora's trusted mail server · one email per customer, personalized.
          </div>
        </div>

        {/* Live preview */}
        <div className="cb-preview-wrap">
          <div className="cb-section-label">Live preview</div>
          <div className="cb-mail">
            <div className="cb-mail-chrome">
              <div className="cb-chrome-dot red"></div>
              <div className="cb-chrome-dot amber"></div>
              <div className="cb-chrome-dot green"></div>
              <div className="cb-chrome-url"><Mail size={12} /> Inbox</div>
            </div>
            <div className="cb-mail-head">
              <div className="cb-avatar">{(shopName || 'S')[0]}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="cb-mail-from">
                  <strong>{shopName}</strong>
                  <span className="cb-mail-email">&lt;no-reply@fixoraerp.com&gt;</span>
                </div>
                <div className="cb-mail-to">to <strong>Your customer</strong></div>
              </div>
              <div className="cb-mail-date">Now</div>
            </div>
            <div className="cb-mail-subject">{subject || <span className="cb-ph">Your subject line will appear here</span>}</div>
            <div className="cb-mail-body">
              {paragraphs.length === 0 ? (
                <p className="cb-ph">Your message will appear here as your customers see it. Blank lines turn into new paragraphs.</p>
              ) : (
                paragraphs.map((p, i) => <p key={i}>{p}</p>)
              )}
              {image && (
                <div className="cb-mail-image">
                  <img src={image.url} alt="attachment" />
                </div>
              )}
              <div className="cb-mail-signature">— {shopName}</div>
            </div>
          </div>
          <div className="cb-tip">
            <strong>Pro tip:</strong> Mention a real benefit (free diagnostic, 15% off brakes), a clear deadline, and one phone number. Short wins.
          </div>
        </div>
      </div>

      <style>{`
        .cb-shell { max-width: 1240px; margin: 0 auto; padding: 28px 20px 80px; color: #0f172a; }

        /* Hero */
        .cb-hero {
          display: flex; align-items: center; justify-content: space-between; gap: 20px;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          color: #fff; padding: 24px 28px; border-radius: 16px;
          box-shadow: 0 10px 30px rgba(15,23,42,0.12);
          position: relative; overflow: hidden;
        }
        .cb-hero::after {
          content: ''; position: absolute; top: -80px; right: -60px;
          width: 240px; height: 240px; border-radius: 50%;
          background: radial-gradient(circle, rgba(245,130,32,0.25), transparent 70%);
          pointer-events: none;
        }
        .cb-hero-left { display: flex; align-items: center; gap: 14px; position: relative; z-index: 1; }
        .cb-hero-icon {
          width: 44px; height: 44px; border-radius: 12px;
          background: linear-gradient(135deg, #f58220, #ea6a0f); color: #0f172a;
          display: grid; place-items: center; flex-shrink: 0;
          box-shadow: 0 6px 16px rgba(245,130,32,0.35);
        }
        .cb-title { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; }
        .cb-sub { margin: 4px 0 0; color: #cbd5e1; font-size: 14px; line-height: 1.5; max-width: 560px; }
        .cb-hero-pill {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 16px; background: rgba(255,255,255,0.10);
          backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.15);
          border-radius: 999px; font-size: 13px; color: #fff; z-index: 1; flex-shrink: 0;
        }
        .cb-hero-pill strong { color: #fdba74; }

        /* Success banner */
        .cb-success {
          display: flex; align-items: center; gap: 14px; margin-top: 16px;
          padding: 14px 18px; border-radius: 12px;
          background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46;
        }
        .cb-success-icon { color: #10b981; flex-shrink: 0; }
        .cb-success-text { flex: 1; min-width: 0; }
        .cb-success-title { font-weight: 700; font-size: 14px; }
        .cb-success-sub { font-size: 12.5px; opacity: 0.85; }
        .cb-ghost-btn {
          padding: 7px 14px; border-radius: 8px; border: 1px solid #a7f3d0;
          background: #fff; color: #065f46; font-size: 13px; font-weight: 600;
          cursor: pointer; transition: background 0.1s;
        }
        .cb-ghost-btn:hover { background: #d1fae5; }

        /* Grid layout */
        .cb-grid { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 20px; margin-top: 20px; }
        @media (max-width: 900px) { .cb-grid { grid-template-columns: 1fr; } }

        /* Cards */
        .cb-card, .cb-preview-wrap {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 14px;
          padding: 22px; box-shadow: 0 1px 3px rgba(15,23,42,0.04);
        }
        .cb-section-label {
          font-size: 11px; font-weight: 700; color: #64748b;
          letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 14px;
        }

        /* Fields */
        .cb-field { margin-bottom: 18px; }
        .cb-label {
          display: flex; align-items: center; gap: 6px;
          font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;
        }
        .cb-badge {
          font-size: 10px; font-weight: 700; color: #64748b;
          background: #f1f5f9; padding: 2px 8px; border-radius: 99px;
          letter-spacing: 0.04em; text-transform: uppercase;
        }
        .cb-input, .cb-textarea {
          width: 100%; padding: 11px 14px; border: 1.5px solid #e2e8f0;
          border-radius: 10px; font-size: 14px; color: #0f172a; background: #fff;
          font-family: inherit; box-sizing: border-box; outline: none;
          transition: border-color 0.1s, box-shadow 0.1s;
        }
        .cb-input:focus, .cb-textarea:focus {
          border-color: #f58220; box-shadow: 0 0 0 3px rgba(245,130,32,0.15);
        }
        .cb-textarea { resize: vertical; min-height: 180px; line-height: 1.55; }
        .cb-help {
          display: flex; justify-content: space-between; align-items: center; gap: 10px;
          font-size: 11.5px; color: #94a3b8; margin-top: 6px;
        }
        .cb-help.center { justify-content: center; margin-top: 10px; }
        .cb-help .warn { color: #d97706; font-weight: 600; }

        /* Image drop */
        .cb-drop {
          display: flex; align-items: center; gap: 12px; padding: 16px;
          border: 1.5px dashed #cbd5e1; border-radius: 10px; cursor: pointer;
          background: #fafafa; transition: background 0.1s, border-color 0.1s;
        }
        .cb-drop:hover { background: #f1f5f9; border-color: #f58220; }
        .cb-drop-icon {
          width: 40px; height: 40px; border-radius: 10px;
          background: #fff; border: 1px solid #e2e8f0; color: #f58220;
          display: grid; place-items: center; flex-shrink: 0;
        }
        .cb-drop-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .cb-drop-text strong { font-size: 13px; color: #0f172a; font-weight: 600; }
        .cb-drop-text span { font-size: 11.5px; color: #64748b; }
        .cb-preview-image { position: relative; display: inline-block; max-width: 100%; }
        .cb-preview-image img {
          max-height: 180px; max-width: 100%; border-radius: 10px;
          border: 1px solid #e2e8f0; display: block;
        }
        .cb-img-remove {
          position: absolute; top: 8px; right: 8px;
          width: 28px; height: 28px; border-radius: 50%;
          background: #fff; border: 1px solid #e2e8f0; color: #0f172a;
          display: grid; place-items: center; cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }
        .cb-img-remove:hover { background: #fee2e2; color: #dc2626; }
        .cb-img-meta {
          display: inline-flex; align-items: center; gap: 4px;
          margin-top: 6px; font-size: 11px; color: #64748b;
        }

        /* Error */
        .cb-err {
          display: flex; align-items: center; gap: 8px; padding: 10px 14px;
          background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
          border-radius: 10px; font-size: 13px; margin-bottom: 14px;
        }

        /* Send button */
        .cb-send-btn {
          width: 100%; padding: 14px 20px; border-radius: 12px; border: 0;
          background: linear-gradient(135deg, #f58220 0%, #ea6a0f 100%); color: #fff;
          font-weight: 700; font-size: 15px; letter-spacing: -0.01em;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          cursor: pointer; transition: filter 0.1s, transform 0.05s;
          box-shadow: 0 8px 20px rgba(245,130,32,0.3);
        }
        .cb-send-btn:hover:not(:disabled) { filter: brightness(1.05); }
        .cb-send-btn:active:not(:disabled) { transform: translateY(1px); }
        .cb-send-btn:disabled {
          background: #cbd5e1; cursor: not-allowed; box-shadow: none;
        }

        /* Live preview */
        .cb-mail {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
          overflow: hidden;
        }
        .cb-mail-chrome {
          display: flex; align-items: center; gap: 6px;
          padding: 10px 14px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
        }
        .cb-chrome-dot { width: 10px; height: 10px; border-radius: 50%; }
        .cb-chrome-dot.red { background: #f87171; }
        .cb-chrome-dot.amber { background: #fbbf24; }
        .cb-chrome-dot.green { background: #4ade80; }
        .cb-chrome-url {
          margin-left: auto; display: inline-flex; align-items: center; gap: 6px;
          font-size: 11px; color: #64748b; padding: 3px 10px;
          background: #fff; border: 1px solid #e2e8f0; border-radius: 99px;
        }
        .cb-mail-head {
          display: flex; align-items: center; gap: 12px; padding: 16px;
          border-bottom: 1px solid #f1f5f9;
        }
        .cb-avatar {
          width: 40px; height: 40px; border-radius: 50%;
          background: linear-gradient(135deg, #f58220, #ea6a0f); color: #fff;
          display: grid; place-items: center; font-weight: 700;
          flex-shrink: 0; font-size: 16px;
        }
        .cb-mail-from { font-size: 13px; color: #0f172a; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .cb-mail-email { color: #94a3b8; font-weight: 400; font-size: 12px; }
        .cb-mail-to { font-size: 11.5px; color: #64748b; margin-top: 2px; }
        .cb-mail-date { font-size: 11px; color: #94a3b8; flex-shrink: 0; }
        .cb-mail-subject {
          font-size: 17px; font-weight: 700; color: #0f172a; padding: 14px 16px 6px;
          letter-spacing: -0.01em;
        }
        .cb-mail-body { padding: 10px 16px 20px; font-size: 14px; color: #334155; line-height: 1.6; }
        .cb-mail-body p { margin: 0 0 12px; }
        .cb-mail-body .cb-ph { color: #cbd5e1; font-style: italic; }
        .cb-mail-image { margin: 10px 0; }
        .cb-mail-image img { max-width: 100%; max-height: 220px; border-radius: 8px; border: 1px solid #e2e8f0; display: block; }
        .cb-mail-signature { margin-top: 16px; color: #64748b; font-size: 13px; }

        .cb-tip {
          margin-top: 14px; padding: 12px 14px; border-radius: 10px;
          background: #fff8f1; border: 1px solid #fed7aa;
          font-size: 12.5px; color: #7c2d12; line-height: 1.5;
        }
        .cb-tip strong { color: #431407; }

        .spin { animation: cb-spin 0.9s linear infinite; }
        @keyframes cb-spin { to { transform: rotate(360deg); } }

        @media (max-width: 560px) {
          .cb-hero { flex-direction: column; align-items: flex-start; gap: 12px; }
          .cb-title { font-size: 20px; }
          .cb-card, .cb-preview-wrap { padding: 16px; }
          .cb-send-btn { padding: 13px 16px; font-size: 14px; }
        }
      `}</style>
    </div>
  )
}

function DisabledUpsell() {
  return (
    <div className="cb-shell">
      <div className="cb-upsell">
        <div className="cb-upsell-icon"><Lock size={28} /></div>
        <h2>Customer Broadcast is a paid add-on</h2>
        <p>
          Send targeted announcements, deals, and updates to every customer with an email on file.
          Perfect for seasonal promotions, service reminders, and shop updates.
        </p>
        <div className="cb-upsell-feats">
          <div><CheckCircle2 size={14} /> Email every customer in one click</div>
          <div><CheckCircle2 size={14} /> Attach a promo photo (24h hosted)</div>
          <div><CheckCircle2 size={14} /> Delivered through Fixora's trusted mail server</div>
          <div><CheckCircle2 size={14} /> Mobile-friendly templates</div>
        </div>
        <a href="/settings/general/addons" className="cb-upsell-btn">
          Enable Customer Broadcast <ArrowRight size={16} />
        </a>
        <div className="cb-upsell-fine">
          Already on a plan that includes it? Ask your Fixora admin to flip it on in Settings → Feature Access.
        </div>
      </div>
      <style>{`
        .cb-shell { max-width: 640px; margin: 0 auto; padding: 60px 20px; }
        .cb-upsell {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 16px;
          padding: 40px 32px; text-align: center;
          box-shadow: 0 10px 30px rgba(15,23,42,0.06);
        }
        .cb-upsell-icon {
          width: 64px; height: 64px; border-radius: 16px; margin: 0 auto 20px;
          background: linear-gradient(135deg, #f58220, #ea6a0f); color: #fff;
          display: grid; place-items: center;
          box-shadow: 0 10px 25px rgba(245,130,32,0.3);
        }
        .cb-upsell h2 {
          margin: 0 0 12px; font-size: 24px; font-weight: 800;
          letter-spacing: -0.02em; color: #0f172a;
        }
        .cb-upsell p { margin: 0 0 24px; color: #475569; font-size: 14.5px; line-height: 1.6; }
        .cb-upsell-feats {
          text-align: left; display: grid; gap: 10px; margin: 0 auto 28px;
          max-width: 400px; font-size: 13.5px; color: #334155;
        }
        .cb-upsell-feats div { display: flex; align-items: center; gap: 8px; }
        .cb-upsell-feats svg { color: #10b981; flex-shrink: 0; }
        .cb-upsell-btn {
          display: inline-flex; align-items: center; gap: 8px; text-decoration: none;
          padding: 13px 24px; border-radius: 10px;
          background: linear-gradient(135deg, #f58220, #ea6a0f); color: #fff;
          font-weight: 700; font-size: 14px;
          box-shadow: 0 8px 20px rgba(245,130,32,0.3);
          transition: filter 0.1s;
        }
        .cb-upsell-btn:hover { filter: brightness(1.05); }
        .cb-upsell-fine { margin-top: 18px; font-size: 12px; color: #94a3b8; }
      `}</style>
    </div>
  )
}
