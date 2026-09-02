# LAMULA-WebViewer

Visualizador web de productos de radar NEXRAD Level III. Reescritura del viewer legado [VestaWeb2](https://github.com/vladimir1284/VestaWeb2) como aplicación **Nuxt 3 (Vue 3)**, corriendo como servidor Node en el mismo Docker Swarm que [nexrad-l3-pipeline](https://github.com/vladimir1284/nexrad-l3-pipeline) (Cloudflare queda como DNS/CDN delante, no como hosting — ver `docs/decisiones.md`). Consume los almacenes que escribe el pipeline: COGs calibrados en R2 (renderizados en el navegador con OpenLayers WebGL, vía URL pública) y catálogo/metadata/fenómenos/VWP en Postgres (leído directo, por red interna del Swarm).

Proyecto de **solo lectura**: no genera ni persiste datos. El contrato de datos (schema Postgres + layout R2) lo posee el pipeline.

**Estado: F1 (contrato + DAL).** El plan reconciliado completo (arquitectura, decisiones, contrato, fases) está en `docs/` (MkDocs Material), desplegado automáticamente a Cloudflare Pages.

## Desarrollo

```bash
pnpm install
pnpm dev          # dev server Nuxt en :3000 (sin Postgres configurado → estado de error explícito)
NUXT_DAL_ADAPTER=fixture pnpm dev   # desarrollo offline con fixtures grabadas
pnpm lint         # ESLint
pnpm typecheck    # vue-tsc vía nuxt typecheck
pnpm test         # Vitest (unit + contract tests)
pnpm build        # build con preset node-server → .output/
pnpm preview      # node .output/server/index.mjs
pnpm test:e2e     # Playwright contra el server Node del build, en modo fixture (requiere build previo)
```

Para probar el adaptador `live` en local hace falta un Postgres alcanzable (`NUXT_PG_HOST`/`NUXT_PG_PORT`/`NUXT_PG_DATABASE`/`NUXT_PG_USER`/`NUXT_PG_PASSWORD`) — `pnpm db:setup` lo inicializa con el schema real del pipeline y las mismas fixtures que usa el adaptador `fixture` (ver env vars al inicio de `scripts/seed-local-db.mjs`).

CI (`.github/workflows/ci.yml`): lint + typecheck + unit/contract + drift del schema + build + e2e; imagen a `ghcr.io` en `main` (el deploy real al Swarm es manual, `docker stack deploy`, mismo patrón que `nexrad-l3-pipeline`).

### Datos: DAL con dos adaptadores

Las server routes (`/api/radars`, `/api/products`, `/api/rasters/{times,day,closest,next,prev}`, `/api/phenomena[/series]`, `/api/vwp`, `/api/health`) hablan con una interfaz única (`server/dal/`) con dos implementaciones:

- **live** (por defecto): Postgres directo (solo `SELECT`, vía `postgres.js`) + URLs de COG desde `rasters.r2_key` sobre `NUXT_PUBLIC_R2_BASE_URL`.
- **fixture** (`NUXT_DAL_ADAPTER=fixture`): grabaciones commiteadas en `server/dal/fixtures/` — CI determinista y desarrollo offline. Re-grabar desde la Postgres real: `bash scripts/record-fixtures.sh`.

El contrato se vigila en dos capas: `tests/contract/` (columnas/índices/constraints de los que depende el viewer, sobre el snapshot `tests/contract/schema/`, ejecutado contra SQLite real — traducción mecánica de `BIGSERIAL`, ver `tests/helpers/pg-sqlite.ts`) y `scripts/check-contract-drift.sh` (el snapshot debe ser idéntico a `db/pg_migrations/0001_init.sql` del pipeline; corre en CI). Los COGs golden para F2 viven en `tests/fixtures/cogs/`.

### Setup una vez

1. DNS del dominio del viewer apuntado (orange-cloud) al Traefik del Swarm; modo SSL "Full (strict)" en Cloudflare.
2. Secrets del Swarm: credenciales Postgres (`nexrad_pg_password`, compartido con el pipeline).
3. CORS del bucket R2 para el origen público del viewer (ver `docs/contrato.md`).

Preview local de la documentación:

```bash
uvx --with mkdocs-material mkdocs serve   # http://localhost:8000
```
