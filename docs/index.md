# LAMULA-WebViewer

Visualizador web de productos de radar NEXRAD Level III: reescritura *clean-sheet* del viewer legado [VestaWeb2](https://github.com/vladimir1284/VestaWeb2) (Svelte 3 + webpack + Django) como aplicación **Nuxt 3 (Vue 3 + Composition API)**, corriendo como contenedor Node en el mismo **Docker Swarm** donde corre [nexrad-l3-pipeline](https://github.com/vladimir1284/nexrad-l3-pipeline), que consume directamente los almacenes que ese pipeline escribe:

- **Cloudflare R2** — rasters como Cloud-Optimized GeoTIFF (COG) calibrados en proyección AEQD centrada en cada radar, leídos en el navegador por HTTP range requests con `ol/source/GeoTIFF`. Acceso público por URL, sin cambios desde el inicio del proyecto.
- **Postgres self-hosted** — catálogo de radares, metadata de rasters, fenómenos (celdas, mesociclones, TVS), perfiles de viento VWP, grillas de viento GFS y cubos de rayos GLM, leídos por conexión directa de solo-lectura desde las server routes de Nuxt (red interna del Swarm, sin binding que cruzar).

Cloudflare queda únicamente como DNS/CDN (`orange-cloud`) delante del Swarm — no como hosting de la app (decisión 38: migrado desde Cloudflare Pages + D1). Este proyecto **no genera ni persiste datos del pipeline**: sobre ese contrato es un consumidor de solo lectura. La única excepción, acotada y explícita, es el schema propio `viewer.*` (feedback de usuarios, decisión 39), dominio de este repo.

## Estado

**En construcción activa, con la mayoría del alcance original ya implementado.** Fases F0–F4 (andamiaje, contrato/DAL, mapa/raster, selección/timeline/animación/URL, fenómenos/VWP) completas; capas opcionales de viento (GFS) y rayos (GLM) integradas con pipeline propio; rediseño visual a mapa-pantalla-completa hecho; exportación de la vista como PNG con anotaciones y marca de agua (F7.1/F7.2) hecha; sistema de feedback de usuarios con panel admin hecho. Pendiente: mosaico multi-radar + i18n completo (F5), validación E2E contra datos vivos (F6), export GIF/WebM (F7.3) y la puerta M4 (validación del experto con datos vivos de fenómenos). Detalle fase por fase en [Plan de implementación](plan-implementacion.md); el estado operativo vivo (qué hay hecho, qué decisión lo sostiene) vive en `CLAUDE.md` del repo. Los puntos donde la ejecución se apartó del plan original están marcados en [Decisiones de diseño](decisiones.md).

## Qué restaura y qué añade

Restaura todas las capacidades del viewer legado, adaptadas al nuevo contrato de datos:

- Mapa OpenLayers multi-capa con proyecciones AEQD por radar registradas dinámicamente.
- Selección de radar / producto / fecha, timeline con animación y prefetch.
- Leyenda y paletas de color aplicadas como color-ramp WebGL sobre valores calibrados.
- Celdas de tormenta con tracking (posiciones pasadas/pronóstico), tabla ordenada por `dbz_max` y charts de tendencia.
- Perfiles de viento VWP (canvas, tabla, barbas).

Y añade lo que el legado dejó pendiente, más alcance nuevo no contemplado en el plan original:

- **Renderizado cliente desde GeoTIFF** — el legado consumía PNGs pre-renderizados; aquí la paleta se aplica en GPU sobre valores calibrados, lo que habilita lectura de valor bajo el cursor y cambio de paleta sin regenerar nada.
- **Estado compartible por URL** — radar/producto/fecha/overlays en la ruta, deep-linkable; toda la UI gestionada con máquinas de estado XState v5 (decisión 18).
- **Capas de viento (partículas GFS) y rayos (bucle animado GLM)** — no existían en el contrato ni en el legado; cada una con su propio job de ingesta en el pipeline (specs en [pipeline-viento.md](pipeline-viento.md) y [pipeline-rayos.md](pipeline-rayos.md)).
- **Exportar la vista como PNG** con chrome (marca, leyenda, atribución), anotaciones a mano alzada y marca de agua — compartir una vista sin depender de un deep-link ni de la ventana de retención de 72 h.
- **Feedback de usuarios in-app** con panel de administración (decisión 39).
- **Mosaico multi-radar** (el `// TODO MOSAIC` del legado) — especificado, pendiente de construir (F5).
- **Internacionalización es + en** — especificada desde el día uno, strings aún hardcodeados en español (pendiente, F5).
- SSR, accesibilidad y layout responsive (mapa a pantalla completa, controles flotantes — decisión 36).

## Ecosistema

```
Radares NEXRAD → NOAA/Unidata → s3://unidata-nexrad-level3
        │                                    GFS (NOMADS) ──┐
        ▼                                    GOES-19 GLM ───┤
nexrad-l3-pipeline  (headless: decode → COG AEQD → R2; metadata/fenómenos/VWP/viento/rayos → Postgres)
        │
        ├── Cloudflare R2 ──────── COGs + grillas de viento + cubos de rayos ──┐
        └── Postgres self-hosted ─ catálogo/metadata (solo lectura aquí) ──────┤
                                                                                ▼
                                                          LAMULA-WebViewer (este proyecto)
                                                          Nuxt 3 (Node) en Docker Swarm
                                                          OpenLayers WebGLTile + GeoTIFF
                                                                                │
                                                          Cloudflare (DNS/CDN, orange-cloud) ◀┘
```

Mismo Swarm, misma Postgres: el DAL aísla el frontend de la fuente concreta de datos (adaptador **live** vs. **fixture** grabado), así que un futuro re-apuntado de contrato es un adaptador nuevo, no una reescritura del viewer.

## Documentación

- [Arquitectura](arquitectura.md) — stack, componentes, DAL, flujo de datos.
- [Decisiones de diseño](decisiones.md) — decisiones confirmadas y qué murió del plan original.
- [Contrato de datos](contrato.md) — schema Postgres + layout R2 consumidos (propiedad del pipeline).
- [Spec pipeline viento](pipeline-viento.md) — contrato de las grillas GFS que ingiere el pipeline para la capa de viento.
- [Spec pipeline rayos](pipeline-rayos.md) — contrato de los cubos GLM que ingiere el pipeline para la capa de rayos.
- [Máquinas de estado](maquinas-estado.md) — diagramas y notas de implementación de las máquinas XState.
- [Plan de implementación](plan-implementacion.md) — fases, puertas de validación, cronograma, equipo.
- [Plan de feedback de usuarios](plan-feedback.md) — schema `viewer.*`, flujo in-app y panel admin.
- [Estrategia de pruebas](pruebas.md) — niveles de prueba, paridad de DAL, goldens visuales.
- [Validaciones manuales](validaciones.md) — parte manual de cada puerta.
