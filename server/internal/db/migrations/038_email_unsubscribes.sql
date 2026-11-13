-- Marketing-email opt-out list. One row per email that has unsubscribed.
-- Transactional emails (password reset, invoice receipts, signup welcome)
-- still send — CAN-SPAM only requires unsubscribe on commercial/marketing
-- messages. Broadcast and customer_broadcast kinds respect this list.

CREATE TABLE IF NOT EXISTS email_unsubscribes (
    email            text PRIMARY KEY,
    unsubscribed_at  timestamptz NOT NULL DEFAULT now(),
    source           text NOT NULL DEFAULT 'link',  -- 'link' | 'manual' | 'bounce'
    reason           text NOT NULL DEFAULT ''
);
