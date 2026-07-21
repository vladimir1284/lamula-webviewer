# Spec para el pipeline: viento GFS 10 m

**Estado: implementado en el pipeline (`db/migrations/0003_wind_grids.sql`, jul-2026) e ingesta activa.** El snapshot vive en `tests/contract/schema/0003_wind_grids.sql` (vigilado por el drift check). Verificado contra producción (2026-07-18): filas horarias en D1 para todos los sitios, JSON en R2 conforme a esta spec (nx·ny exacto, 2 decimales, `lo1` en [-180,180)), CORS con `localhost:3000` y gzip + `immutable` desde el edge. Las fixtures del viewer siguen siendo **sintéticas** hasta la próxima re-grabación completa (la grabación vigente del 2026-07-11 contiene el caso meso irreproducible — ver README de fixtures).

## Fase 2: niveles de altura (`0005_wind_levels.sql`, jul-2026)

**Estado: migración mergeada y snapshoteada (`tests/contract/schema/0005_wind_levels.sql`); viewer implementado (contrato, DAL, API, `overlayMachine`, selector de UI). Ingesta de 850/700/500 hPa aún NO habilitada del lado del pipeline** — solo `10m` produce filas hoy; el selector de altura muestra las otras tres opciones pero devuelven `[]` hasta que el pipeline active el rollout (no es bug del viewer).

La PK pasó de `(site_id, valid_time)` a `(site_id, valid_time, level)` — SQLite/D1 no soportan `ALTER` de PK, la migración reconstruye la tabla (`wind_grids_new` → drop → rename) y backfillea las filas existentes con `level='10m'`. Columna nueva:

```sql
level TEXT NOT NULL DEFAULT '10m', -- '10m' | '850hPa' | '700hPa' | '500hPa'
```

El viewer consulta un nivel a la vez (el selector nunca muestra más de uno simultáneo, así que no hace falta traer los 4 juntos):

```sql
WHERE site_id = ? AND level = ? AND valid_time >= ? AND valid_time < ?
```

`GET /api/wind/times` gana el query param `level` (ausente → `10m`, para no romper URLs viejas). El formato del fichero JSON u/v (`header`/`u`/`v`) es idéntico para los 4 niveles — sin cambios ahí.

**Cuando el pipeline habilite 850/700/500 hPa:** avisar para retirar la nota de "0 filas esperadas" de `WIND_LEVELS`/`WIND_LEVEL_LABELS` (`shared/contract/types.ts`) y considerar traer un JSON real de cada nivel a `tests/fixtures/cogs/r2/` para reemplazar `server/dal/fixtures/wind.json` (sigue sintético, un solo nivel `10m`, misma razón que siempre: re-grabar hoy destruiría el caso BYX 03:08:18).

## Contexto

El viewer añade una capa opcional de viento animado (partículas) sobre el mapa de cada radar. Necesita viento u/v 10 m en grilla, por sitio, alineado temporalmente con los rasters (ventana de 72 h). El pipeline es el dueño del contrato: migración D1, job de ingesta y retención van allá; el viewer solo hace `SELECT` sobre la tabla nueva y `GET` de los JSON en R2.

Fuente: **GFS 0.25°** vía NOMADS. No HRRR: es CONUS-only y no cubre JUA (Puerto Rico); GFS cubre cualquier radar futuro con una sola ruta de código (radar-agnóstico).

## Migración D1

```sql
CREATE TABLE wind_grids (
  site_id       TEXT    NOT NULL REFERENCES radars(site_id),
  valid_time    TEXT    NOT NULL,  -- ISO naive UTC 'YYYY-MM-DDTHH:MM:SS', misma convención que vol_time
  cycle_time    TEXT    NOT NULL,  -- ciclo del modelo, ISO naive UTC
  forecast_hour INTEGER NOT NULL,  -- valid_time - cycle_time, en horas
  model         TEXT    NOT NULL DEFAULT 'gfs0p25',
  r2_key        TEXT    NOT NULL,
  size_bytes    INTEGER NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now')),
  PRIMARY KEY (site_id, valid_time)
);
```

La PK cubre el único lookup del viewer: `WHERE site_id = ? AND valid_time >= ? AND valid_time < ?` (día UTC con padding ±2 h). No hace falta índice extra.

## Keys R2 (inmutables — el ciclo va en el nombre)

```
{SITE}/WIND/{YYYY}/{MM}/{DD}/{SITE}_WIND_{YYYYMMDD}_{HHMMSS}_c{YYYYMMDDHH}f{FFF}.json
ej: AMX/WIND/2026/07/18/AMX_WIND_20260718_120000_c2026071806f006.json
```

