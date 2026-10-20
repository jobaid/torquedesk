import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ownerApi } from '../../store/useOwner'
import { Card, PageHeader, Btn, Input, Select, Field } from './primitives'

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const codeify = (s) => s.toUpperCase().replace(/[^A-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)

export default function AddCompany() {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [generalError, setGeneralError] = useState(null)
  const [plans, setPlans] = useState([])
  const [f, setF] = useState({
    name: '', legalName: '', companyCode: '', slug: '',
    phone: '', email: '', website: '', industry: 'Automotive', timezone: 'America/New_York',
    street: '', city: '', state: '', zip: '', country: 'US',
    applicationUrl: '', notes: '',
    ownerFirstName: '', ownerLastName: '', ownerEmail: '', ownerPhone: '', ownerUsername: '', ownerPassword: '',
    plan: '', billingCycle: 'monthly', monthlyPrice: '', annualPrice: '', endDate: '',
  })
  const set = (k, v) => setF((old) => ({ ...old, [k]: v }))

  // Load dynamic plans (owner-managed, from signup_plans table) so the
  // dropdown always reflects what's actually sellable.
  useEffect(() => {
    ownerApi('/plans').then((rows) => {
      const arr = Array.isArray(rows) ? rows : []
      setPlans(arr)
      if (arr.length && !f.plan) {
        const first = arr[0]
        setF((old) => ({ ...old, plan: first.key, monthlyPrice: String(first.monthlyPrice), annualPrice: String(first.annualPrice) }))
      }
    }).catch(() => { /* ignore â€” form stays open with blank plan selector */ })
  }, [])

  // When the chosen plan changes, auto-fill the prices to match (the owner
  // can still override before saving).
  const setPlan = (key) => {
    const p = plans.find((x) => x.key === key)
    setF((old) => ({ ...old, plan: key, monthlyPrice: p ? String(p.monthlyPrice) : old.monthlyPrice, annualPrice: p ? String(p.annualPrice) : old.annualPrice }))
  }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    setGeneralError(null)
    try {
      const body = {
        name: f.name, legalName: f.legalName,
        companyCode: f.companyCode || codeify(f.name) + '-' + Math.floor(100 + Math.random() * 900),
        slug: f.slug || slugify(f.name),
        address: { street: f.street, city: f.city, state: f.state, zip: f.zip, country: f.country },
        phone: f.phone, email: f.email, website: f.website, industry: f.industry, timezone: f.timezone,
        applicationUrl: f.applicationUrl, notes: f.notes,
        owner: {
          FirstName: f.ownerFirstName, LastName: f.ownerLastName, Email: f.ownerEmail,
          Phone: f.ownerPhone, Username: f.ownerUsername, Password: f.ownerPassword,
        },
        subscription: {
          Plan: f.plan, BillingCycle: f.billingCycle,
          MonthlyPrice: f.monthlyPrice || '0', AnnualPrice: f.annualPrice || '0',
          EndDate: f.endDate,
        },
      }
      const created = await ownerApi('/companies', { method: 'POST', body })
      navigate(`${window.location.pathname.startsWith('/owner') ? '/owner' : '/main/admin'}/companies/${created.id}`)
    } catch (err) {
      setGeneralError(err.message)
      setErrors(err.fields || {})
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <PageHeader
        title="Add company"
        subtitle="Create a company, its primary owner, and an initial subscription."
        actions={<Btn variant="secondary" onClick={() => navigate(-1)}><ArrowLeft size={14} />Back</Btn>}
      />
      <form onSubmit={submit}>
        {generalError && <Card style={{ marginBottom: 14, color: '#dc2626' }}>{generalError}</Card>}

        <Section title="Company">
          <Grid cols={2}>
            <Field label="Company name *" error={errors['name']}><Input required value={f.name} onChange={(e) => { set('name', e.target.value); if (!f.slug) set('slug', slugify(e.target.value)) }} /></Field>
            <Field label="Legal business name"><Input value={f.legalName} onChange={(e) => set('legalName', e.target.value)} /></Field>
            <Field label="Company ID / Code *" hint="e.g. ABC-AUTO-001" error={errors['companyCode']}><Input value={f.companyCode} onChange={(e) => set('companyCode', codeify(e.target.value))} placeholder="Auto-generated if blank" /></Field>
            <Field label="Slug *" hint="lowercase, hyphens, used in URLs" error={errors['slug']}><Input value={f.slug} onChange={(e) => set('slug', slugify(e.target.value))} /></Field>
            <Field label="Phone"><Input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Website"><Input value={f.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" /></Field>
            <Field label="Industry"><Input value={f.industry} onChange={(e) => set('industry', e.target.value)} /></Field>
            <Field label="Timezone"><Input value={f.timezone} onChange={(e) => set('timezone', e.target.value)} /></Field>
            <Field label="Application URL" hint="Leave blank for a tenant-path default"><Input value={f.applicationUrl} onChange={(e) => set('applicationUrl', e.target.value)} placeholder="/t/<slug>" /></Field>
          </Grid>
        </Section>

        <Section title="Address">
          <Grid cols={2}>
            <Field label="Street"><Input value={f.street} onChange={(e) => set('street', e.target.value)} /></Field>
            <Field label="City"><Input value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
            <Field label="State / Region"><Input value={f.state} onChange={(e) => set('state', e.target.value)} /></Field>
            <Field label="ZIP / Postal"><Input value={f.zip} onChange={(e) => set('zip', e.target.value)} /></Field>
            <Field label="Country"><Input value={f.country} onChange={(e) => set('country', e.target.value)} /></Field>
          </Grid>
        </Section>

        <Section title="Primary company owner">
          <Grid cols={2}>
            <Field label="First name"><Input value={f.ownerFirstName} onChange={(e) => set('ownerFirstName', e.target.value)} /></Field>
            <Field label="Last name"><Input value={f.ownerLastName} onChange={(e) => set('ownerLastName', e.target.value)} /></Field>
            <Field label="Email *" error={errors['owner.email']}><Input required type="email" value={f.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} /></Field>
            <Field label="Phone"><Input value={f.ownerPhone} onChange={(e) => set('ownerPhone', e.target.value)} /></Field>
            <Field label="Username" hint="Defaults to the local part of email"><Input value={f.ownerUsername} onChange={(e) => set('ownerUsername', e.target.value.toLowerCase())} /></Field>
            <Field label="Temporary password *" hint="Argon2id hashed; owner should rotate on first login" error={errors['owner.password']}><Input required type="password" minLength={8} value={f.ownerPassword} onChange={(e) => set('ownerPassword', e.target.value)} /></Field>
          </Grid>
        </Section>

        <Section title="Subscription">
          <Grid cols={2}>
            <Field label="Plan" hint={plans.length ? `${plans.length} plan(s) defined in Owner â†’ Plans` : 'Create plans in Owner â†’ Plans'}>
              <Select value={f.plan} onChange={(e) => setPlan(e.target.value)}>
                {plans.length === 0 && <option value="">â€” no plans configured â€”</option>}
                {plans.map((p) => (
                  <option key={p.key} value={p.key}>{p.name} Â· ${p.monthlyPrice}/mo</option>
                ))}
              </Select>
            </Field>
            <Field label="Billing cycle"><Select value={f.billingCycle} onChange={(e) => set('billingCycle', e.target.value)}><option value="monthly">Monthly</option><option value="annual">Annual</option></Select></Field>
            <Field label="Monthly price"><Input type="number" step="0.01" min="0" value={f.monthlyPrice} onChange={(e) => set('monthlyPrice', e.target.value)} placeholder="0.00" /></Field>
            <Field label="Annual price"><Input type="number" step="0.01" min="0" value={f.annualPrice} onChange={(e) => set('annualPrice', e.target.value)} placeholder="0.00" /></Field>
            <Field label="End date" hint="Defaults to one year from today"><Input type="date" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
          </Grid>
        </Section>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Btn type="submit" disabled={saving}>{saving ? 'Creatingâ€¦' : 'Create company'}</Btn>
          <Btn variant="secondary" type="button" onClick={() => navigate(-1)}>Cancel</Btn>
        </div>
      </form>
    </div>
  )
}

const Section = ({ title, children }) => (
  <Card style={{ marginBottom: 14 }}>
    <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>{title}</h3>
    {children}
  </Card>
)
const Grid = ({ cols, children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>{children}</div>
)
