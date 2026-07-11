# Plan de implementación

Estrategia: **rebanada vertical primero** — un radar × un producto (N0B) renderizado desde COG real de R2 con datos reales de D1 antes de ensanchar. El riesgo #1 (fidelidad del render GeoTIFF cliente) se retira en la primera mitad del proyecto, no al final.

Duración: **26 semanas**. Equipo: **2 ingenieros + 1 experto de dominio / QA**. Modelo de entrega: acelerado por agentes IA, spec-and-test-first — el experto de dominio define escenarios de corrección (qué debe mostrar cada raster, cada chart, cada perfil), los ingenieros los convierten en tests ejecutables antes de implementar.

## Reparto

| Rol | Propiedad principal |
|---|---|
| **Ing. A (lead/arquitectura)** | Shell Nuxt + SSR + routing, DAL (ambos adaptadores), server routes, contract tests, estado en URL, i18n, CI/CD, deploy Pages |
| **Ing. B** | Map core + proyecciones dinámicas, renderer GeoTIFF/WebGL, paletas/leyenda, timeline/animación, storm + VWP UI, charts, mosaico |
| **Dominio/QA** | Definición de paletas y escenarios de corrección, validación QGIS y contra el legado (semántica, no píxeles), casos de datos vacíos/fallos, ejecución de puertas, documentación |

Coordinación continua con nexrad-l3-pipeline: el contrato es compartido y la extensión de `attrs` (prerequisito de F4) se implementa en aquel repo.

## Mecanismos de validación

| Capa | Mecanismo | Qué prueba |
|---|---|---|
| Unit | Vitest (composables, DAL, paletas, matemática de barbas/trends) | lógica sin red |
| Componente | @vue/test-utils + Vitest | componentes aislados con fixtures |
| Contrato | contract tests contra el schema de `db/migrations/` del pipeline + fixtures grabadas de D1 real | drift del contrato rompe CI, no producción |
| Visual | Playwright + screenshots golden (COG conocido + paleta → render esperado) | fidelidad del render y de la leyenda |
| E2E | Playwright contra deploy preview con adaptador fixture | flujos completos deterministas |
| E2E live | smoke test contra el pipeline demo real (D1 + R2 vivos) | integración real, tolerante a datos cambiantes |
| Manual | puertas por fase en [Validaciones manuales](validaciones.md) | criterio de dominio |

## Fases

Cada fase tiene **puerta de validación**: no se avanza sin pasarla.

### F0 — Andamiaje (sem. 1–2)

Repo + esqueleto Nuxt 3 (preset `cloudflare-pages`), TypeScript estricto, Tailwind + PrimeVue, ESLint, Vitest, Playwright, CI (lint + typecheck + tests + build), deploy a Pages con previews por PR, workflow de docs (este sitio).

> **Puerta:** CI verde; "hola mundo" Nuxt servido desde Pages con una server route leyendo D1 real (`SELECT` de `radars`); preview deployment funcionando en un PR.

### F1 — Contrato + DAL (sem. 3–5) → **M1**

Tipos TS del contrato (módulo compartido server/cliente), contract tests versionados, adaptador live completo (server routes: radares, productos, times, closest/next/prev, phenomena, vwp, health), adaptador fixture (respuestas grabadas + 3–5 COGs golden commiteados), switch por env.

> **Puerta (M1):** misma suite de tests de rutas pasa contra ambos adaptadores; contract tests detectan un cambio de schema simulado; fixtures grabadas de la D1 real del demo.

### F2 — Mapa + raster (sem. 6–10) → **M2, riesgo #1 retirado**

Mapa OpenLayers, registro proj4 AEQD dinámico desde `radars.proj4`, base OSM/Web Mercator, capa de cobertura, `ol/source/GeoTIFF` + `WebGLTileLayer` contra R2 real, paletas (catálogo TS por producto, definidas con el experto de dominio), color ramp + nodata/range-folded, leyenda, opacidad, valor bajo cursor.

