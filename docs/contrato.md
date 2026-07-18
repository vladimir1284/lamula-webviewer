# Contrato de datos (consumido)

El contrato lo **posee y congela nexrad-l3-pipeline**: schema D1 en [`db/migrations/`](https://github.com/vladimir1284/nexrad-l3-pipeline/tree/main/db) de ese repo + convención de claves R2. Este proyecto lo lee y no lo cambia; cualquier cambio necesario es una migración negociada del lado del pipeline. Los contract tests de este repo (F1) asertan las formas de las que el viewer depende y fallan CI ante drift.

Esta página es la **vista del consumidor**: qué lee el viewer de cada tabla y qué asume. La fuente de verdad es el SQL del pipeline.

## Convenciones globales

- Timestamps `TEXT` ISO-8601 UTC sin sufijo de zona (`YYYY-MM-DDTHH:MM:SS`), comparables lexicográficamente.
- Retención: **72 h** — el viewer nunca asume historia más allá de 3 días.
- Calibración raster: `físico = nivel · value_scale + value_offset` para niveles ≥ 2; nivel **0** = below threshold (nodata), **1** = range folded.

## D1

### `radars` — catálogo dinámico

| Columna | Uso en el viewer |
|---|---|
| `site_id` | id de 3 chars del feed (AMX, JUA); clave de todas las consultas |
| `icao` | display (KAMX, TJUA) cuando existe — **observado null en todo el feed del demo (jul-2026)**: el viewer cae a `site_id` |
| `lat`, `lon`, `height_m` | centrado de vista, círculo de cobertura, cálculos VWP |
| `proj4` | definición AEQD registrada **tal cual** con `proj4.defs` — el viewer no construye proyecciones |
| `last_seen_at` | frescura ("minutos desde el último scan"), semáforo de estado por radar |

Sin radares hardcodeados en ninguno de los dos proyectos: lo que hay en la tabla es lo que el viewer ofrece.

### `products` — descriptores mínimos

`code` (NEXRAD, p.ej. 153), `mnemonic` (N0B), `unit`, `kind` (`raster` | `phenomena` | `vwp`). Nombre display, categoría, rango y paleta **no** están aquí: viven en el catálogo estático del viewer keyed por `code` (decisión 5).

### `rasters` — metadata de cada COG

Consultas del viewer: lista de datetimes por `(site_id, product_code, día)`, más-cercano / siguiente / anterior a un instante (sobre `vol_time`, índice `idx_rasters_lookup`). Columnas usadas: `r2_key` (→ URL del COG), `vol_time`, `value_scale`/`value_offset`, `max_level` (recorte de leyenda), `width`/`height`/`cell_m` (extensión), `el_angle`, `vcp`.

### `phenomena` — celdas, meso, TVS, granizo

Una fila por `(site, vol_time, kind, cell_id)` con `lat`/`lon`, `azimuth_deg`/`range_km` y `attrs` JSON. Consultas del viewer: por `(site_id, vol_time)` para el overlay del frame mostrado, por `(site_id, cell_id)` cross-volumen para las series de tendencia de los charts (el `cell_id` del RPG es estable entre volúmenes), y `DISTINCT vol_time` por `(site_id, día UTC)` como índice del join temporal (los fenómenos tienen vol_times propios; el frame mostrado se casa en cliente con el volumen más cercano — decisión 24).

#### Claves de `attrs` (parte del contrato)

Estado **observado en el feed real** (grabación de fixtures, jul-2026). La tabla canónica vive en `db/README.md` del pipeline; los tipos + parsers tolerantes del viewer en `shared/contract/attrs.ts` (`stormCellAttrs()`/`mesoAttrs()` — toda clave es opcional, un campo corrupto se descarta sin tumbar la fila):

| `kind` | Clave | Contenido |
|---|---|---|
| `storm_cell` | `azran_nm` | `[az_deg, range_nm]` posición radar-céntrica |
| `storm_cell` | `movement_deg`, `movement_kt` | vector de movimiento (`movement_deg` convención "desde") |
| `storm_cell` | `new` | celda nueva en este volumen (sin tracks) |
| `storm_cell` | `past`, `forecast` | arrays de posiciones `[[x_km, y_km], …]` AEQD de los packets 23/24 (SCIT); `past` reciente→viejo, `forecast` cercano→lejano — semántica deducida de las grabaciones, **pendiente de confirmar con el experto** (puerta M4; test canario en `tests/unit/tracks.spec.ts`) |
| `storm_cell` | `dbz_max`, `dbz_max_height_kft` | reflectividad máxima y su altura, del GAB de NST — el GAB pagina de a 6 celdas: **puede faltar** |
| `meso` | `radius_km`, `azran_nm`, `storm_id` | geometría del mesociclón y `cell_id` de la celda NST asociada (el `cell_id` de la fila meso es el ID del mesociclón, no la celda) |
| `meso` | `strength_rank`, `msi`, `tvs` | rango de intensidad, MSI, flag TVS (bool) del tabular NMD — `tvs` es LA señal TVS del feed |
| `meso` | `low_level_rv_kt`, `low_level_dv_kt`, `base_kft`, `depth_kft`, `depth_stmrel_pct`, `max_rv_kft`, `max_rv_kt`, `movement_deg`, `movement_kt` | resto del tabular NMD |

**Fuera de alcance — el feed no lo distribuye** (acordado con el pipeline, jul-2026): `vil_kg_m2`, `top_kft` (producto SS/62) y `poh_pct`/`posh_pct`/`hail_size_in` (HI/59) — esos productos no fluyen en el bucket de Unidata; el NST no los trae. VIL y echo top sí existen como rasters de grilla (DVL, EET). Si algún día aterrizan, `attrs.ts` suma claves opcionales sin migración. Las claves de la tabla están presentes en las fixtures grabadas (`server/dal/fixtures/phenomena.json`) que los contract tests y `tests/unit/attrs.spec.ts` validan.

### `vwp` — perfiles de viento

Una fila por `(site_id, vol_time, height_ft)`: `wind_dir_deg`, `wind_speed_kt`, `rms_kt`. El viewer deriva u/v en cliente; **no hay componente vertical `w`** en el contrato. Consultas: por `(site_id, vol_time)` para el perfil, y `DISTINCT vol_time` por `(site_id, día UTC)` como índice del join temporal (decisión 24).

### `wind_grids` — viento GFS 10 m en grilla

Una fila por `(site_id, valid_time)`: `cycle_time`, `forecast_hour`, `model`, `r2_key` → JSON u/v en R2 (gzip + `immutable` desde el edge — el ciclo va en la key). Consulta del viewer: por `(site_id, día UTC ± 2 h)` como índice del join temporal (padding mayor que phen/vwp porque la tolerancia es 1 h). Migración del pipeline: `0003_wind_grids.sql` (snapshot en `tests/contract/schema/`, drift check activo). Spec completa (keys R2, formato del fichero, cron) en [Spec pipeline viento](pipeline-viento.md).

## R2

- Convención de claves: `{site}/{mnemo}/{YYYY}/{MM}/{DD}/{site}_{mnemo}_{YYYYMMDD_HHMMSS}.tif` — pero el viewer **no construye claves**: usa `rasters.r2_key` literal.
- COG: niveles crudos uint8, scale/offset también embebidos en el TIFF, CRS proj4 AEQD, overviews internos. Peor caso 3680×3680 (N0B) — bajo el cap de textura WebGL de 4096.
- Acceso: lectura pública (dominio custom o `r2.dev`) con **CORS** habilitado para el origen del viewer y soporte de **range requests** (nativo en R2). El viewer descarga solo tiles/overviews del viewport.

## Requisitos de setup fuera del código (una vez)

1. CORS en el bucket R2 para el origen de Pages (y `localhost` para desarrollo).
2. Acceso público de lectura al bucket (dominio custom recomendado sobre `r2.dev`).
3. Binding D1 del proyecto Pages del viewer a la base `nexrad-l3` (misma cuenta).
4. Binding a la base `nexrad-l3-test` para previews/CI si aplica.

## Puntos de coordinación abiertos con el pipeline

1. ~~Extensión de `attrs` de NST~~ — cerrado jul-2026: tracks (packets 23/24), dbz_max y el tabular NMD completo fluyen; VIL/top/granizo quedan fuera de alcance (el feed no distribuye SS/HI — barrido verificado por el pipeline).
2. `radars.icao` llega null en todo el feed del demo — si el pipeline puede mapear ICAO desde su config, el display mejora sin tocar el viewer.
3. ~~Documentar claves de `attrs` en el pipeline~~ — hecho: tabla canónica en `db/README.md` de aquel repo.
4. Acceso público de lectura + CORS del bucket R2 y `NUXT_PUBLIC_R2_BASE_URL` en el proyecto Pages del viewer — sin esto `cog_url` va null; bloqueante de F2, no de F1.
5. Confirmar con el experto la semántica de `past`/`forecast`/`movement_deg` (orden y convención "desde") — parte de la puerta M4.
6. ~~Viento GFS 10 m~~ — cerrado jul-2026: el pipeline mergeó `0003_wind_grids.sql` e ingesta activa; CORS (`localhost:3000`, pages.dev) y gzip del edge **verificados contra el dominio custom** el 2026-07-18. Queda del lado del viewer: re-grabar fixtures (incl. `wind.json` real + bajar los JSON u/v golden) en la próxima re-grabación completa.
