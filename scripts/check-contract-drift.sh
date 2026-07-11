#!/usr/bin/env bash
# Drift del contrato: el snapshot versionado (tests/contract/schema/) debe
# ser byte a byte el SQL de db/migrations/ del pipeline. Si el pipeline
# migra el schema, esto rompe CI — no producción (docs/contrato.md).
#
# Fuente: el repo del pipeline en GitHub (canónica); fallback al checkout
# hermano ../nexrad-l3-pipeline para trabajo offline.
set -euo pipefail
cd "$(dirname "$0")/.."

SNAPSHOT_DIR=tests/contract/schema
PIPELINE_RAW=https://raw.githubusercontent.com/vladimir1284/nexrad-l3-pipeline/main/db/migrations
PIPELINE_LOCAL=../nexrad-l3-pipeline/db/migrations

status=0
for snapshot in "$SNAPSHOT_DIR"/*.sql; do
  name=$(basename "$snapshot")
  if current=$(curl -fsSL --max-time 15 "$PIPELINE_RAW/$name" 2>/dev/null); then
    source="GitHub"
  elif [ -f "$PIPELINE_LOCAL/$name" ]; then
    current=$(cat "$PIPELINE_LOCAL/$name")
    source="checkout local"
  else
    echo "✗ $name: sin acceso al pipeline (ni GitHub ni $PIPELINE_LOCAL)" >&2
    exit 2
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
