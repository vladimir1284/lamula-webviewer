#!/usr/bin/env bash
# Drift del contrato: el snapshot versionado (tests/contract/schema/) debe
# ser byte a byte el SQL Postgres real de db/pg_migrations/0001_init.sql
# del pipeline. Si el pipeline cambia el schema, esto rompe CI — no
# producción (docs/contrato.md).
#
# Migrado de D1 (db/migrations/, multi-fichero) a Postgres
# (db/pg_migrations/, un solo fichero squasheado) junto con el resto del
# pipeline — ver plan de migración.
#
# Fuente: el repo del pipeline en GitHub (canónica); fallback al checkout
# hermano ../nexrad-l3-pipeline para trabajo offline.
set -euo pipefail
cd "$(dirname "$0")/.."

SNAPSHOT=tests/contract/schema/0001_init.sql
PIPELINE_RAW=https://raw.githubusercontent.com/vladimir1284/nexrad-l3-pipeline/main/db/pg_migrations/0001_init.sql
PIPELINE_LOCAL=../nexrad-l3-pipeline/db/pg_migrations/0001_init.sql

if current=$(curl -fsSL --max-time 15 "$PIPELINE_RAW" 2>/dev/null); then
  source="GitHub"
elif [ -f "$PIPELINE_LOCAL" ]; then
  current=$(cat "$PIPELINE_LOCAL")
  source="checkout local"
else
  echo "✗ sin acceso al pipeline (ni GitHub ni $PIPELINE_LOCAL)" >&2
  exit 2
fi

if out=$(diff -u "$SNAPSHOT" <(printf '%s\n' "$current")); then
  echo "✓ 0001_init.sql sin drift (fuente: $source)"
else
  echo "✗ DRIFT en 0001_init.sql (fuente: $source):" >&2
  printf '%s\n' "$out" >&2
  echo "  → actualizar el snapshot, revisar shared/contract/ y negociar si rompe al viewer" >&2
  exit 1
fi
