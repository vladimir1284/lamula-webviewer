# LAMULA-WebViewer

Visualizador web de productos de radar NEXRAD Level III. Reescritura del viewer legado [VestaWeb2](https://github.com/vladimir1284/VestaWeb2) como aplicación **Nuxt 3 (Vue 3)** sobre **Cloudflare Pages**, consumiendo los almacenes que escribe [nexrad-l3-pipeline](https://github.com/vladimir1284/nexrad-l3-pipeline): COGs calibrados en R2 (renderizados en el navegador con OpenLayers WebGL) y catálogo/metadata/fenómenos/VWP en D1 (leída vía binding de las server routes).

Proyecto de **solo lectura**: no genera ni persiste datos. El contrato de datos (schema D1 + layout R2) lo posee el pipeline.

**Estado: F0 (andamiaje).** El plan reconciliado completo (arquitectura, decisiones, contrato, fases) está en `docs/` (MkDocs Material), desplegado automáticamente a Cloudflare Pages.

## Desarrollo

```bash
pnpm install
pnpm dev          # dev server Nuxt en :3000 (sin binding D1 → estado de error explícito)
pnpm lint         # ESLint
pnpm typecheck    # vue-tsc vía nuxt typecheck
pnpm test         # Vitest (unit)
pnpm build        # build con preset cloudflare-pages → dist/
pnpm preview      # wrangler pages dev sobre dist/ (runtime workerd local)
pnpm test:e2e     # Playwright contra wrangler pages dev (requiere build previo)
```

CI (`.github/workflows/ci.yml`): lint + typecheck + unit + build + e2e; deploy a Cloudflare Pages en `main` (producción) y en PRs (preview deployments).

### Setup una vez (Cloudflare)

1. `wrangler pages project create lamula-webviewer --production-branch main`
2. Secrets en GitHub: `CLOUDFLARE_API_TOKEN` (permiso *Cloudflare Pages — Edit*) y `CLOUDFLARE_ACCOUNT_ID` (ya usados por el workflow de docs).
3. CORS del bucket R2 para el origen de Pages (ver `docs/contrato.md`).

Preview local de la documentación:

```bash
uvx --with mkdocs-material mkdocs serve   # http://localhost:8000
```
