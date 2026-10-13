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

Vista mosaico multi-radar (**hecha fuera de orden**: P3–P6, decisiones 43–49), catálogo en/es completo con locale en URL, estados vacío/error en toda la app, accesibilidad (teclado, contraste, ARIA en controles del mapa), layout responsive/móvil.

**i18n por rebanadas** (decisión 52 fija estrategia y fronteras):

| Rebanada | Alcance | Estado |
|---|---|---|
| A — plomería | `@nuxtjs/i18n` v10, `prefix_except_default` con `es` por defecto, catálogos por namespace en `i18n/locales/{es,en}/`, `<html lang>` + título/descripción/hreflang desde el catálogo, selector de idioma en `PrefsDialog`, `scripts/check-i18n.mjs` en CI, canario de colisión de prefijo | hecho |
| B — chrome del mapa | `RadarProductChip`, `LayersMenu`, `TimelineStrip`, `TimelineMenu`, `MapLegend`, `DayPicker`, `FreshnessBadge` (+ `utils/freshness.ts` devuelve datos, no texto) | hecho |
| C — datos | `DataModal`, `CellTable`, `TrendChart`, `VwpChart`, `VwpTable`, `VcpInfoModal` (`WindBarb` no tenía ningún string) | hecho |
| D — export y anotaciones | `ExportDialog`, `AnnotationBar` — el chrome del PNG se traduce en el componente, `utils/export/` sigue sin importar Vue | hecho |
| E — feedback, admin y mosaico | `FeedbackDialog`, `FeedbackNudge`, `pages/admin/**`, `MosaicDomainChip`, `MosaicMap`, las 4 páginas de ruta | hecho |
| F — cierre | nombres de producto (`products.*` + `useProductLabel`), catálogo de VCP (`vcp.catalog.*`), etiquetas de los enums de feedback, auditoría de strings crudos (`scripts/check-i18n-raw.mjs`) en CI | hecho — **falta la revisión del inglés por el experto** |

**Accesibilidad** (decisión 54, hecha): auditada contra cinco criterios — operable por teclado, nombre accesible, modales correctos, cambios anunciados, contraste AA.

| Criterio | Estado |
|---|---|
| Modales (`showModal()` nativo: trampa de foco, Escape, retorno) | ya cumplía, sin cambios |
| Teclado | mapa focusable (`tabindex` + `role="application"`) y flechas repartidas por foco; `Home`/`End` en el slider; flechas en el tablist |
| Nombre y estado accesibles | `aria-expanded`/`aria-controls` en los 6 disclosure; patrón ARIA tabs completo en `DataModal` |
| Cambios anunciados | `role="alert"` en errores, `role="status"` en vacíos; `raster-meta` sin anunciar a propósito |
| Contraste | tres arreglos medidos (texto, bordes de control, handle del timeline) |

Regresión en `e2e/a11y.spec.ts`.

**Pase móvil del timebar** (decisión 55, hecho): lo que D36 dejó pendiente. Auditado midiendo el DOM renderizado a 320/360/390/414/640×360/768 px.

| Criterio | Estado |
|---|---|
| Nada se solapa ni sale del viewport entre 320 y 430 px | hecho — etiquetas elegidas por píxeles medidos, pastilla "en vivo" inline bajo `sm:`, tooltip anclado al borde |
| Todo control táctil ≥ 44×44 px | hecho — prev/next 36→44 bajo `md:`, pastilla "en vivo" a 44 de alto |
| El alto del timebar no crece | en vertical se queda en 122 px (suelo: play 56 + etiquetas 32 + track 16); en horizontal baja de 122 a 88 al mover el corte de layout a `sm:` |
| De 1024 px para arriba, ni un píxel de cambio | verificado midiendo a 1280 y 1440: mismas 6 etiquetas, mismas posiciones |
| La información degrada, no desaparece | menos etiquetas, nunca menos de los dos extremos; el timestamp exacto sigue en el tooltip del scrub |

