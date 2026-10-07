// Aplica el schema viewer.* (feedback) al arrancar el server — no hay
// migration-runner en el repo, así que esto es todo lo que lo ejecuta.
import { getPgClient } from '../dal/pg'

// Debe mantenerse sincronizado con db/viewer_migrations/0001_feedback.sql
const MIGRATION_SQL = `
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
`

async function runMigration() {
  const config = useRuntimeConfig()

  if (config.dalAdapter === 'fixture') {
    console.debug('[migrate-feedback] dalAdapter=fixture, se omite (sin Postgres real)')
    return
  }

  const host = config.pgHost
  const database = config.pgDatabase

  if (!host || !database) {
    console.debug('[migrate-feedback] pgHost/pgDatabase no configurados, se omite')
    return
  }

  const port = Number(config.pgPort) || 5432
  const username = config.pgWriteUser || config.pgUser
  const password = config.pgWritePassword || config.pgPassword

  if (!username) {
    console.debug('[migrate-feedback] sin credenciales de escritura (pgWriteUser/pgUser), se omite')
    return
  }

  const client = getPgClient({ host, port, database, username, password })

  await client.query(MIGRATION_SQL)
  console.log('[migrate-feedback] esquema viewer.* aplicado')
}

export default defineNitroPlugin(() => {
  runMigration().catch((err) => {
    console.error('[migrate-feedback] fallo al aplicar esquema viewer.*:', err)
  })
})