> **Puerta (M2):** N0B de un radar real renderizado en el navegador coincide con el mismo COG abierto en QGIS con la misma paleta (validación del experto); goldens visuales en CI; los 7 productos raster renderizan sin error.

### F3 — Selección + timeline + animación + URL (sem. 11–14) → **M3**

Switch de radar/producto, date picker (ventana 72 h explícita), timeline con stepping, animación con prefetch medido (sin stutter), estado completo en URL (deep links reproducibles), preferencias en localStorage, frescura por radar.

> **Puerta (M3):** una URL pegada en un navegador limpio reproduce la vista exacta; animación de 20 frames fluida en hardware de referencia; datos faltantes en la ventana degradan visiblemente (huecos marcados, no errores).

### F4 — Fenómenos + VWP (sem. 15–19) → **M4**

**Prerequisito:** extensión de `attrs` en el pipeline (tabular NST + packets 23/24) aterrizada — se coordina durante F2–F3 para que no bloquee.

Overlay de celdas con tracks pasado/pronóstico, tabla ordenada por VIL, charts de tendencia por `cell_id` (VIL/dBZ/top), markers meso/TVS/granizo con atributos, VWP completo (canvas, tabla, barbas — u/v derivados).

> **Puerta (M4):** un caso real de tormenta del feed (capturado como fixture) muestra celdas, tracks, tabla y charts coherentes con la interpretación del experto; VWP validado contra los valores del tabular del producto NVW.

### F5 — Mosaico + i18n + pulido (sem. 20–23)

Vista mosaico multi-radar (N capas AEQD en GPU), catálogo en/es completo con locale en URL, estados vacío/error en toda la app, accesibilidad (teclado, contraste, ARIA en controles del mapa), layout responsive/móvil.

> **Puerta:** mosaico con los 3 radares del demo animando sin caer del presupuesto de frames; auditoría i18n sin strings hardcodeados; pase de accesibilidad básico.

### F6 — Validación E2E + endurecimiento (sem. 24–26) → **M5**

Validación end-to-end contra el pipeline demo vivo (el criterio de éxito del plan: viewer completo leyendo COGs y filas reales), presupuesto de rendimiento y de límites del tier gratuito (caching de API), smoke tests live en CI programado, documentación de operación, backlog stage-2 formalizado.

> **Puerta (M5):** el experto de dominio opera el viewer completo contra datos vivos durante una semana sin encontrar bloqueantes; charts/VWP/tracks correctos en al menos un episodio convectivo real; deploy reproducible desde cero documentado.

## Hitos

| Hito | Semana | Señal |
|---|---|---|
| M1 | 5 | DAL dual sirviendo datos reales y fixtures |
| M2 | 10 | render GeoTIFF cliente validado — riesgo #1 retirado |
| M3 | 14 | timeline/animación + estado compartible |
| M4 | 19 | storm + VWP completos sobre `attrs` extendido |
| M5 | 26 | viewer completo validado contra el pipeline vivo |

## Stage 2 (documentado, no construido)

Render server-side (titiler) si el WebGL no alcanzara en hardware objetivo; paletas custom de usuario; export de animaciones a video/GIF; alertas sobre umbrales de fenómenos; PWA/offline; locales adicionales; re-apuntado al contrato LAMULA-Ingest (PostgreSQL + HTTP) vía nuevo adaptador DAL; base EPSG:2085 para radares cubanos.

## Documentación

Este sitio (MkDocs Material) se despliega automáticamente a **Cloudflare Pages** cuando cambian `docs/**` o `mkdocs.yml` en `main` (workflow `docs.yml`).

```bash
uvx --with mkdocs-material mkdocs serve            # preview en :8000
uvx --with mkdocs-material mkdocs build --strict   # lo que corre CI
```

Setup una sola vez:

1. Crear el proyecto Pages: `wrangler pages project create lamula-webviewer-docs --production-branch main`.
2. Secrets en GitHub: `CLOUDFLARE_API_TOKEN` (permiso *Cloudflare Pages — Edit*) y `CLOUDFLARE_ACCOUNT_ID`.
