# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado del repo

**F0 (andamiaje) implementado** — esqueleto Nuxt 3 (preset `cloudflare-pages`) en la raíz: `pages/`, `server/api/`, `components/`, `utils/`, tests en `tests/unit/` (Vitest) y `e2e/` (Playwright contra `wrangler pages dev`). CI en `.github/workflows/ci.yml` (lint + typecheck + unit + build + e2e + deploy Pages con previews por PR). Pendiente de F0: setup Cloudflare una vez (proyecto Pages `lamula-webviewer`, `database_id` real en `wrangler.toml`) — ver README. Fases siguientes en `docs/plan-implementacion.md`.

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
