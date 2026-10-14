-- Security questions for shop sign-in. User picks 2 of 10 and provides
-- answers; both must be re-answered at login after the password check.
-- Answers are stored only as Argon2id hashes, same algorithm as passwords.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_owners' AND column_name='security_q1') THEN
    ALTER TABLE company_owners
      ADD COLUMN security_q1       int,
      ADD COLUMN security_a1_hash  text NOT NULL DEFAULT '',
      ADD COLUMN security_q2       int,
      ADD COLUMN security_a2_hash  text NOT NULL DEFAULT '';
  END IF;
END $$;
