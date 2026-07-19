# Spec para el pipeline: descargas eléctricas (GLM)

**Estado: implementado en el pipeline (`db/migrations/0004_lightning_buckets.sql`, 2026-07-19) e ingesta activa.** El snapshot vive en `tests/contract/schema/0004_lightning_buckets.sql` (vigilado por el drift check). Verificado contra producción (2026-07-19): cubos de 300 s continuos en D1 para los 4 sitios con el invariante `strike_count = 0 ⇔ r2_key NULL` intacto, JSON en R2 conforme a esta spec (offsets ascendentes en `[0, 300)`, lon/lat a 3 decimales, `strikes.length === strike_count`) con **CORS (`localhost:3000`) + gzip + `immutable` verificados** en el dominio custom. Las fixtures del viewer siguen siendo **sintéticas** hasta la próxima re-grabación completa (la grabación vigente del 2026-07-11 contiene el caso meso irreproducible — ver README de fixtures); `record-fixtures.sh` ya graba `lightning_buckets`.

## Contexto

El viewer añade una capa opcional de rayos animados sobre el mapa de cada radar: las descargas ocurridas durante el intervalo de una observación (5–10 min) se reproducen en un bucle corto (~5 s) proporcional al tiempo real, con desvanecimiento tipo Windy. Sin tiempo real ni WebSockets: ficheros estáticos inmutables por cubo de tiempo, exactamente como los COGs y el viento.

El pipeline es el dueño del contrato: migración D1, Worker de ingesta y retención van allá; el viewer solo hace `SELECT` sobre la tabla nueva y `GET` de los JSON en R2.

## Fuente de datos

Recomendación: **GOES-19 GLM (Geostationary Lightning Mapper), producto `GLM-L2-LCFA`**, bucket público AWS Open Data `noaa-goes19` (sin credenciales, sin coste, sin rate limit práctico).

- Un fichero netCDF-4 cada **20 s** (~100–500 KB), latencia de publicación de decenas de segundos.
- Nivel **flash** (no event/group): `flash_lat`, `flash_lon`, `flash_time_offset_of_first_event`, `flash_quality_flag`.
- Cobertura: disco completo GOES-East — cubre Florida, Caribe y cualquier radar futuro del hemisferio (radar-agnóstico). Un sitio fuera del disco Este necesitaría `noaa-goes18` (GOES-West); resolver por longitud del sitio si algún día aplica.
- Caveats asumidos (a validar con el experto, como las paletas): GLM es rayo **total** (IC+CG sin distinguir), eficiencia de detección ~70–90 % (menor de día), precisión de posición ~8–14 km (huella del píxel). Para visualizar evolución espacial/temporal de la tormenta sobra; para localización exacta de impactos a tierra no sirve.

Descartes: **Blitzortung** (licencia no comercial, cobertura caribeña floja, feed websocket sin API oficial); **NLDN/Vaisala/Earth Networks** (comerciales — si la empresa YA tiene contrato con alguno, cambia solo el adaptador de fuente del Worker, el contrato de abajo queda igual; confirmar antes de arrancar).

## Migración D1 (propuesta: `0004_lightning_buckets.sql`)

Cubos de **300 s alineados a UTC** (`:00/:05/:10…`), una fila por (sitio, cubo). Cubos fijos y no vol_times del radar a propósito: los rayos llegan en continuo y desacoplados del VCP; el cliente junta los cubos que solapan la ventana de la observación.

```sql
CREATE TABLE lightning_buckets (
  site_id       TEXT    NOT NULL REFERENCES radars(site_id),
  bucket_start  TEXT    NOT NULL,  -- ISO naive UTC 'YYYY-MM-DDTHH:MM:SS', alineado a 300 s
  bucket_s      INTEGER NOT NULL DEFAULT 300,
  strike_count  INTEGER NOT NULL,
  r2_key        TEXT,              -- NULL cuando strike_count = 0 (no se sube objeto)
  size_bytes    INTEGER,
  source        TEXT    NOT NULL DEFAULT 'glm-goes19',
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now')),
  PRIMARY KEY (site_id, bucket_start)
);
```

- La PK cubre el único lookup del viewer: `WHERE site_id = ? AND bucket_start >= ? AND bucket_start < ?` (día UTC con padding ±900 s). Sin índice extra.
- **La fila se escribe SIEMPRE al cerrar el cubo, incluso con 0 rayos**: el viewer distingue "cubo cubierto sin descargas" (fila con `strike_count = 0`) de "hueco de ingesta" (sin fila). Con 0 rayos no hay objeto R2 (`r2_key NULL`).

## Keys R2 (inmutables — se escribe una vez, nunca se reescribe)

```
{SITE}/LIGHTNING/{YYYY}/{MM}/{DD}/{SITE}_LTG_{YYYYMMDD}_{HHMMSS}.json
ej: BYX/LIGHTNING/2026/07/18/BYX_LTG_20260718_120500.json
```

Fecha y hora del nombre = `bucket_start`. El cubo se procesa una única vez, cerrado + margen de latencia (≥ 90 s tras `bucket_end`); GLM publica en segundos, no hay backfill tardío que justifique reescrituras — el objeto es inmutable de verdad (mismo `Cache-Control: immutable` del edge que ya sirven COGs y viento).

## Formato del fichero (JSON)