Fecha del path = `valid_time`. Si un ciclo más nuevo reemplaza un valid_time, se sube el objeto nuevo (key distinta, cambia `c...f...`) y **se borra el objeto anterior** tras el upsert en D1.

## Formato del fichero (JSON)

```json
{
  "header": {
    "nx": 49, "ny": 49,
    "lo1": -86.25, "la1": 31.5,
    "dx": 0.25, "dy": 0.25,
    "refTime": "2026-07-18T06:00:00Z",
    "forecastHour": 6
  },
  "u": [ ],
  "v": [ ]
}
```

- `u`/`v` en **m/s**, redondeados a **2 decimales**, longitud exacta `nx*ny`.
- Orden **row-major desde la esquina NO**: `la1` = latitud norte, `lo1` = longitud oeste; se escanea oeste→este y luego norte→sur (convención GRIB estándar de GFS, la subgrilla ya viene así — no reordenar).
- `lo1` en rango **[-180, 180)** (convertir del 0–360 de GFS: `lon > 180 ? lon - 360 : lon`).
- Dominio por sitio: `radars.lat/lon ± 6°`, expandido hacia fuera hasta múltiplos de 0.25° para que los nodos coincidan exactamente con la grilla GFS (subset puro, sin resampleo) → 49×49 = 2 401 puntos, ~30–35 KB.
- Subir con `content-type: application/json`. Verificar si el dominio custom del bucket comprime JSON en el edge; si no, subir con `content-encoding: gzip` (comprimido en origen).

## Job de ingesta (cron horario)

Descarga vía el filtro de NOMADS (subsets de decenas de KB, no el GRIB global):

```
https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl
  ?dir=%2Fgfs.{YYYYMMDD}%2F{HH}%2Fatmos
  &file=gfs.t{HH}z.pgrb2.0p25.f{FFF}
  &var_UGRD=on&var_VGRD=on
  &lev_10_m_above_ground=on
  &subregion=&toplat={..}&bottomlat={..}&leftlon={..}&rightlon={..}
```

`leftlon/rightlon` en 0–360 (Florida ≈ 273–280). Decodificar GRIB2 con lo que ya use el stack (eccodes/cfgrib, pygrib o `wgrib2 -json`).

Algoritmo por corrida:

1. Leer sitios de `radars`; derivar bbox por sitio (nada hardcodeado — radar-agnóstico).
2. Detectar el ciclo más reciente disponible (probar 00/06/12/18Z descendiendo desde ahora; la publicación real llega ~3.5–5 h tras el ciclo).
3. Para cada `valid_time` horario en `[now − 72h, now + 2h]`: candidato = ciclo más nuevo disponible con `fh = valid_time − cycle_time` en **0..12**. Si `wind_grids` ya tiene fila para `(site, valid_time)` con `cycle_time >=` candidato → saltar. La regla f000–f012 con ciclos cada 6 h da valid_times horarios continuos y ~2 h de colchón si un ciclo se retrasa.
4. Descargar subset por sitio, convertir a JSON, subir a R2, `INSERT ... ON CONFLICT (site_id, valid_time) DO UPDATE` **solo si el `cycle_time` nuevo es mayor**, borrar el objeto R2 reemplazado.
5. Idempotente y parcial-tolerante: un valid_time que falle no aborta el resto; reintento natural en la corrida siguiente.
6. **Cortesía con NOMADS**: secuencial con pausa corta entre requests (bloquean IPs que superan ~120 hits/min). Un mismo fichero `f{FFF}` sirve para todos los sitios — descargar una vez por (ciclo, fh) con el bbox unión y subsetear localmente por sitio reduce requests.

## Retención y CORS

- Mismo barrido de 72 h que los rasters: borrar filas con `valid_time < now − 72h` y sus objetos R2.
- CORS del bucket: los JSON se leen con `fetch` directo desde el navegador — misma allowlist que los COGs (GET/HEAD; pages.dev, previews y `localhost:3000`). Si va en el bucket `nexrad-raster` existente, ya está; si es bucket nuevo, replicar la regla.

## Criterios de aceptación

- `SELECT * FROM wind_grids WHERE site_id='AMX' AND valid_time >= ? AND valid_time < ?` devuelve valid_times horarios continuos para las últimas 72 h (huecos solo si NOMADS falló > 12 h).
- Cada `r2_key` resuelve con GET público, JSON válido según el formato de arriba, `u.length === v.length === nx*ny`.
- Re-ejecutar el cron sin datos nuevos no reescribe nada (idempotencia).
- Un ciclo nuevo disponible reemplaza los valid_times solapados con fh menor y borra los objetos viejos.
