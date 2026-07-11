# LAMULA-WebViewer

Visualizador web de productos de radar NEXRAD Level III: reescritura *clean-sheet* del viewer legado [VestaWeb2](https://github.com/vladimir1284/VestaWeb2) (Svelte 3 + webpack + Django) como aplicación **Nuxt 3 (Vue 3 + Composition API)** desplegada en **Cloudflare Pages**, que consume directamente los almacenes que escribe [nexrad-l3-pipeline](https://github.com/vladimir1284/nexrad-l3-pipeline):

- **Cloudflare R2** — rasters como Cloud-Optimized GeoTIFF (COG) calibrados en proyección AEQD centrada en cada radar, leídos en el navegador por HTTP range requests con `ol/source/GeoTIFF`.
- **Cloudflare D1** — catálogo de radares, metadata de rasters, fenómenos (celdas, mesociclones, TVS, granizo) y perfiles de viento VWP, leídos vía binding interno de las server routes de Nuxt.

Este proyecto **no genera ni persiste datos**: es un consumidor de solo lectura. El pipeline de ingesta es un proyecto aparte con su propia documentación.

## Estado

**Planificación.** Este sitio es el plan reconciliado del proyecto: la versión original del plan (documento *LAMULA-WebViewer — Project Plan*) asumía un backend FastAPI + PostgreSQL + GeoTIFF por FTP heredado del contrato de LAMULA-Ingest; esta versión lo reconcilia con la realidad de ejecución actual — Cloudflare Pages con D1 compartida con el pipeline de ingesta. Los puntos donde la reconciliación cambió el plan original están marcados en [Decisiones de diseño](decisiones.md).

## Qué restaura y qué añade

Restaura todas las capacidades del viewer legado, adaptadas al nuevo contrato de datos:

- Mapa OpenLayers multi-capa con proyecciones AEQD por radar registradas dinámicamente.
- Selección de radar / producto / fecha, timeline con animación y prefetch.
- Leyenda y paletas de color aplicadas como color-ramp WebGL sobre valores calibrados.
- Celdas de tormenta con tracking (posiciones pasadas/pronóstico), tabla ordenada por VIL y charts de tendencia.
- Perfiles de viento VWP (canvas, tabla, barbas).

Y añade lo que el legado dejó pendiente:

- **Renderizado cliente desde GeoTIFF** — el legado consumía PNGs pre-renderizados; aquí la paleta se aplica en GPU sobre valores calibrados, lo que habilita lectura de valor bajo el cursor y cambio de paleta sin regenerar nada.
- **Mosaico multi-radar** (el `// TODO MOSAIC` del legado).
- **Estado compartible por URL** — radar/producto/fecha/overlays en la ruta, deep-linkable.
- **Internacionalización es + en** desde el día uno.
- SSR, accesibilidad y layout responsive.

## Ecosistema

```
Radares NEXRAD → NOAA/Unidata → s3://unidata-nexrad-level3
        │
        ▼
nexrad-l3-pipeline  (headless: decode → COG AEQD → R2; metadata/fenómenos/VWP → D1)
        │
        ├── Cloudflare R2 ── COGs calibrados ──┐
        └── Cloudflare D1 ── catálogo/metadata ─┤
                                                ▼
                                    LAMULA-WebViewer (este proyecto)
                                    Nuxt 3 en Cloudflare Pages
                                    OpenLayers WebGLTile + GeoTIFF
```

Es la encarnación *cloud/demo* del futuro viewer de producción: la capa de acceso a datos (DAL) aísla todo el frontend de la fuente concreta, de modo que apuntar más adelante al contrato de LAMULA-Ingest (PostgreSQL + GeoTIFF servido por HTTP) es escribir un adaptador nuevo, no reescribir el viewer.

## Documentación

- [Arquitectura](arquitectura.md) — stack, componentes, DAL, flujo de datos.
- [Decisiones de diseño](decisiones.md) — decisiones confirmadas y qué murió del plan original.
- [Contrato de datos](contrato.md) — schema D1 + layout R2 consumidos (propiedad del pipeline).
- [Plan de implementación](plan-implementacion.md) — fases, puertas de validación, cronograma, equipo.
- [Validaciones manuales](validaciones.md) — parte manual de cada puerta.
