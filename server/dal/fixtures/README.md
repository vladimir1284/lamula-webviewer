# Fixtures del adaptador fixture

Grabaciones de las tablas D1 del contrato (una por fichero, filas tal cual
salen de `SELECT *` menos `id`). Las consume `server/dal/fixture.ts` (bundled
en el build — el modo fixture funciona también desplegado) y las validan los
contract tests (`tests/contract/fixtures.spec.ts`: cada fila debe validar
contra los schemas Zod **e insertarse limpia en el schema real del pipeline**).

> **Estado: seed sintético conforme al contrato** (radares AMX/JUA, series
> N0B/DVL, tormenta con celdas A0/B7 + meso, perfiles VWP), construido a mano
> a partir de los datos de test de nexrad-l3-pipeline. La puerta M1 pide
> fixtures **grabadas de la D1 real del demo**: cuando haya credenciales,
> ejecutar `scripts/record-fixtures.sh` y commitear el resultado.

Re-grabación:

```bash
wrangler login                     # una vez
bash scripts/record-fixtures.sh    # sobrescribe server/dal/fixtures/*.json
pnpm test                          # los contract tests validan lo grabado
```

Los COGs golden (3–5 GeoTIFFs commiteados para F2) van en
`tests/fixtures/cogs/` — ver README allí.
