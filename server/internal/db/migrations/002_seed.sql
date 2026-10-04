-- Default settings for a new shop.
INSERT INTO shop_settings (shop_name, address1, city, state, zip, phone, email, website, description)
VALUES ('Northside Auto Care', '1200 Industrial Pkwy', 'Baltimore', 'MD', '21230', '(410) 555-0142',
        'service@northsideauto.example', 'northsideauto.example', 'Full-service repair and diagnostics since 1998.');

INSERT INTO shop_licenses (type, name, number, issuing_org, issue_date, expiration_date)
VALUES ('license', 'State Repair Shop License', 'ABC123456', 'Maryland MVA', '2024-01-01', '2027-12-31');

INSERT INTO shop_service_writers (first_name, last_name, display_name, employee_id) VALUES
  ('Tee', 'Jackson', 'TEE', 'E-1001'),
  ('Maria', 'Lopez', 'MARIA', 'E-1002');

INSERT INTO shop_technicians (first_name, last_name, display_name, employee_id, technician_id, certification, specialty) VALUES
  ('Doug', 'Lazarus', 'DOUGLAZ', 'E-2001', 'T-01', 'ASE Master', 'Electrical'),
  ('Ray', 'Kim', 'RAY', 'E-2002', 'T-02', 'ASE A1–A8', 'Drivability');

INSERT INTO labor_rates (rate, currency, effective_date, active) VALUES (150.00, 'USD', current_date, true);

INSERT INTO tax_rates (name, rate, description, is_default, applies_parts, applies_labor, applies_fees, sort)
VALUES ('Sales Tax', 6.0000, 'State sales tax on parts', true, true, false, false, 1);

INSERT INTO markup_settings (name, applies_to, calc_type, percentage, description)
VALUES ('Standard parts markup', 'parts', 'percent', 40.000, 'Applied to part cost to calculate the selling price.');

INSERT INTO shop_fees (name, calc_by, amount, percentage, minimum, maximum, applies_to, description, sort) VALUES
  ('HazMat', 'amount', 2.00, 0, 0.01, 10.00, 'labor_parts', 'Hazardous materials disposal', 1),
  ('Shop Supplies', 'percent', 3.00, 5.000, 2.00, 35.00, 'labor_parts', 'Rags, cleaners, small hardware', 2);

INSERT INTO document_number_settings (doc_type, prefix, next_number) VALUES
  ('estimate', '', 301331),
  ('repair_order', 'RO-', 5001),
  ('invoice', 'INV-', 9001),
  ('statement', 'ST-', 101);

INSERT INTO document_preferences DEFAULT VALUES;
INSERT INTO printing_settings DEFAULT VALUES;
INSERT INTO document_options DEFAULT VALUES;
INSERT INTO estimate_settings DEFAULT VALUES;
INSERT INTO document_header_footer (footer_custom_text, payment_instructions, warranty_text)
VALUES ('Thank you for your business!',
        'Payment is due when the vehicle is picked up. We accept cash, check and major cards.',
        'Parts and labor are warranted for 12 months / 12,000 miles unless noted. Customer-supplied parts are not warranted.');
