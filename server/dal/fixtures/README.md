# Fixtures del adaptador fixture

**Grabaciones de la D1 real del demo** (`nexrad-l3`), una tabla por fichero,
filas tal cual salen de `SELECT` (sin `id`; con `created_at`, que el DAL no
sirve). Grabadas con `scripts/record-fixtures.sh`: ventana de 15 min desde el
último volumen (30 min para `phenomena`, para que haya celdas en ≥2 volúmenes
y la serie por `cell_id` sea útil).

Las consume `server/dal/fixture.ts` (bundled en el build — el modo fixture
funciona también desplegado) y las vigilan dos suites:

- `tests/contract/fixtures.spec.ts` — cada fila valida contra los schemas Zod
  del contrato **e inserta limpia en el schema SQL real** (FKs activas).
- `tests/unit/dal.spec.ts` + `e2e/` — expectativas **derivadas** de estas
  grabaciones (`tests/helpers/derive.ts`), no hardcodeadas: re-grabar no
  rompe tests mientras las grabaciones den para cada consulta (series ≥3
  volúmenes, algún cell_id multi-volumen…); si no dan, `derive.ts` lanza
  con mensaje claro.

Re-grabación:

```bash
# credenciales: wrangler login, o CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID (.env)
bash scripts/record-fixtures.sh    # sobrescribe server/dal/fixtures/*.json
pnpm test                          # valida lo grabado
```

Los COGs golden (GeoTIFFs para F2) van en `tests/fixtures/cogs/` — ver
README allí.

**Excepción: `wind.json` es SINTÉTICO** aunque el pipeline ya ingiere viento
GFS (migración `0003_wind_grids.sql`, jul-2026): la grabación vigente es del
2026-07-11 y la retención de 72 h ya purgó ese rango — un `wind.json` real de
hoy no casaría temporalmente con estos rasters, y re-grabar TODO destruiría
el caso BYX 03:08:18 (meso+raster+VWP, COGs irreproducibles). Lo genera
`node scripts/make-wind-fixture.mjs` a partir de las grabaciones (radar-
agnóstico: sitio con meso+raster = viento horario que joinea; siguiente
sitio = viento fuera de tolerancia; resto = vacío), junto con los ficheros
u/v en `tests/fixtures/cogs/r2/<site>/WIND/…`. **Regenerarlo tras cada
re-grabación** — hasta la próxima re-grabación COMPLETA: ahí
`record-fixtures.sh` ya graba `wind_grids` real, hay que bajar los JSON u/v
de los valid_times cercanos a los rasters grabados (mismo flujo curl que los
COGs golden) y el generador se retira.

**Excepción: `lightning.json` es SINTÉTICO** aunque el pipeline ya ingiere
GLM (migración `0004_lightning_buckets.sql`, 2026-07-19): misma razón que
`wind.json` — la grabación vigente es del 2026-07-11 y re-grabar destruiría
el caso BYX. Lo genera
`node scripts/make-lightning-fixture.mjs` (radar-agnóstico: sitio con
meso+raster = cubos de 300 s continuos sobre sus vol_times con clústeres
sobre las celdas grabadas, cubos vacíos intercalados y un vecino cross-día
para el padding; siguiente sitio = cubos fuera de toda ventana; resto =
vacío), junto con los ficheros de strikes en
`tests/fixtures/cogs/r2/<site>/LIGHTNING/…`. **Regenerarlo tras cada
re-grabación** — hasta la próxima re-grabación COMPLETA: ahí
`record-fixtures.sh` ya graba `lightning_buckets` real, hay que bajar los
JSON de strikes de los cubos grabados (mismo flujo curl que los COGs
golden) y el generador se retira.
