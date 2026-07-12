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
