# COGs golden

GeoTIFFs de referencia para el adaptador fixture y los tests visuales de F2
(COG conocido + paleta → render esperado). Generados con el **pipeline real**
(`l3proc process`, sin red) a partir de sus ficheros de test Level III crudos
(`tests/data/` de nexrad-l3-pipeline) — datos NEXRAD reales, calibración y
proyección embebidas por el mismo código que produce los COGs de R2.

| Fichero | Producto | Cobertura |
|---|---|---|
| `AMX_N0B_20260706_154517.tif` | N0B 3680×3680, 250 m | peor caso de textura WebGL; casa con la fila de `rasters.json` (mismo vol_time) |
| `JUA_N0B_20260706_154347.tif` | N0B 3680×3680, 250 m | segunda proyección AEQD; casa con su fila de `rasters.json` |
| `AMX_DVL_20260710_045717.tif` | DVL 920×920, 1 km | calibración `dvl` (scale 0.35, offset −0.7) |
| `AMX_EET_20260710_045717.tif` | EET 692×692, 1 km | calibración `eet`, malla más pequeña |

Regenerar (checkout hermano del pipeline + su entorno `uv`):

```bash
cd ../nexrad-l3-pipeline
uv run l3proc process tests/data/<fichero_crudo> \
  --output-dir ../lamula-webviewer/tests/fixtures/cogs
```

Tras regenerar, sincronizar la metadata (scale/offset/max_level/vcp/tamaño)
con las filas de `server/dal/fixtures/rasters.json` — los contract tests no
comparan COG↔fixture (eso llega con los goldens visuales de F2), así que la
coherencia aquí es manual de momento.
