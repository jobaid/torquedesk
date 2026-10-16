-- Trial abuse prevention.
--
-- One trial per email AND per real payment method (card/bank). Email dup is
-- already caught by the unique index on company_owners.email; this adds the
-- card/bank fingerprint lookup table.
--
-- Fingerprints come from Stripe's PaymentMethod object:
--   card.fingerprint              — same card number across customers
--   us_bank_account.fingerprint   — same account number across customers
-- Stripe guarantees these are stable per real-world instrument.

CREATE TABLE IF NOT EXISTS trial_payment_fingerprints (
    fingerprint       text PRIMARY KEY,
    pm_type           text NOT NULL,              -- 'card' | 'us_bank_account'
    first_company_id  uuid REFERENCES companies(id) ON DELETE SET NULL,
    first_email       text NOT NULL DEFAULT '',
    first_seen_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tpf_company ON trial_payment_fingerprints(first_company_id);

-- Index for the "has this email ever been used as a business/shop email?"
-- lookup during signup. Not unique because manual admin-created shops can
-- share an owner email on paper; signup path enforces strict uniqueness.
CREATE INDEX IF NOT EXISTS idx_companies_email_lower
  ON companies ((lower(email))) WHERE email IS NOT NULL AND email <> '';
