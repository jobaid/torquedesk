-- Give saas_admin_users a role column so the owner can tag teammates
-- as owner / manager / support without changing permissions enforcement
-- (that lives in the auth layer and can be tightened later).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'saas_admin_users' AND column_name = 'role'
  ) THEN
    ALTER TABLE saas_admin_users ADD COLUMN role text NOT NULL DEFAULT 'owner';
  END IF;
END $$;