Regresión en `e2e/mobile.spec.ts` (geometría real: en jsdom todo `getBoundingClientRect` da 0) y `tests/unit/timeline-labels.spec.ts` (la selección de etiquetas sí es pura).

**Pase móvil del chip de identidad** (decisión 56, hecho): `RadarProductChip.vue` y, por la paridad de D48, `MosaicDomainChip.vue`.

| Criterio | Estado |
|---|---|
| Título legible entero entre 320 y 1280 px | hecho — fuera el `truncate`; antes se cortaba a TODOS los anchos (197 px de texto en 177 de caja a 1280; 73 px a 360) |
| Cero solapes medidos | hecho — antes la insignia pisaba el enlace 29 px a 360 y 44 px a 320, y el ⓘ 7 px a 320 |
| Insignia de frescura en un renglón | hecho — `whitespace-nowrap`; antes 3 renglones ≤414 px y 2 a 768/1280 |
| Nada se esconde para caber | hecho — el enlace a mosaico y el detalle siguen a un toque; el ⓘ se fusiona con el `⌄` |
| Escritorio sin regresión | ancho y orden visual intactos; el **alto** sube de 72 a 90 px en el chip de radar (el enlace no cabe en la fila de estado por 12 px) y baja de 70 a 66 en el del mosaico |

Coste en móvil, medido y asumido: la tarjeta pasa de 90 a 126 px de alto a 360 px y a 166 a 320 px — el alto es el precio de que tres o cuatro piezas dejen de solaparse en 190 px útiles. El chip **no se puede ensanchar**: `max-w-[calc(100vw-9rem)]` reserva el botón de capas (107 px, 5 px de aire a 320). **Queda de F5** `LayersMenu.vue` desplegado en móvil.

> **Puerta:** mosaico con los 3 radares del demo animando sin caer del presupuesto de frames (**nota**: la animación del mosaico quedó diferida por la decisión 44 — la geometría por fila puede cambiar dentro de una ventana; la puerta se renegocia o se cubre con la vista estática validada en P6); auditoría i18n sin strings hardcodeados ✅; pase de accesibilidad básico ✅; timebar y chip de identidad usables en móvil ✅ (queda `LayersMenu` desplegado).

### F6 — Validación E2E + endurecimiento (sem. 24–26) → **M5**

Validación end-to-end contra el pipeline demo vivo (el criterio de éxito del plan: viewer completo leyendo COGs y filas reales), presupuesto de rendimiento y de límites del tier gratuito (caching de API), smoke tests live en CI programado, documentación de operación, backlog stage-2 formalizado.

> **Puerta (M5):** el experto de dominio opera el viewer completo contra datos vivos durante una semana sin encontrar bloqueantes; charts/VWP/tracks correctos en al menos un episodio convectivo real; deploy reproducible desde cero documentado.

### F7 — Exportación de capturas (fuera de orden: se construye antes que F5/F6)

Compartir una vista hoy exige un deep-link, red y que el dato siga dentro de la retención de 72 h. F7 produce un artefacto autocontenido. Se adelanta a F5 y F6 por prioridad de producto; la consecuencia es que F5 (i18n) tendrá que traducir también los strings del export.

**F7.1 — PNG WYSIWYG (hecho).** Compositor propio sobre los N canvas de `.ol-layers` (`utils/export/`), chrome opcional en Canvas2D (marca, sitio/producto/hora, leyenda, atribución) en franja inferior o superpuesto, descarga + copia al portapapeles, preferencias en `lamula:export`. Ver decisión 40 para por qué no sirve la receta oficial de OL y qué cuesta el `crossOrigin` global.

> **Puerta (F7.1):** dos exports seguidos de la misma vista deep-linkeada dan un fichero byte-idéntico; con el mapa base encendido no se omite ninguna capa (guarda de CORS); el canario del contrato de DOM de OL pasa; y el experto valida un PNG del volumen con las ocho capas activas, franja legible y pegado correcto en un cliente de chat real.

