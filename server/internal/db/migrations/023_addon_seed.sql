-- Seed a few sensible default add-ons so a fresh install has something for
-- shops to subscribe to out of the box. Owner can edit prices or unpublish
-- any of these from the Add-ons page.
--
-- Stripe Product + Price IDs are left blank — they get lazily provisioned
-- on the first subscribe call once the SaaS owner's Stripe account is
-- active, so this seed is safe to run before Stripe is configured.

INSERT INTO addon_catalog (feature_key, name, description, monthly_price, trial_days, published)
VALUES
  ('inspections',       'Vehicle Inspections (DVI)',       'Create digital vehicle inspections with photos, pass / fail items, and a professional print view for the customer.', 19.00, 7, true),
  ('online_payments',   'Online Payments',                 'Send Stripe payment links to customers. Payments post to the document automatically and send a receipt email.', 14.00, 7, true),
  ('share_link',        'Customer Share Links',            'Secure share tokens for estimates, repair orders, invoices, and inspection reports.', 9.00, 7, true),
  ('authorization',     'Online Authorization',            'Customers approve or decline estimates online with per-item approval and reminder emails.', 12.00, 7, true),
  ('chat',              'Customer Chat',                   'Two-way messaging between shop and customer on every repair order.', 9.00, 7, true),
  ('advanced_reports',  'Advanced Reports',                'Parts profit, payments, tax, and technician productivity reports beyond the free dashboards.', 24.00, 7, true),
  ('backup',            'Backup & Restore',                'Weekly automated backups, one-click restore, and manual snapshots.', 9.00, 7, true)
ON CONFLICT (feature_key) DO NOTHING;
