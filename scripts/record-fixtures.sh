#!/usr/bin/env bash
# Graba las fixtures del DAL desde la D1 REAL del demo (nexrad-l3).
#
# Requiere: `wrangler login` con acceso a la cuenta, y jq.
# Solo ejecuta SELECT (decisión 17 — este repo jamás escribe en D1).
#
# Ventana: los últimos 45 min de datos relativos al último volumen, para
# que las fixtures queden pequeñas pero con series útiles (closest/next/prev
# necesitan ≥3 volúmenes por producto). Tras grabar: `pnpm test` — los
# contract tests validan lo grabado contra los schemas Zod y el SQL real.
set -euo pipefail
cd "$(dirname "$0")/.."

DB=nexrad-l3
OUT=server/dal/fixtures

query() {
  pnpm exec wrangler d1 execute "$DB" --remote --json --command "$1" | jq '.[0].results'
}

echo "→ radars"
query "SELECT site_id, icao, lat, lon, height_m, proj4, first_seen_at, last_seen_at
       FROM radars ORDER BY site_id" > "$OUT/radars.json"

echo "→ products"
query "SELECT code, mnemonic, unit, kind FROM products ORDER BY code" > "$OUT/products.json"

echo "→ rasters (ventana 45 min desde el último volumen)"
query "SELECT site_id, product_code, vol_time, r2_key, size_bytes, el_angle, vcp,
              value_scale, value_offset, max_level, width, height, cell_m, created_at
       FROM rasters
       WHERE vol_time >= datetime((SELECT MAX(vol_time) FROM rasters), '-45 minutes')
       ORDER BY site_id, product_code, vol_time" > "$OUT/rasters.json"

echo "→ phenomena (misma ventana)"
query "SELECT site_id, product_code, vol_time, kind, cell_id, lat, lon,
              azimuth_deg, range_km, attrs, created_at
       FROM phenomena
       WHERE vol_time >= datetime((SELECT MAX(vol_time) FROM rasters), '-45 minutes')
       ORDER BY site_id, vol_time, kind, cell_id" > "$OUT/phenomena.json"

echo "→ vwp (misma ventana)"
query "SELECT site_id, vol_time, height_ft, wind_dir_deg, wind_speed_kt, rms_kt, created_at
       FROM vwp
       WHERE vol_time >= datetime((SELECT MAX(vol_time) FROM rasters), '-45 minutes')
       ORDER BY site_id, vol_time, height_ft" > "$OUT/vwp.json"

echo "✓ fixtures grabadas en $OUT/ — ahora: pnpm test (contract tests) y revisar el diff"
