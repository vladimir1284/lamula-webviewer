# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado del repo

**F1 (contrato + DAL) implementado** sobre el esqueleto de F0. Piezas: tipos+Zod del contrato en `shared/contract/` (compartido server/cliente), DAL en `server/dal/` (adaptador live D1 y adaptador fixture con grabaciones en `server/dal/fixtures/`, switch `NUXT_DAL_ADAPTER=fixture`), server routes completas (`radars`, `products`, `rasters/{times,closest,next,prev}`, `phenomena[/series]`, `vwp`, `health`), contract tests en `tests/contract/` (snapshot del SQL del pipeline + better-sqlite3; drift via `scripts/check-contract-drift.sh` en CI), suite dual en `tests/unit/dal.spec.ts` (misma suite contra ambos adaptadores + paridad — puerta M1), COGs golden reales en `tests/fixtures/cogs/`, e2e Playwright en modo fixture sobre workerd. Fixtures **grabadas de la D1 real** (`scripts/record-fixtures.sh`; credenciales en `.env`, gitignorado); expectativas de tests derivadas de las grabaciones (`tests/helpers/derive.ts`) — re-grabar no rompe tests. Adaptador live validado contra la D1 real vía preview deployment de Pages. R2 público listo: `r2BaseUrl` apunta a `https://nexrad-raster.ladetec.com` (default en `nuxt.config.ts`, override vía `NUXT_PUBLIC_R2_BASE_URL`) y el bucket tiene CORS (GET/HEAD + `Range`; pages.dev, previews y **solo `localhost:3000`** en local — verificado, no cubre el 8788 de wrangler dev) — `cog_url` resuelve. Fases siguientes en `docs/plan-implementacion.md`.

**F2 (mapa + raster) en curso.** Hecho: catálogo rico de productos raster en `shared/products/` (módulo TS por `product_code`, paletas **draft estilo NWS — validación del experto pendiente**, puerta M2), tabla nivel→color 256 entradas (0=nodata, 1=range folded, recorte por `max_level`) en `shared/products/palette.ts`, proyección AEQD dinámica + estilo WebGL en `utils/map/`, `components/RadarMap.vue` (OSM + cobertura + `WebGLTileLayer`/`ol/source/GeoTIFF` con `transition: 0`; usar SIEMPRE en `<ClientOnly>` — el sufijo `.client` monta con template refs nulos) y `MapLegend.vue`, viewer en `pages/index.vue` (selectores, opacidad, valor bajo cursor, `?base=off` apaga la base). Goldens visuales offline: COGs golden commiteados en `tests/fixtures/cogs/r2/<r2_key>` (espejo de las filas grabadas más recientes), servidos por `scripts/serve-cogs.mjs` (CORS+Range) con `NUXT_PUBLIC_R2_BASE_URL` local; proyecto Playwright `goldens` aparte y en serie (contextos WebGL concurrentes en SwiftShader pierden contexto). Imports cliente de `shared/` SIEMPRE vía alias `#shared` (el path relativo rompe el bundle nitro). Falta para M2: validación QGIS + paletas confirmadas por el experto. Los 7 productos raster renderizan sin error (verificado runtime).

El plan reconciliado vive en `docs/` (MkDocs Material, español), desplegado a Cloudflare Pages (proyecto `lamula-webviewer-docs`) al tocar `docs/**` o `mkdocs.yml` en `main`.

## Qué es

Viewer web de productos NEXRAD Level III: reescritura de VestaWeb2 (Svelte 3 + Django) como **Nuxt 3** sobre **Cloudflare Pages**. Lee (solo lectura) los almacenes de **nexrad-l3-pipeline**: COGs AEQD calibrados en R2 (render cliente con OpenLayers `WebGLTileLayer` + `ol/source/GeoTIFF`, paleta como color ramp) y D1 (radares/rasters/fenómenos/VWP, vía binding en server routes).

## Reglas clave (ver docs/decisiones.md — no re-litigar sin motivo)

- El contrato de datos lo posee nexrad-l3-pipeline (`db/migrations/` de aquel repo). Este proyecto **jamás escribe** en D1 ni aplica migraciones; solo `SELECT`.
- Paletas y catálogo rico de productos viven **en este repo** (módulos TS por `product_code`), no en la base.
- Radar-agnóstico: `radars.proj4` se registra tal cual; nada hardcodeado.
- DAL con adaptadores live (D1/R2) y fixture (grabaciones + COGs golden) — todo lo de arriba es agnóstico a la fuente.
- Stack fijado: Nuxt 3 (preset `cloudflare-pages`), Pinia, Tailwind, PrimeVue v4 unstyled, `@nuxtjs/i18n` (es+en), OpenLayers ≥ 9 + proj4, Vitest + Playwright.
- Calibración raster: `físico = nivel · value_scale + value_offset` (niveles ≥ 2); 0 = nodata, 1 = range folded.

## Comandos

```bash
pnpm dev / lint / typecheck / test / build         # app (ver README)
pnpm preview                                       # wrangler pages dev sobre dist/
pnpm test:e2e                                      # Playwright (requiere pnpm build previo)
uvx --with mkdocs-material mkdocs serve            # preview docs en :8000
uvx --with mkdocs-material mkdocs build --strict   # lo que corre CI de docs
```
