import { Link } from 'react-router-dom'
import { FileText, Lock, ShieldCheck, Handshake, ExternalLink } from 'lucide-react'

const OPERATOR = 'Web Services LLC'
const DOMAIN = '10corp.com'
const SUPPORT = 'support@10corp.com'
const LEGAL = 'legal@10corp.com'
const ADDR = '8206 Louisiana Blvd NE, Suite A, Albuquerque, NM 87113, USA'
const JURISDICTION = 'New Mexico, United States'

export default function About() {
  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>About TorqueDesk</h1>
      <div style={{ color: '#64748b', fontSize: 13, marginBottom: 24 }}>
        Operated by {OPERATOR} · <a href={`https://${DOMAIN}`} target="_blank" rel="noreferrer" style={{ color: '#2554f5' }}>{DOMAIN}</a>
      </div>

      <section style={card}>
        <h2 style={h2}>Our mission</h2>
        <p style={p}>
          Help independent repair shops spend less time on paperwork and more time fixing cars — by replacing paper tickets, spreadsheets, and scattered tools with one connected workflow for estimates, repair orders, inspections, authorizations, invoices, and payments.
        </p>
      </section>

      <section style={card}>
        <h2 style={h2}>Operator</h2>
        <table style={{ width: '100%', fontSize: 14, color: '#334155' }}>
          <tbody>
            <Row k="Company" v={OPERATOR} />
            <Row k="Jurisdiction" v={JURISDICTION} />
            <Row k="Registered office" v={ADDR} />
            <Row k="Support" v={<a href={`mailto:${SUPPORT}`} style={link}>{SUPPORT}</a>} />
            <Row k="Legal / Privacy" v={<a href={`mailto:${LEGAL}`} style={link}>{LEGAL}</a>} />
          </tbody>
        </table>
      </section>

      <section style={card}>
        <h2 style={h2}>Legal documents</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          <LegalLink to="/legal/agreement" icon={Handshake} label="Service Agreement" desc="The contract between your shop and Web Services LLC." />
          <LegalLink to="/legal/terms"     icon={ShieldCheck} label="Terms of Service" desc="Rules of use, subscription terms, and liability." />
          <LegalLink to="/legal/privacy"   icon={Lock} label="Privacy Policy" desc="What personal information we collect and how we use it." />
          <LegalLink to="/legal/about"     icon={FileText} label="Full About page" desc="Public-facing company overview." />
        </div>
      </section>

      <div style={{ marginTop: 20, fontSize: 12, color: '#64748b' }}>
        Version: <code>TorqueDesk web app</code> · For incidents or outages, open a ticket in <Link to="/support" style={link}>Technical Support</Link>.
      </div>
    </div>
  )
}

function Row({ k, v }) {
  return (
    <tr style={{ borderTop: '1px solid #f1f5f9' }}>
      <td style={{ padding: '8px 10px 8px 0', fontSize: 12, color: '#64748b', width: 160, verticalAlign: 'top' }}>{k}</td>
      <td style={{ padding: '8px 0' }}>{v}</td>
    </tr>
  )
}

function LegalLink({ to, icon: Icon, label, desc }) {
  return (
    <Link to={to} target="_blank" rel="noreferrer"
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 8, textDecoration: 'none', color: '#0f172a', background: '#fff' }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#eef2ff', color: '#2554f5', display: 'grid', placeItems: 'center' }}><Icon size={16} /></div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>{desc}</div>
      </div>
      <ExternalLink size={14} color="#94a3b8" />
    </Link>
  )
}

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 18, marginBottom: 14 }
const h2 = { fontSize: 15, fontWeight: 700, margin: '0 0 10px' }
const p = { fontSize: 14, lineHeight: 1.6, color: '#334155', margin: 0 }
const link = { color: '#2554f5', textDecoration: 'none' }
