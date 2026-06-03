CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  license_key TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'beta_pro',
  status TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  stripe_checkout_session_id TEXT UNIQUE,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_email_sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS processed_stripe_events (
  id TEXT PRIMARY KEY,
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS licenses_email_lower_idx ON licenses (LOWER(email));
CREATE INDEX IF NOT EXISTS licenses_stripe_customer_id_idx ON licenses (stripe_customer_id);
CREATE INDEX IF NOT EXISTS licenses_stripe_subscription_id_idx ON licenses (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS processed_stripe_events_stripe_event_id_idx ON processed_stripe_events (stripe_event_id);
