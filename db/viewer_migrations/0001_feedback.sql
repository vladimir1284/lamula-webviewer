CREATE SCHEMA IF NOT EXISTS viewer;

CREATE TABLE IF NOT EXISTS viewer.feedback_users (
  token_hash   TEXT PRIMARY KEY,
  role         TEXT NOT NULL CHECK (role IN
                 ('profesor','meteorologo','investigador','estudiante','aficionado','otro')),
  role_other   TEXT,
  display_name TEXT,
  email        TEXT,
  organization TEXT,
  country      TEXT,
  locale       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS viewer.feedback (
  id         BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL REFERENCES viewer.feedback_users(token_hash) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('mejora','bug','dato','otro')),
  rating     SMALLINT CHECK (rating BETWEEN 1 AND 5),
  message    TEXT NOT NULL,
  context    JSONB NOT NULL DEFAULT '{}'::jsonb,
  status     TEXT NOT NULL DEFAULT 'nuevo' CHECK (status IN
                 ('nuevo','leido','respondido','cerrado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON viewer.feedback (token_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_triage ON viewer.feedback (status, created_at DESC);

CREATE TABLE IF NOT EXISTS viewer.feedback_replies (
  id          BIGSERIAL PRIMARY KEY,
  feedback_id BIGINT NOT NULL REFERENCES viewer.feedback(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  author      TEXT NOT NULL DEFAULT 'LAMULA',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reply_feedback ON viewer.feedback_replies (feedback_id, created_at);
