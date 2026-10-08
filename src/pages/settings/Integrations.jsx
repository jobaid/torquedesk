import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CreditCard, Mail, CheckCircle2, AlertCircle, Settings as Cog, RefreshCw, ExternalLink } from 'lucide-react'
import { SectionHead } from './kit'
import { api } from '../../lib/api'

// Integrations hub — one screen showing every third-party connection the shop
// uses, with current status and a one-click path to its deep settings page.
//
// Status is derived from existing endpoints, so this page is purely
// read-only + navigational. The actual configuration lives on each
// integration's own settings page.

export function Integrations() {
  const [loading, setLoading] = useState(true)
  const [gateways, setGateways] = useState([])
  const [notif, setNotif] = useState(null)
  const [oauth, setOauth] = useState({ available: {}, connected: {} })

  const load = async () => {
    setLoading(true)
    try {
      const [gw, n, o] = await Promise.all([
        api('/settings/payment-gateways').catch(() => []),
        api('/settings/notifications').catch(() => null),
        api('/mail/oauth/status').catch(() => ({ available: {}, connected: {} })),
      ])
      setGateways(Array.isArray(gw) ? gw : [])
      setNotif(n)
      setOauth(o || { available: {}, connected: {} })
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const stripe = gateways.find((g) => g.provider === 'stripe')
  const authnet = gateways.find((g) => g.provider === 'authorize_net')
  const smtpConnected = !!(notif?.hasPassword && notif?.smtpHost && notif?.fromEmail)
  const google = oauth.connected?.google
  const microsoft = oauth.connected?.microsoft

  return (
    <div>
      <SectionHead
        title="Integrations"
        description="Third-party services connected to this shop. Click Manage to configure or reconnect."
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        <IntegrationTile
          icon={<CreditCard size={22} color="#635bff" />}
          name="Stripe"
          category="Payments"
          description="Charge customers for invoices through Stripe Checkout."
          status={gatewayStatus(stripe)}
          detail={stripe?.verified ? `${stripe.mode === 'live' ? 'Live' : 'Test'} mode` : stripe ? 'Keys entered, not verified' : null}
          manageTo="/settings/financial/payment-gateways"
          docsUrl="https://dashboard.stripe.com/apikeys"
        />

        <IntegrationTile
          icon={<CreditCard size={22} color="#0082c6" />}
          name="Authorize.Net"
          category="Payments"
          description="Accept cards through your Authorize.Net merchant account."
          status={gatewayStatus(authnet)}
          detail={authnet?.verified ? `${authnet.mode === 'live' ? 'Live' : 'Sandbox'} mode` : authnet ? 'Keys entered, not verified' : null}
          manageTo="/settings/financial/payment-gateways"
          docsUrl="https://account.authorize.net/"
        />

        <IntegrationTile
          icon={<Mail size={22} color="#ea4335" />}
          name="Gmail"
          category="Email"
          description="Send shop email through a Google account (OAuth or app password)."
          status={google ? 'connected' : (smtpConnected && (notif?.smtpHost || '').includes('gmail') ? 'connected' : 'disconnected')}
          detail={google?.email || (smtpConnected && (notif?.smtpHost || '').includes('gmail') ? notif?.fromEmail : null)}
          manageTo="/settings/general/notifications"
          docsUrl="https://support.google.com/accounts/answer/185833"
        />

        <IntegrationTile
          icon={<Mail size={22} color="#0078d4" />}
          name="Microsoft 365 / Outlook"
          category="Email"
          description="Send shop email through an Outlook account (OAuth or app password)."
          status={microsoft ? 'connected' : (smtpConnected && (notif?.smtpHost || '').includes('outlook') ? 'connected' : 'disconnected')}
          detail={microsoft?.email || (smtpConnected && (notif?.smtpHost || '').includes('outlook') ? notif?.fromEmail : null)}
          manageTo="/settings/general/notifications"
          docsUrl="https://support.microsoft.com/en-us/account-billing/5896ed9b-4263-e681-128a-a6f2979a7944"
        />

        <IntegrationTile
          icon={<Mail size={22} color="#6b7280" />}
          name="SMTP server"
          category="Email"
          description="Catch-all for any other provider — SendGrid, Postmark, Mailgun, SES, your own host."
          status={smtpConnected ? 'connected' : 'disconnected'}
          detail={smtpConnected ? `${notif?.fromEmail} via ${notif?.smtpHost}` : null}
          manageTo="/settings/general/notifications"
        />
      </div>
    </div>
  )
}

function gatewayStatus(g) {
  if (!g) return 'disconnected'
  if (g.verified) return 'connected'
  return 'warning'
}

function IntegrationTile({ icon, name, category, description, status, detail, manageTo, docsUrl }) {
  const styles = {
    connected:    { bg: '#dcfce7', fg: '#065f46', border: '#86efac', label: 'Connected' },
    warning:      { bg: '#fef3c7', fg: '#92400e', border: '#fde68a', label: 'Needs verification' },
    disconnected: { bg: '#f3f4f6', fg: '#4b5563', border: '#e5e7eb', label: 'Not connected' },
  }[status]
  const Icon = status === 'connected' ? CheckCircle2 : AlertCircle
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 8, background: '#f9fafb', display: 'grid', placeItems: 'center' }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{name}</div>
          <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em' }}>{category}</div>
        </div>
        <span style={{
          padding: '3px 10px', borderRadius: 999,
          background: styles.bg, color: styles.fg, border: `1px solid ${styles.border}`,
          fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <Icon size={11} /> {styles.label}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: '#4b5563', lineHeight: 1.45 }}>{description}</div>
      {detail && <div style={{ fontSize: 12, color: '#111', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px' }}><strong>{detail}</strong></div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 4 }}>
        <Link to={manageTo} className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px', textDecoration: 'none' }}>
          <Cog size={13} /> {status === 'connected' ? 'Manage' : 'Connect'}
        </Link>
        {docsUrl && (
          <a href={docsUrl} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 12px', textDecoration: 'none' }}>
            <ExternalLink size={13} /> Docs
          </a>
        )}
      </div>
    </div>
  )
}
