# COGs golden

GeoTIFFs de referencia para el adaptador fixture y los goldens visuales de F2.

## `r2/` — espejo local del bucket para los goldens visuales

`r2/<r2_key>` replica el layout del bucket R2 para la fila **más reciente** de
cada (site, product) de `server/dal/fixtures/rasters.json` — exactamente lo
que `/api/rasters/closest?t=ahora` devuelve en modo fixture. Los goldens de
Playwright (`e2e/golden.spec.ts`) los sirven con `scripts/serve-cogs.mjs`
(CORS + Range) apuntando `NUXT_PUBLIC_R2_BASE_URL` ahí: corren 100 % offline.
Baselines en `e2e/golden.spec.ts-snapshots/` (commiteados).

**Excepción F4:** `BYX/{DVL,N0B}/…_030818.tif` — `2026-07-11T03:08:18` es el
único vol_time de las fixtures con raster + celdas + mesociclón + VWP
simultáneos (los 4 meso grabados son de BYX), así que es el caso e2e/golden de
fenómenos. Para BYX|N0B no es la fila más reciente (esa es 03:15:20, que sigue
404 offline por diseño).

Tras re-grabar fixtures (`scripts/record-fixtures.sh`): re-descargar del
dominio público (`curl https://nexrad-raster.ladetec.com/<r2_key> -o
tests/fixtures/cogs/r2/<r2_key>` para la fila más reciente de cada serie) y
regenerar baselines:

```bash
pnpm exec playwright test --project goldens --update-snapshots
```

## COGs sueltos — generados con el pipeline

GeoTIFFs generados con el **pipeline real** (`l3proc process`, sin red) a
partir de sus ficheros de test Level III crudos (`tests/data/` de
nexrad-l3-pipeline) — datos NEXRAD reales, calibración y proyección embebidas
por el mismo código que produce los COGs de R2. Ya **no casan** con filas de
`rasters.json` (las fixtures se re-grabaron después); se conservan como
referencia: peor caso de textura WebGL (3680×3680) y validación QGIS manual.

| Fichero | Producto | Cobertura |
|---|---|---|
| `AMX_N0B_20260706_154517.tif` | N0B 3680×3680, 250 m | peor caso de textura WebGL |
| `JUA_N0B_20260706_154347.tif` | N0B 3680×3680, 250 m | segunda proyección AEQD |
| `AMX_DVL_20260710_045717.tif` | DVL 920×920, 1 km | calibración `dvl` (scale 0.35, offset −0.7) |
| `AMX_EET_20260710_045717.tif` | EET 692×692, 1 km | calibración `eet`, malla más pequeña |

Regenerar (checkout hermano del pipeline + su entorno `uv`):

```bash
cd ../nexrad-l3-pipeline
uv run l3proc process tests/data/<fichero_crudo> \
  --output-dir ../lamula-webviewer/tests/fixtures/cogs
```

Estos ya no se sincronizan con `rasters.json`; la coherencia COG↔fixture la
cubren los goldens de `r2/` (mismas filas grabadas, mismos bytes del bucket).
