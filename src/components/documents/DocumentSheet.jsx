import { computeTotals, lineTotal, discountAmount } from '../../lib/totals'
import { money } from '../../lib/format'
import { PAYMENT_METHODS, DOC_TYPE_LABELS, logoUrl } from '../../store/useSettings'
import { useApp } from '../../store/useApp'

const fmtDate = (s) => (s ? new Date(`${s}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '')
const fmtDateTime = (s) => (s ? new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')

/**
 * Customer-facing document: estimate, repair order, invoice or statement.
 * Financial values and display options come from doc.snapshot (frozen at creation);
 * branding (shop details, logo, header/footer, licenses) uses current settings.
 * Cost, markup, margin and vendor are never printed.
 */
export default function DocumentSheet({ doc, settings, statementRows, logoOverride }) {
  const shop = settings.shop || {}
  const hf = settings['header-footer'] || {}
  const opts = doc.snapshot?.options || {}
  const t = computeTotals(doc)
  const cid = useApp((s) => s.user?.companyId)
  const logo = logoOverride !== undefined ? logoOverride : logoUrl(settings.printing, cid)
  const customer = doc.customerSnapshot || {}
  const v = doc.vehicleSnapshot
  const unit = doc.odometerUnit === 'km' ? 'km' : 'mi'
  const isStatement = doc.type === 'statement'
  const address = [shop.address1, shop.address2, [shop.city, shop.state].filter(Boolean).join(', ') + (shop.zip ? ` ${shop.zip}` : '')].filter((x) => x && x.trim())
  const licenses = (settings.licenses || []).filter((l) => (l.type === 'license' && hf.footerShowLicenses) || (l.type === 'certification' && hf.footerShowCertifications) || (l.type === 'registration' && hf.footerShowRegistrations))

  return (
    <article className="doc-sheet" aria-label={`${DOC_TYPE_LABELS[doc.type]} ${doc.number}`}>
      <header className={`ds-head ${hf.headerLayout || 'logo_left'}`}>
        <div className="ds-brand">
          {hf.headerShowLogo && logo && <img src={logo} alt={`${shop.shopName} logo`} className="ds-logo" />}
          <div>
            {hf.headerShowName && <div className="ds-shop">{shop.shopName}</div>}
            {hf.headerShowAddress && address.map((l) => <div key={l}>{l}</div>)}
            {hf.headerShowPhone && shop.phone && <div>{shop.phone}{shop.phone2 ? ` · ${shop.phone2}` : ''}</div>}
            {hf.headerShowEmail && shop.email && <div>{shop.email}</div>}
            {hf.headerShowWebsite && shop.website && <div>{shop.website}</div>}
            {hf.headerCustomText && <div className="ds-custom">{hf.headerCustomText}</div>}
          </div>
        </div>
        <div className="ds-title">
          <div className="ds-type">{DOC_TYPE_LABELS[doc.type]}</div>
          <div className="ds-num">#{doc.number}</div>
          <dl>
            <dt>Date</dt><dd>{fmtDateTime(doc.updatedAt)}</dd>
            {doc.type === 'estimate' && doc.expiresAt && <><dt>Valid until</dt><dd>{fmtDate(doc.expiresAt)}</dd></>}
            {doc.writer && <><dt>Service writer</dt><dd>{doc.writer}</dd></>}
            {opts.showTechnician && doc.technician && !isStatement && <><dt>Technician</dt><dd>{doc.technician}</dd></>}
            {opts.showPromisedDate && doc.promised && !isStatement && <><dt>Promised</dt><dd>{fmtDateTime(doc.promised)}</dd></>}
          </dl>
        </div>
      </header>

      <section className="ds-parties">
        <div>
          <div className="ds-label">{isStatement ? 'Account' : 'Customer'}</div>
          <div className="ds-strong">{customer.name || 'Walk-in customer'}</div>
          {customer.phone && <div>{customer.phone}</div>}
          {customer.email && <div>{customer.email}</div>}
        </div>
        {!isStatement && (
          <div>
            <div className="ds-label">Vehicle</div>
            <div className="ds-strong">{v ? `${v.year} ${v.make} ${v.model}` : '—'}</div>
            {v?.engineLabel && <div>{[v.trim, v.engineLabel].filter(Boolean).join(' · ')}</div>}
            {v?.vin && <div className="ds-mono">VIN {v.vin}</div>}
            <div>Odometer in: {doc.mileageIn ? `${Number(doc.mileageIn).toLocaleString()} ${unit}` : '—'}{doc.type === 'invoice' && <> · out: {doc.mileageOut ? `${Number(doc.mileageOut).toLocaleString()} ${unit}` : '—'}</>}</div>
          </div>
        )}
      </section>

      {isStatement ? (
        <table className="ds-table">
          <thead><tr><th>Date</th><th>Document</th><th className="r">Charges</th><th className="r">Payments</th><th className="r">Balance</th></tr></thead>
          <tbody>
            {(statementRows || []).map((r) => <tr key={r.number}><td>{r.date}</td><td>{r.number}</td><td className="r">{money(r.charges)}</td><td className="r">{money(r.payments)}</td><td className="r">{money(r.charges - r.payments)}</td></tr>)}
          </tbody>
          <tfoot><tr><td colSpan={4} className="r ds-strong">Amount due</td><td className="r ds-strong">{money((statementRows || []).reduce((a, r) => a + r.charges - r.payments, 0))}</td></tr></tfoot>
        </table>
      ) : (
        <>
          <table className="ds-table">
            <thead>
              <tr><th>Description</th><th className="r">{opts.showLaborRates ? 'Qty / Hrs' : 'Qty'}</th><th className="r">Rate / Price</th><th className="r">Amount</th></tr>
            </thead>
            <tbody>
              {(doc.items || []).map((i) => {
                if (i.kind === 'note') return <tr key={i.id} className="ds-note"><td colSpan={4}>{i.description}</td></tr>
                if (i.kind === 'discount') return <tr key={i.id}><td>{i.description}{i.mode === 'percent' ? ` (${i.value}% off ${i.appliesTo === 'all' ? 'order' : i.appliesTo})` : ''}</td><td /><td /><td className="r">−{money(discountAmount(i, t))}</td></tr>
                const hideLabor = i.kind === 'labor' && !opts.showLaborRates
                return (
                  <tr key={i.id}>
                    <td>
                      {i.description}
                      {i.kind === 'part' && opts.showPartNumbers && i.partNumber && <span className="ds-pn"> · Part # {i.partNumber}</span>}
                    </td>
                    <td className="r">{hideLabor ? '' : i.qty}</td>
                    <td className="r">{hideLabor ? '' : money(i.price)}{i.kind === 'labor' && !hideLabor ? '/hr' : ''}</td>
                    <td className="r">{hideLabor ? '' : money(lineTotal(i))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="ds-bottom">
            <div className="ds-left">
              {doc.saveParts && doc.type !== 'estimate' && <div className="ds-box">☑ Customer requests that replaced parts be saved for inspection.</div>}
              {doc.authorization?.approved && <div className="ds-small">Authorized by {doc.authorization.by} via {doc.authorization.method}{doc.authorization.at ? ` on ${fmtDateTime(doc.authorization.at)}` : ''}.</div>}
            </div>
            <table className="ds-totals">
              <tbody>
                <tr><td>Labor</td><td className="r">{money(t.labor)}</td></tr>
                <tr><td>Parts</td><td className="r">{money(t.parts)}</td></tr>
                {t.fees > 0 && <tr><td>Fees</td><td className="r">{money(t.fees)}</td></tr>}
                {t.shopFees.filter((f) => f.amount > 0).map((f) => <tr key={f.id}><td>{f.name}{f.calcBy === 'percent' ? ` (${f.percentage}%)` : ''}</td><td className="r">{money(f.amount)}</td></tr>)}
                {t.discountTotal > 0 && <tr><td>Discounts</td><td className="r">−{money(t.discountTotal)}</td></tr>}
                <tr className="ds-sub"><td>Subtotal</td><td className="r">{money(t.subtotal)}</td></tr>
                {t.taxes.map((x) => <tr key={x.id}><td>{x.name} ({x.rate}%)</td><td className="r">{money(x.amount)}</td></tr>)}
                {t.taxes.length > 1 && <tr><td>Total tax ({t.combinedRate}%)</td><td className="r">{money(t.tax)}</td></tr>}
                <tr className="ds-total"><td>Total</td><td className="r">{money(t.total)}</td></tr>
                {t.paid > 0 && <><tr><td>Paid</td><td className="r">−{money(t.paid)}</td></tr><tr className="ds-sub"><td>Balance due</td><td className="r">{money(t.balance)}</td></tr></>}
              </tbody>
            </table>
          </div>
        </>
      )}

      <section className="ds-sign">
        {opts.showPaymentMethods && (opts.paymentMethods || []).length > 0 && (
          <div className="ds-pay">
            <span className="ds-label">Intended method of payment:</span>
            {opts.paymentMethods.map((m) => <span key={m} className="ds-check">{(doc.paymentMethods || []).includes(m) ? '☑' : '☐'} {PAYMENT_METHODS[m]}</span>)}
          </div>
        )}
        {!isStatement && <div className="ds-sigline"><span>Customer signature</span><span>Date</span></div>}
      </section>

      <footer className="ds-foot">
        {hf.footerCustomText && <p className="ds-strong">{hf.footerCustomText}</p>}
        {hf.paymentInstructions && <p>{hf.paymentInstructions}</p>}
        {hf.warrantyText && <p>{hf.warrantyText}</p>}
        {hf.customNotes && <p>{hf.customNotes}</p>}
        {licenses.length > 0 && <p className="ds-small">{licenses.map((l) => `${l.name}${l.number ? ` #${l.number}` : ''}`).join(' · ')}</p>}
      </footer>
    </article>
  )
}

/** A realistic sample document built from the CURRENT settings, for the live preview. */
export function buildPreviewDoc(type, settings) {
  const fees = (settings['shop-fees'] || []).filter((f) => f.active)
  const taxes = (settings['tax-rates'] || []).filter((x) => x.active)
  const markups = (settings.markups || []).filter((m) => m.active)
  const opts = settings['document-options'] || {}
  const rate = settings.laborRate?.rate || 0
  const partsMarkup = markups.find((m) => m.appliesTo === 'parts')
  const markupOf = (cost) => (partsMarkup ? (partsMarkup.calcType === 'percent' ? cost * (1 + partsMarkup.percentage / 100) : cost + partsMarkup.amount) : cost)
  const tech = (settings.technicians || []).find((x) => x.active)
  const writer = (settings['service-writers'] || []).find((x) => x.active)
  const today = new Date()
  const expires = new Date(today.getTime() + (settings.estimate?.validityDays || 14) * 86400000)
  const numbering = (settings.numbering || []).find((n) => n.docType === type)
  return {
    id: 'preview', type, number: `${numbering?.prefix || ''}${numbering?.nextNumber || 1001}`,
    updatedAt: Date.now(), expiresAt: expires.toISOString().slice(0, 10),
    writer: writer?.displayName || 'TEE', technician: tech?.displayName || 'DOUGLAZ',
    promised: new Date(today.getTime() + 2 * 86400000).toISOString().slice(0, 16),
    customerSnapshot: { name: 'Jordan Lee', phone: '(410) 555-0100', email: 'jordan@example.com' },
    vehicleSnapshot: { year: 2021, make: 'Toyota', model: 'Camry', trim: 'SE', engineLabel: '2.5L 4-Cylinder', vin: '4T1G11AK5MU123456' },
    mileageIn: '48210', mileageOut: '48215', odometerUnit: settings['document-preferences']?.defaultOdometerUnit || 'mi',
    saveParts: !!opts.savePartsDefault, paymentMethods: (opts.paymentMethods || []).slice(0, 1),
    taxIds: taxes.filter((x) => x.isDefault).map((x) => x.id), feesOff: [], payments: type === 'invoice' ? [{ id: 'p', amount: 100, method: 'Card' }] : [],
    authorization: type !== 'estimate' ? { approved: true, by: 'Jordan Lee', method: 'Phone' } : null,
    items: [
      { id: 'a', kind: 'labor', description: 'Front brake pad replacement', qty: 1.0, price: rate },
      { id: 'b', kind: 'part', description: 'Front brake pad set', partNumber: 'BP-F4410', qty: 1, cost: 46, price: Math.round(markupOf(46) * 100) / 100, taxable: true },
      { id: 'c', kind: 'part', description: 'Pad hardware kit', partNumber: 'HK-2210', qty: 1, cost: 9, price: Math.round(markupOf(9) * 100) / 100, taxable: true },
      { id: 'd', kind: 'note', description: 'Rotors measured within specification.' },
    ],
    snapshot: {
      laborRate: rate,
      taxes, fees, markups,
      options: {
        showPartNumbers: opts.showPartNumbers, showLaborRates: opts.showLaborRates, showTechnician: opts.showTechnician,
        showPromisedDate: opts.showPromisedDate, showPaymentMethods: opts.showPaymentMethods, paymentMethods: opts.paymentMethods,
      },
    },
  }
}

export const SAMPLE_STATEMENT = [
  { date: '09/12/2026', number: 'INV-9001', charges: 412.37, payments: 412.37 },
  { date: '09/28/2026', number: 'INV-9007', charges: 268.5, payments: 100 },
  { date: '10/01/2026', number: 'INV-9012', charges: 89.95, payments: 0 },
]
