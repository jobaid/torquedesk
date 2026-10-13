// Public legal pages: About, Privacy, Terms (Legal), Service Agreement.
// Operator: Web Services LLC. One file, one route tree, no auth required.
//
// These are reasonable boilerplate drafted for an automotive-shop SaaS. They
// are NOT a substitute for review by a licensed attorney in your jurisdiction.
// Replace the [bracketed] placeholders before going live.

import { useParams, Link, Navigate, Routes, Route } from 'react-router-dom'
import { ShieldCheck, Lock, FileText, Handshake, ArrowLeft } from 'lucide-react'

const OPERATOR = 'Web Services LLC'
const PRODUCT = 'TorqueDesk'
const SUPPORT_EMAIL = 'support@webservicesllc.com'
const LEGAL_EMAIL   = 'legal@webservicesllc.com'
const EFFECTIVE     = 'October 13, 2026'
const JURISDICTION  = '[State], United States'
const COMPANY_ADDR  = '[Street address], [City], [State] [ZIP], USA'

const SECTIONS = [
  { key: 'about',     label: 'About',             icon: FileText },
  { key: 'privacy',   label: 'Privacy Policy',    icon: Lock },
  { key: 'terms',     label: 'Terms of Service',  icon: ShieldCheck },
  { key: 'agreement', label: 'Service Agreement', icon: Handshake },
]

export default function Legal() {
  return (
    <Routes>
      <Route index element={<Navigate to="about" replace />} />
      <Route path=":section" element={<LegalPage />} />
    </Routes>
  )
}

