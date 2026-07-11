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

Una fila por `(site, vol_time, kind, cell_id)` con `lat`/`lon`, `azimuth_deg`/`range_km` y `attrs` JSON. Consultas del viewer: por `(site_id, vol_time)` para el overlay del frame mostrado, y por `(site_id, cell_id)` cross-volumen para las series de tendencia de los charts (el `cell_id` del RPG es estable entre volúmenes).

#### Claves de `attrs` (parte del contrato)

Estado **observado en el feed real** (grabación de fixtures, jul-2026) + resto de la extensión acordada (marcada ⏳, tarea del lado pipeline, prerequisito de la fase F4 del viewer):

| `kind` | Clave | Estado | Contenido |
|---|---|---|---|
| `storm_cell` | `azran_nm` | ✅ | `[az_deg, range_nm]` posición radar-céntrica |
| `storm_cell` | `movement_deg`, `movement_kt` | ✅ | vector de movimiento |
| `storm_cell` | `new` | ✅ | celda nueva en este volumen |
| `storm_cell` | `past`, `forecast` | ✅ | arrays de posiciones `[[x_km, y_km], …]` de los packets 23/24 (SCIT) |
| `storm_cell` | `dbz_max`, `dbz_max_height_kft` | ✅ | reflectividad máxima y su altura, del tabular de NST |
| `storm_cell` | `vil_kg_m2`, `top_kft` | ⏳ | del tabular "STORM CELL ATTRIBUTES" de NST |
| `storm_cell` | `poh_pct`, `posh_pct`, `hail_size_in` | ⏳ | probabilidad/tamaño de granizo, mismo tabular |
| `meso` | `radius_km`, `azran_nm`, `storm_id` | ✅ | geometría y celda asociada del mesociclón |
| `meso` | `strength_rank`, `msi`, `tvs` | ✅ | rango de intensidad, MSI, flag TVS (bool) del tabular NMD |
| `meso` | `low_level_rv_kt`, `low_level_dv_kt`, `base_kft`, `depth_kft`, `depth_stmrel_pct`, `max_rv_kft`, `max_rv_kt`, `movement_deg`, `movement_kt` | ✅ | resto del tabular NMD |

Cuando aterricen las claves ⏳ (VIL/top/granizo), esta tabla se actualiza y los contract tests del viewer las asertan. Las claves ✅ están presentes en las fixtures grabadas (`server/dal/fixtures/phenomena.json`) que los contract tests validan.

### `vwp` — perfiles de viento

Una fila por `(site_id, vol_time, height_ft)`: `wind_dir_deg`, `wind_speed_kt`, `rms_kt`. El viewer deriva u/v en cliente; **no hay componente vertical `w`** en el contrato.

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

1. ⏳ Resto de la extensión de `attrs` de NST (arriba): VIL, echo top y granizo por celda. Tracks (packets 23/24), dbz_max y el tabular NMD completo ya fluyen en el feed (verificado jul-2026).
2. `radars.icao` llega null en todo el feed del demo — si el pipeline puede mapear ICAO desde su config, el display mejora sin tocar el viewer.
3. Documentar formalmente las claves de `attrs` en `db/README.md` del pipeline (hoy `attrs` es caja negra en su doc).
4. Acceso público de lectura + CORS del bucket R2 y `NUXT_PUBLIC_R2_BASE_URL` en el proyecto Pages del viewer — sin esto `cog_url` va null; bloqueante de F2, no de F1.
5. Verificación opcional: barrido del bucket por 62/NSS (storm structure) — solo si las series de tendencia por `cell_id` resultaran insuficientes; no bloquea nada.
