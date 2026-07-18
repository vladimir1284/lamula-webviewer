#!/usr/bin/env bash
# Graba las fixtures del DAL desde la D1 REAL del demo (nexrad-l3).
#
# Requiere credenciales Cloudflare (wrangler login, o CLOUDFLARE_API_TOKEN
# + CLOUDFLARE_ACCOUNT_ID en el entorno / .env).
# Solo ejecuta SELECT (decisión 17 — este repo jamás escribe en D1).
#
# Ventana: últimos 15 min relativos al último volumen — series útiles para
# closest/next/prev (≥3 volúmenes por producto) sin inflar el repo.
# OJO: los timestamps del contrato usan 'T'; datetime() de SQLite devuelve
# espacio y rompería la comparación lexicográfica — de ahí el strftime.
# Tras grabar: `pnpm test` — los contract tests validan lo grabado.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then set -a; . ./.env; set +a; fi

DB=nexrad-l3
OUT=server/dal/fixtures
SINCE="strftime('%Y-%m-%dT%H:%M:%S', (SELECT MAX(vol_time) FROM rasters), '-15 minutes')"
# phenomena necesita más historia: la serie por cell_id (charts) requiere
# celdas presentes en ≥2 volúmenes NST
SINCE_PHEN="strftime('%Y-%m-%dT%H:%M:%S', (SELECT MAX(vol_time) FROM rasters), '-30 minutes')"

query() {
  pnpm exec wrangler d1 execute "$DB" --remote --json --command "$1" \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s)[0].results,null,2)))"
}

echo "→ radars"
query "SELECT site_id, icao, lat, lon, height_m, proj4, first_seen_at, last_seen_at
       FROM radars ORDER BY site_id" > "$OUT/radars.json"

echo "→ products"
query "SELECT code, mnemonic, unit, kind FROM products ORDER BY code" > "$OUT/products.json"

echo "→ rasters (ventana 15 min desde el último volumen)"
query "SELECT site_id, product_code, vol_time, r2_key, size_bytes, el_angle, vcp,
              value_scale, value_offset, max_level, width, height, cell_m, created_at
       FROM rasters
       WHERE vol_time >= ($SINCE)
       ORDER BY site_id, product_code, vol_time" > "$OUT/rasters.json"

echo "→ phenomena (ventana 30 min)"
query "SELECT site_id, product_code, vol_time, kind, cell_id, lat, lon,
              azimuth_deg, range_km, attrs, created_at
       FROM phenomena
       WHERE vol_time >= ($SINCE_PHEN)
       ORDER BY site_id, vol_time, kind, cell_id" > "$OUT/phenomena.json"

echo "→ vwp (misma ventana)"
query "SELECT site_id, vol_time, height_ft, wind_dir_deg, wind_speed_kt, rms_kt, created_at
       FROM vwp
       WHERE vol_time >= ($SINCE)
       ORDER BY site_id, vol_time, height_ft" > "$OUT/vwp.json"

# viento GFS: retención completa (72 h) — filas de metadata livianas, y el
# span multi-día garantiza que el padding ±2 h del índice quede ejercitado.
# OJO: los JSON u/v de los valid_times cercanos a los rasters grabados hay
# que bajarlos a tests/fixtures/cogs/r2/<r2_key> (mismo flujo que los COGs
# golden) para que e2e/wind.spec.ts corra offline.
echo "→ wind_grids (retención completa)"
query "SELECT site_id, valid_time, cycle_time, forecast_hour, model, r2_key, size_bytes, created_at
       FROM wind_grids
       ORDER BY site_id, valid_time" > "$OUT/wind.json"

wc -c "$OUT"/*.json
echo "✓ fixtures grabadas en $OUT/ — ahora: pnpm test (contract tests) y revisar el diff"