**F7.2 — Anotaciones y marca (hecho).** Capa vectorial de anotaciones en coordenadas de mapa EPSG:3857 (`Draw`+`Modify`, zIndex 21, cuatro herramientas: flecha, círculo, trazo libre y rótulo), estado en `annotationMachine` y persistencia por sitio en `lamula:annotations`; marca de agua sutil del logo sobre el área del mapa y avatar del usuario normalizado a 128×128 en `lamula:export`, que nunca sale del navegador. El "resaltado de geometrías" del plan original no se construyó como mecanismo aparte: la celda seleccionada ya se dibuja distinta y el export es WYSIWYG, así que ya sale resaltada — para cualquier otra geometría está la herramienta de círculo (ver decisión 40).

> **Puerta (F7.2):** anotar, hacer pan+zoom de ida y vuelta, exportar y comprobar por píxel que la anotación cae en la posición proyectada esperada; recargar y recuperarla.

**F7.3 — GIF y WebM (hecho).** Reloj inyectado en las capas de viento y rayos (`setExportPhase` / `setExportMode`+`stepExport`, sin pausarlas: pausar limpia su canvas), driver de frames sobre el `FramePool` existente, `gifenc` en un Worker con buffers transferibles, vídeo por `captureStream(0)`+`MediaRecorder`. Dos formas: secuencia del radar (exige haber reproducido una vez) y bucle de rayos sobre un volumen, las dos con la fase repartida en `k/N` para que el bucle cierre sin costura. GIF a 960 px de ancho y DPR 1, tope duro de 8 MB. El fade de estelas del viento se escala con el `dt` del sub-paso y el driver calienta el viento antes del frame 0; el empalme residual es decorrelación del campo, no una costura (decisión 42). Ver decisión 42.

> **Puerta (F7.3):** dos exports GIF consecutivos de la misma vista son byte-idénticos **con viento y rayos encendidos** (cubre semilla del viento, fase de rayos, sub-paso y determinismo del encoder) — verificado en `e2e/export-animation.spec.ts`; GIF bajo 8 MB con cabecera `GIF89a`, extensión Netscape de bucle infinito y un descriptor de imagen por frame. Revisado a ojo sobre `pnpm shot:export` (2026-10-10): corregidos el largo de las estelas y la rampa del frame 0. Pendiente de validación del experto: que un GIF de la secuencia sea legible en un cliente de chat real.

## Hitos

| Hito | Semana | Señal |
|---|---|---|
| M1 | 5 | DAL dual sirviendo datos reales y fixtures |
| M2 | 10 | render GeoTIFF cliente validado — riesgo #1 retirado |
| M3 | 14 | timeline/animación + estado compartible |
| M4 | 19 | storm + VWP completos sobre `attrs` extendido |
| M5 | 26 | viewer completo validado contra el pipeline vivo |

## Stage 2 (documentado, no construido)

Render server-side (titiler) si el WebGL no alcanzara en hardware objetivo; paletas custom de usuario; alertas sobre umbrales de fenómenos; PWA/offline; locales adicionales; re-apuntado al contrato LAMULA-Ingest (PostgreSQL + HTTP) vía nuevo adaptador DAL; base EPSG:2085 para radares cubanos.

## Documentación

Este sitio (MkDocs Material) se despliega automáticamente a **Cloudflare Pages** cuando cambian `docs/**` o `mkdocs.yml` en `main` (workflow `docs.yml`).

```bash
uvx --with mkdocs-material mkdocs serve            # preview en :8000
uvx --with mkdocs-material mkdocs build --strict   # lo que corre CI
```

Setup una sola vez:

1. Crear el proyecto Pages: `wrangler pages project create lamula-webviewer-docs --production-branch main`.
2. Secrets en GitHub: `CLOUDFLARE_API_TOKEN` (permiso *Cloudflare Pages — Edit*) y `CLOUDFLARE_ACCOUNT_ID`.