function LegalPage() {
  const { section } = useParams()
  const content = PAGES[section]
  if (!content) return <Navigate to="/legal/about" replace />
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 20px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" style={{ color: '#2554f5', textDecoration: 'none', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ArrowLeft size={14} /> Back to {PRODUCT}
          </Link>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
            {PRODUCT} is operated by {OPERATOR}
          </div>
        </div>
      </header>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px', display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24 }}>
        <aside>
          <nav style={{ position: 'sticky', top: 24, display: 'grid', gap: 2 }}>
            {SECTIONS.map((s) => (
              <Link key={s.key} to={`/legal/${s.key}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 12px', borderRadius: 8, textDecoration: 'none',
                  color: s.key === section ? '#0f172a' : '#475569',
                  background: s.key === section ? '#eef2ff' : 'transparent',
                  fontWeight: s.key === section ? 600 : 500,
                  fontSize: 14,
                }}>
                <s.icon size={15} /> {s.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '32px 36px' }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Effective {EFFECTIVE}
          </div>
          <h1 style={{ fontSize: 28, margin: '6px 0 20px', fontWeight: 700 }}>{content.title}</h1>
          <div style={{ fontSize: 15, lineHeight: 1.7, color: '#1f2937' }}>{content.body}</div>
          <footer style={{ marginTop: 48, padding: '16px 0 0', borderTop: '1px solid #e2e8f0', color: '#64748b', fontSize: 12 }}>
            Questions? Contact <a href={`mailto:${LEGAL_EMAIL}`} style={{ color: '#2554f5' }}>{LEGAL_EMAIL}</a>.
            <br />
            This document is informational and does not constitute legal advice. For jurisdiction-specific guidance consult a licensed attorney.
          </footer>
        </main>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Content

const H = ({ children }) => <h2 style={{ fontSize: 20, fontWeight: 700, margin: '28px 0 10px', color: '#0f172a' }}>{children}</h2>
const H3 = ({ children }) => <h3 style={{ fontSize: 16, fontWeight: 600, margin: '20px 0 8px', color: '#0f172a' }}>{children}</h3>
const P = ({ children }) => <p style={{ margin: '0 0 12px' }}>{children}</p>
const UL = ({ children }) => <ul style={{ margin: '0 0 12px 18px', padding: 0 }}>{children}</ul>
const LI = ({ children }) => <li style={{ margin: '0 0 6px' }}>{children}</li>

const PAGES = {
  about: {
    title: `About ${PRODUCT}`,
    body: (
      <>
        <P><strong>{PRODUCT}</strong> is an all-in-one shop management platform built for independent automobile repair businesses. It is designed and operated by <strong>{OPERATOR}</strong>.</P>

        <H>Our mission</H>
        <P>Help repair shop owners spend less time on paperwork and more time fixing cars — by replacing paper tickets, spreadsheets, and scattered tools with one connected workflow for estimates, repair orders, inspections, authorizations, invoices, and payments.</P>

        <H>What we build</H>
        <UL>
          <LI>Digital estimates, repair orders, and invoices with inline parts, labor, taxes, fees, and discounts.</LI>
          <LI>Digital vehicle inspections with photo capture and customer share links.</LI>
          <LI>Online authorizations and payments via Stripe.</LI>
          <LI>Multi-user shop staff accounts with role-based access.</LI>
          <LI>Technical support ticket system to resolve problems quickly.</LI>
        </UL>

        <H>Who we are</H>
        <P>{OPERATOR} is a software company registered in {JURISDICTION}. Our principal office is located at:</P>
        <P style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>{COMPANY_ADDR}</P>

        <H>Contact</H>
        <UL>
          <LI>Support: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></LI>
          <LI>Legal / Privacy: <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a></LI>
        </UL>
      </>
    ),
  },

  privacy: {
    title: 'Privacy Policy',
    body: (
      <>
        <P>{OPERATOR} ("we", "us", "our") operates {PRODUCT}. This policy explains what personal information we collect, how we use it, and the choices you have.</P>

        <H>1. Information we collect</H>
        <H3>a) Account information</H3>
        <P>When a shop signs up we collect the shop name, address, admin email, admin name, phone number, and a password hash (we never store plaintext passwords).</P>

        <H3>b) Shop and customer data</H3>
        <P>Information you enter into {PRODUCT} to run your business: customers, vehicles, estimates, invoices, inspection photos, payment records, and messages. You own this data; we are a processor acting on your instructions.</P>

        <H3>c) Payment information</H3>
        <P>Subscription payments and (optionally) customer payments are processed by <strong>Stripe, Inc.</strong> Card details are entered on Stripe-hosted pages and never touch our servers. We store only Stripe identifiers, last-4 digits, and billing status.</P>

        <H3>d) Technical data</H3>
        <P>IP address, browser user agent, request logs, error reports, and audit records of significant actions. Retained for up to 12 months for security, debugging, and abuse prevention.</P>

        <H>2. How we use information</H>
        <UL>
          <LI>To provide, maintain, and improve {PRODUCT}.</LI>
          <LI>To authenticate users and prevent fraud.</LI>
          <LI>To process subscription payments and send transactional emails (receipts, password resets, support ticket updates).</LI>
          <LI>To respond to support requests.</LI>
          <LI>To comply with legal obligations.</LI>
        </UL>
        <P>We do not sell personal information. We do not use shop or customer data for advertising.</P>

        <H>3. Sharing</H>
        <P>We share data only with service providers acting on our behalf under written agreements: Stripe (payments), our email delivery provider, our cloud hosting provider, and our analytics provider. We may disclose data when required by law.</P>

        <H>4. Data security</H>
        <UL>
          <LI>Passwords hashed with <strong>Argon2id</strong>.</LI>
          <LI>Sensitive settings (SMTP creds, OAuth tokens) encrypted at rest with AES-GCM.</LI>
          <LI>HTTPS enforced for all traffic.</LI>
          <LI>Multi-factor authentication available for both shop and admin accounts.</LI>
          <LI>Role-based access controls, strict tenant isolation on every endpoint.</LI>
        </UL>

        <H>5. Data retention</H>
        <P>Shop and customer data is retained for as long as your subscription is active. On account closure, data is kept for 30 days (so you can restore in case of mistake) and then deleted. You can request immediate deletion by emailing <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>.</P>

        <H>6. Your rights</H>
        <P>Depending on your jurisdiction (GDPR, CCPA, etc.) you may have the right to access, correct, port, or delete personal information about you. Submit requests to <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>; we will respond within 30 days.</P>

        <H>7. Children</H>
        <P>{PRODUCT} is a business tool not intended for use by anyone under 16.</P>

        <H>8. International transfers</H>
        <P>{PRODUCT} is hosted in the United States. By using the service you consent to the transfer of your data to the United States, which may have different data protection laws than your country.</P>

        <H>9. Changes</H>
        <P>We will notify shop admins by email at least 14 days before any material change to this policy takes effect.</P>

        <H>10. Contact</H>
        <P>Privacy questions: <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>.</P>
      </>
    ),
  },

  terms: {
    title: 'Terms of Service',
    body: (
      <>
        <P>These Terms govern your access to and use of {PRODUCT}, operated by {OPERATOR} ("we", "us"). By creating an account or using the service, you agree to these Terms.</P>

        <H>1. Account</H>
        <P>You must be at least 18 and legally able to enter contracts. You are responsible for all activity under your account and for keeping credentials secure. Notify us promptly at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> if you suspect unauthorized access.</P>

        <H>2. Subscription and billing</H>
        <UL>
          <LI>Fees are shown in your plan at signup. We may change prices with 30 days notice to the admin email on file.</LI>
          <LI>Subscriptions auto-renew unless cancelled. You can cancel any time from <em>Settings → Billing</em>; cancellation takes effect at the end of the current billing period.</LI>
          <LI>Free trials, if offered, convert automatically to paid plans at the end of the trial unless cancelled.</LI>
          <LI>All fees are non-refundable except where required by law.</LI>
        </UL>

        <H>3. Acceptable use</H>
        <P>You agree not to:</P>
        <UL>
          <LI>Violate any law or infringe anyone's rights.</LI>
          <LI>Upload malware or probe, scan, or attempt to breach the service.</LI>
          <LI>Resell, sublicense, or white-label {PRODUCT} without a written agreement with us.</LI>
          <LI>Use the service to send spam or any unsolicited bulk communication.</LI>
        </UL>

        <H>4. Your data</H>
        <P>You retain all rights to data you enter into {PRODUCT}. You grant us a limited license to process that data solely to provide the service, as described in the Privacy Policy. We will not use your shop or customer data for advertising or sell it.</P>

        <H>5. Our intellectual property</H>
        <P>The {PRODUCT} software, name, branding, documentation, and content provided by us are the property of {OPERATOR}. You receive a limited, non-exclusive, non-transferable license to use the service during your subscription.</P>

        <H>6. Service availability</H>
        <P>We target 99.5% monthly uptime but do not guarantee uninterrupted service. Scheduled maintenance will be announced in advance where practical.</P>

        <H>7. Suspension and termination</H>
        <P>We may suspend or terminate accounts that violate these Terms, that have unpaid fees after 15 days, or that pose a security risk. You may terminate at any time by cancelling your subscription and emailing <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> to request data deletion.</P>

        <H>8. Disclaimers</H>
        <P style={{ textTransform: 'uppercase', fontSize: 13 }}>The service is provided "as is" and "as available" without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the service will be error-free or uninterrupted.</P>

        <H>9. Limitation of liability</H>
        <P style={{ textTransform: 'uppercase', fontSize: 13 }}>To the maximum extent permitted by law, our aggregate liability for any claim arising out of or relating to the service is limited to the fees you paid us in the 12 months preceding the event giving rise to the claim. We are not liable for indirect, incidental, consequential, or punitive damages.</P>

        <H>10. Indemnification</H>
        <P>You will defend and indemnify {OPERATOR} from any claim arising out of your misuse of the service, your violation of these Terms, or your violation of any law or third-party right.</P>

        <H>11. Governing law and venue</H>
        <P>These Terms are governed by the laws of {JURISDICTION}, without regard to conflict-of-laws principles. Any dispute will be resolved in the state or federal courts located in {JURISDICTION}, and you consent to that jurisdiction.</P>

        <H>12. Changes</H>
        <P>We may update these Terms. Material changes will be announced by email at least 14 days before taking effect; continued use after the effective date constitutes acceptance.</P>

        <H>13. Contact</H>
        <P>Legal notices: <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>.</P>
      </>
    ),
  },

  agreement: {
    title: 'Service Agreement',
    body: (
      <>
        <P>This Service Agreement ("Agreement") is between <strong>{OPERATOR}</strong> ("Provider") and the subscribing business ("Customer"). By using {PRODUCT}, Customer accepts this Agreement.</P>

        <H>1. The service</H>
        <P>Provider gives Customer access to {PRODUCT} — a cloud-based shop management platform — for the duration of Customer's active subscription.</P>

        <H>2. Fees</H>
        <P>Customer pays the subscription fee shown in Customer's plan. Fees are billed in advance each billing period via Stripe. Taxes, if applicable, are added at the rate in effect at the time of billing.</P>

        <H>3. Customer data</H>
        <UL>
          <LI>Customer owns all data entered into {PRODUCT}. Provider acts as a data processor under Customer's instructions.</LI>
          <LI>Customer is responsible for the accuracy, legality, and backup of its own data. Provider's backups are a safety net, not a replacement for Customer's independent record-keeping obligations.</LI>
          <LI>On termination, Customer may export its data for 30 days. After 30 days, data is permanently deleted unless legally required otherwise.</LI>
        </UL>

        <H>4. Security</H>
        <P>Provider will apply commercially reasonable administrative, technical, and physical safeguards: Argon2id password hashing, encryption at rest for sensitive settings, HTTPS in transit, role-based access, tenant isolation, and 24-hour patching of critical vulnerabilities.</P>

        <H>5. Confidentiality</H>
        <P>Each party will protect the other's confidential information with the same care it uses for its own, and no less than reasonable care. This does not apply to information that is public, independently developed, or lawfully received from a third party.</P>

        <H>6. Service levels</H>
        <P>Provider targets 99.5% monthly uptime excluding scheduled maintenance, force majeure, and Customer-caused outages. Credits for prolonged outages, if any, are specified in Customer's plan.</P>

        <H>7. Support</H>
        <P>Standard support is provided through the in-app technical support ticket system and <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Response targets by priority: Urgent 1h, High 2h, Normal 8h, Low 24h.</P>

        <H>8. Compliance</H>
        <P>Customer is solely responsible for its compliance with laws applicable to its business, including consumer protection, data protection (GDPR, CCPA, PIPEDA, etc.), tax, and automotive repair regulations. Provider provides the software; Customer determines how to use it.</P>

        <H>9. Changes</H>
        <P>Provider may update {PRODUCT} and this Agreement from time to time. Material changes will be announced by email at least 14 days in advance. Continued use after the effective date constitutes acceptance.</P>

        <H>10. Term and termination</H>
        <P>This Agreement is effective from acceptance and continues for as long as Customer's subscription is active. Either party may terminate for material breach after 15 days written notice if the breach is not cured. Fees already paid are non-refundable except where required by law.</P>

        <H>11. Limitation of liability</H>
        <P style={{ textTransform: 'uppercase', fontSize: 13 }}>Provider's total liability under this Agreement is limited to the fees paid by Customer in the 12 months preceding the claim. Neither party is liable for indirect, incidental, consequential, or punitive damages. This limitation does not apply to indemnification obligations, breach of confidentiality, or claims for which liability cannot be limited by law.</P>

        <H>12. Governing law</H>
        <P>This Agreement is governed by the laws of {JURISDICTION}. Disputes will be resolved in the courts of that jurisdiction.</P>

        <H>13. Entire agreement</H>
        <P>This Agreement, together with the Terms of Service and Privacy Policy, is the entire agreement between the parties regarding {PRODUCT}, superseding any prior discussions or representations.</P>

        <P style={{ marginTop: 24, padding: 14, background: '#f1f5f9', borderRadius: 8, fontSize: 13, color: '#475569' }}>
          <strong>Note:</strong> {OPERATOR} recommends Customer have this Agreement reviewed by its own attorney before relying on it for a specific business arrangement.
        </P>
      </>
    ),
  },
}
