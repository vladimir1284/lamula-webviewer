-- Decisión 50: la bandeja de feedback es compartida entre productos (webviewer y
-- lamula-process). `app` dice de cuál viene cada mensaje.
--
-- Idempotente a propósito: server/plugins/migrate-feedback.ts corre este SQL en CADA
-- arranque del contenedor. Si la columna ya existe, ADD COLUMN IF NOT EXISTS salta la
-- cláusula entera y el CHECK no se duplica.
--
-- DEFAULT 'webviewer' deja correctas las filas anteriores a esta migración sin backfill.

ALTER TABLE viewer.feedback
  ADD COLUMN IF NOT EXISTS app TEXT NOT NULL DEFAULT 'webviewer'
  CHECK (app IN ('webviewer','process'));

CREATE INDEX IF NOT EXISTS idx_feedback_app ON viewer.feedback (app, status, created_at DESC);
