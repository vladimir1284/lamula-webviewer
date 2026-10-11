#!/usr/bin/env bash
# Drift del contrato: cada snapshot versionado (tests/contract/schema/*.sql)
# debe ser byte a byte el fichero homónimo de db/pg_migrations/ del pipeline. Si el pipeline cambia el schema, esto rompe CI — no
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

SNAPSHOT_DIR=tests/contract/schema
RAW_BASE=https://raw.githubusercontent.com/vladimir1284/nexrad-l3-pipeline/main/db/pg_migrations
LOCAL_BASE=../nexrad-l3-pipeline/db/pg_migrations

shopt -s nullglob
snapshots=("$SNAPSHOT_DIR"/*.sql)
if [ ${#snapshots[@]} -eq 0 ]; then
  echo "✗ sin snapshots en $SNAPSHOT_DIR" >&2
  exit 2
fi

status=0
for snapshot in "${snapshots[@]}"; do
  name=$(basename "$snapshot")
  if current=$(curl -fsSL --max-time 15 "$RAW_BASE/$name" 2>/dev/null); then
    source="GitHub"
  elif [ -f "$LOCAL_BASE/$name" ]; then
    current=$(cat "$LOCAL_BASE/$name")
    source="checkout local"
  else
    echo "✗ $name: sin acceso al pipeline (ni GitHub ni $LOCAL_BASE/$name)" >&2
    status=2
    continue
  fi

  if out=$(diff -u "$snapshot" <(printf '%s\n' "$current")); then
    echo "✓ $name sin drift (fuente: $source)"
  else
    echo "✗ DRIFT en $name (fuente: $source):" >&2
    printf '%s\n' "$out" >&2
    echo "  → actualizar el snapshot, revisar shared/contract/ y negociar si rompe al viewer" >&2
    status=1
  fi
done
exit $status
