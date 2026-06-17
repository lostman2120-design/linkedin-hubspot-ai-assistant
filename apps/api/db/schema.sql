CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  license_key TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'beta_pro',
  status TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'stripe',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  stripe_checkout_session_id TEXT UNIQUE,
  current_period_end TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  label TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_email_sent_at TIMESTAMPTZ
);

ALTER TABLE licenses ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'stripe';
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE licenses
SET source = 'internal'
WHERE source = 'stripe'
  AND stripe_customer_id IS NULL
  AND stripe_subscription_id IS NULL
  AND stripe_checkout_session_id IS NULL;

CREATE TABLE IF NOT EXISTS processed_stripe_events (
  id TEXT PRIMARY KEY,
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS licenses_email_lower_idx ON licenses (LOWER(email));
CREATE INDEX IF NOT EXISTS licenses_source_idx ON licenses (source);
CREATE INDEX IF NOT EXISTS licenses_expires_at_idx ON licenses (expires_at);
CREATE INDEX IF NOT EXISTS licenses_revoked_at_idx ON licenses (revoked_at);
CREATE INDEX IF NOT EXISTS licenses_stripe_customer_id_idx ON licenses (stripe_customer_id);
CREATE INDEX IF NOT EXISTS licenses_stripe_subscription_id_idx ON licenses (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS processed_stripe_events_stripe_event_id_idx ON processed_stripe_events (stripe_event_id);