```json
{
  "site": "BYX",
  "bucket_start": "2026-07-18T12:05:00",
  "bucket_s": 300,
  "strikes": [
    [-81.412, 24.607, 3.4],
    [-81.398, 24.615, 17.9]
  ]
}
```

- Cada strike es `[lon, lat, offset_s]` — **nada más** (el JSON tiene que ser mínimo; atributos futuros irían en una posición extra opcional, parser tolerante como `attrs`).
- `offset_s` = segundos desde `bucket_start`, **1 decimal**, orden ascendente.
- `lon`/`lat` en grados, **3 decimales** (~110 m — por debajo de la precisión GLM, no pierde nada), `lon` en [-180, 180) (GLM ya viene así).
- Recorte por sitio: distancia gran círculo al radar ≤ **460 km** (alcance máximo Level III; confirmar radio con el experto). Un flash puede aparecer en el fichero de varios sitios — correcto, los ficheros son independientes por sitio.
- Filtro de calidad: solo `flash_quality_flag == 0` (a confirmar con el experto).
- Subir con `content-type: application/json` plano — el dominio custom ya comprime JSON en el edge (verificado con el viento, mismo bucket).

## Worker de ingesta (Cloudflare Worker, cron cada minuto)

**Worker, no contenedor Python** — todo el flujo es fetch + parse + put, sin dependencias de sistema:

1. Determinar cubos objetivo: cubos cerrados hace ≥ 90 s dentro de una ventana de lookback corta (últimos ~30 min) que falten en `lightning_buckets` para cualquier sitio. El lookback corto da auto-recuperación de caídas breves; una pasada horaria con lookback de 72 h rellena huecos largos (los ficheros GLM siguen en S3).
2. Por cubo: listar los ficheros GLM del intervalo vía el listado REST público de S3 (`https://noaa-goes19.s3.amazonaws.com/?list-type=2&prefix=GLM-L2-LCFA/{YYYY}/{DDD}/{HH}/`), filtrando por el timestamp `s...` del nombre (`OR_GLM-L2-LCFA_G19_sYYYYDDDHHMMSSm...`) dentro de `[bucket_start, bucket_end)` → ~15 ficheros.
3. Parsear cada netCDF-4 **una sola vez** (son HDF5: `h5wasm` como módulo WASM del Worker) y extraer flashes: aplicar `scale_factor`/`add_offset` de `flash_time_offset_of_first_event` (offset relativo a `product_time`, época J2000 = segundos desde 2000-01-01T12:00:00Z), filtrar calidad.
4. Recortar por sitio (sitios y lat/lon leídos de `radars` — nada hardcodeado), calcular `offset_s`, ordenar, escribir el JSON por sitio a R2 y las filas a D1 en batch.
5. Idempotente: la PK + `INSERT OR IGNORE` hacen que reprocesar un cubo ya ingerido no toque nada; el put R2 con la misma key es inocuo.
6. Retención: mismo barrido de 72 h que rasters/viento — borrar filas con `bucket_start < now − 72h` y sus objetos R2 (rama del mismo cron, una vez por hora).

Presupuesto por corrida (1 cubo × todos los sitios): ~15 GETs a S3 + parse WASM de ~15 ficheros pequeños + N puts R2 + 1 batch D1 — muy por debajo de los límites de Workers de pago (subrequests, memoria 128 MB; `limits.cpu_ms` es configurable hasta 300 000 si el parse lo pidiera).

### Riesgo #1 (spike ANTES de construir nada)

**`h5wasm` sobre workerd**: validar en `wrangler dev` que parsea un fichero GLM real (netCDF-4/HDF5 con compresión interna) dentro de límites de CPU/memoria y que el bundle WASM cabe (~2–4 MB < 10 MB del plan de pago). Fallbacks en orden: (a) Python Worker (Pyodide — verificar si el runtime de Cloudflare expone `h5py`), (b) contenedor, último recurso.

## CORS

Los JSON se leen con `fetch` directo desde el navegador — si van al bucket `nexrad-raster` existente, la allowlist ya está (GET/HEAD; pages.dev, previews y `localhost:3000`). Bucket nuevo → replicar la regla.

## Criterios de aceptación

- `SELECT * FROM lightning_buckets WHERE site_id='BYX' AND bucket_start >= ? AND bucket_start < ?` devuelve cubos de 300 s **continuos** para las últimas 72 h (fila presente aun con 0 rayos; huecos solo si la ingesta estuvo caída > lookback y aún no pasó el backfill horario).
- Cada `r2_key` no nulo resuelve con GET público; JSON válido según el formato; `strikes.length === strike_count`; offsets en `[0, bucket_s)` ascendentes; todos los puntos a ≤ 460 km del sitio.
- Re-ejecutar el cron sin cubos nuevos no reescribe nada (idempotencia).
- Una tormenta activa visible en el raster de un sitio produce cubos con `strike_count > 0` en la misma zona horaria del volumen (validación del experto con datos vivos, tipo puerta M4).

## Preguntas abiertas (bloquean arranque del Worker, no el viewer)

1. ~~¿Existe contrato comercial de rayos?~~ **Resuelto (2026-07-19): se va con GLM.**
2. Radio de recorte por sitio (¿460 km o el alcance del producto por defecto?).
3. Umbral de `flash_quality_flag`.
4. Confirmar retención 72 h alineada con rasters.
