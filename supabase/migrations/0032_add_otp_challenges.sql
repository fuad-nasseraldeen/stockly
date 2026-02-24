-- Migration 0032: OTP login support
-- Adds OTP challenge storage (hashed code + TTL) and DB-backed request logs for abuse protection.

CREATE TABLE IF NOT EXISTS otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL,
  code_hash text NOT NULL,
  purpose text NOT NULL DEFAULT 'login',
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_challenges_phone_purpose_created_idx
  ON otp_challenges (phone_e164, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS otp_challenges_expires_at_idx
  ON otp_challenges (expires_at);

-- DB-backed rate limiter and audit data for OTP request endpoint.
CREATE TABLE IF NOT EXISTS otp_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL,
  purpose text NOT NULL DEFAULT 'login',
  ip_address text,
  sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_request_logs_ip_purpose_created_idx
  ON otp_request_logs (ip_address, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS otp_request_logs_phone_purpose_created_idx
  ON otp_request_logs (phone_e164, purpose, created_at DESC);
