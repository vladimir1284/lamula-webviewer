# Arquitectura

Una sola aplicación **Nuxt 3** corriendo como servidor Node (preset `node-server` de Nitro) en un contenedor del mismo Docker Swarm donde corre `nexrad-l3-pipeline` — Cloudflare queda solo como DNS/CDN (`orange-cloud`) delante, no como hosting (decisión 38: migrado desde Cloudflare Pages junto con el pase de D1 a Postgres self-hosted). Las server routes (`/server/api/*`) leen Postgres directo, por red interna del Swarm; el cliente renderiza el mapa OpenLayers y decodifica los COG directamente desde R2 (público, sin cambios). No hay backend propio que operar: el "backend" es la misma app.

```
                         Docker Swarm (mismo del pipeline)
┌─────────────────────────────────────────────────────────────┐
│  Nuxt 3 (contenedor Node)                                    │
│                                                               │
│  server routes (/api/*)          cliente (navegador)         │
│  ┌──────────────────────┐        ┌────────────────────────┐ │
│  │ DAL adaptador live   │  JSON  │ Pinia stores           │ │
│  │ Postgres directo     │───────▶│ OpenLayers map         │ │
│  │ (red interna Swarm)  │        │  WebGLTileLayer +      │ │
│  │ claves R2 → URLs     │        │  ol/source/GeoTIFF ────┼─┼──▶ R2 (COGs,
│  └──────────┬───────────┘        │  paleta = color ramp   │ │    HTTP range,
│             │                    │  proj4 AEQD por radar  │ │    CORS, público)
│             ▼                    └────────────────────────┘ │
│      Postgres self-hosted                                    │
│      (compartido con                                         │
│       nexrad-l3-pipeline,                                    │
│       solo lectura aquí)                                     │
└─────────────────────────────────────────────────────────────┘
                    ▲
                    │ orange-cloud (DNS/CDN, no hosting)
                Cloudflare
```

## Componentes

| Componente | Responsabilidad |
|---|---|
| **DAL** | Interfaz única de datos. Adaptador **live**: server routes → Postgres directo (`postgres.js`, red interna del Swarm) + construcción de URLs R2. Adaptador **fixture**: mismas rutas servidas desde respuestas grabadas + COGs golden del repo, para CI determinista y desarrollo offline. Nada por encima del DAL sabe de dónde vienen los datos. |
| **Server routes** (`/server/api/*`) | Endpoints de lectura tipados (Zod/TS) sobre el contrato: radares, productos disponibles, lista de datetimes, raster más cercano/siguiente/anterior, fenómenos por volumen, series por `cell_id`, VWP, health. |
| **Shell & routing** | Rutas file-based de Nuxt, SSR del shell, estado deep-linkable, locale, chrome del layout. |
| **Map core** | Mapa OpenLayers, registro dinámico de proyecciones AEQD por radar (`proj4.defs` con la columna `radars.proj4` tal cual + `register`), base Web Mercator con OSM, capa de cobertura del radar. |
| **Raster renderer** | `WebGLTileLayer` + `ol/source/GeoTIFF` leyendo el COG desde R2; paleta aplicada como expresión de estilo (color ramp) sobre niveles crudos con `value_scale`/`value_offset`; opacidad; valor físico bajo el cursor. |
| **Timeline & animación** | Lista de datetimes (ventana de retención 72 h), stepping siguiente/anterior/más-cercano, playback con prefetch de frames. |
| **Storm engine (UI)** | Overlay de celdas, tracks pasado/pronóstico, tabla ordenada por VIL, charts de tendencia (VIL/dBZ/top por volumen, construidos cliente-side como serie temporal por `cell_id`), markers meso/TVS/granizo. |
| **Wind engine (UI)** | VWP: canvas, tabla, barbas de viento. u/v se derivan de dir/speed en cliente. |
| **Paletas & leyenda** | Paletas versionadas **en este repo** (módulo TS por `product_code`: colores, stops, unidad, ticks); fuente única para el color ramp WebGL y el componente leyenda. |
| **Mosaico** | Vista compuesta multi-radar: N capas WebGLTile AEQD reproyectadas en GPU sobre la vista común. |
| **i18n** | `@nuxtjs/i18n`, catálogos `es` + `en`, locale en URL/preferencias. |
| **Observabilidad** | Logging estructurado cliente/servidor, endpoint de health (frescura por radar desde `radars.last_seen_at`), estados vacío/error explícitos — nada lanza excepción a la cara del usuario. |

## Stack

| Capa | Elección | Nota |
|---|---|---|
| Framework | Nuxt 3 (Vue 3, Composition API, TypeScript) | preset Nitro `node-server` |
| Estado / routing | Pinia + Vue Router (integrados en Nuxt) | |
| Estilos | Tailwind CSS | |
| Componentes | PrimeVue v4 (modo unstyled + Tailwind) | DataTable/DatePicker/Slider pesados en esta app |
| Mapa | OpenLayers ≥ 9 + proj4 | `ol/source/GeoTIFF`, `WebGLTileLayer` |
| i18n | @nuxtjs/i18n | es + en |
| Validación API | Zod en server routes | los tipos del contrato viven en un módulo compartido server/cliente |
| Tests | Vitest + @vue/test-utils + Playwright | visual-regression con goldens propios |
| Deploy | Imagen Docker a `ghcr.io` vía GitHub Actions | deploy real al Swarm manual (`docker stack deploy`), mismo patrón que nexrad-l3-pipeline |

## Flujo de datos típico (una vista)

1. Ruta `/{radar}/{product}/{datetime}` (SSR resuelve shell + metadata inicial).
2. Cliente pide `/api/rasters/closest?site=AMX&product=153&t=…` → fila de `rasters` con `r2_key`, calibración y dimensiones.
3. `ol/source/GeoTIFF` abre `https://<r2-público>/{r2_key}` — descarga solo los tiles/overviews del viewport (range requests).
4. Estilo WebGL mapea nivel crudo → color con la paleta del producto; niveles 0 (nodata) y 1 (range folded) con tratamiento especial.
5. Overlays (celdas, meso, TVS, VWP) llegan de `/api/phenomena` y `/api/vwp` por `(site, vol_time)` del raster mostrado.
6. Timeline pide `/api/rasters/day?site&product&day` (metadata completa, batch, ascendente) para poblar el strip y alimentar el pool de frames de la animación; `/api/rasters/times` (solo vol_times) sigue disponible para consumidores que no necesitan la fila completa.

## Estado en URL

- **Ruta**: `/{locale?}/{radar}/{product}/{datetime}` — lo compartible. El datetime va compacto (`YYYYMMDDTHHMMSS`, p.ej. `/AMX/153/20260711T031649`): el `:` del ISO es hostil a proxies/copy-paste; la conversión con el ISO naive del contrato es 1:1 (`shared/url/time-path.ts`). Sin datetime = vista live: se resuelve el closest a "ahora" y se materializa en la URL con `replace`.
- **Query**: `?overlays=cells,tracks,meso&base=osm&opacity=0.8` — modificadores de vista.
- **localStorage**: solo preferencias no compartibles (locale por defecto, última capa base).

Una URL pegada en otro navegador reproduce la vista exacta (mismo frame, mismos overlays).

La URL es la **fuente de verdad** del estado compartible: los cambios de ruta (incluido back/forward) entran a la máquina de estados de la página como eventos, y las transiciones que cambian la selección navegan como efecto — ver [Máquinas de estado](maquinas-estado.md) (decisión 18: XState para todo el estado de UI).

## Acceso a datos compartidos

- **Postgres**: conexión directa de solo-lectura-por-disciplina (`postgres.js`, red interna del Swarm) — el contrato es que este proyecto **jamás escribe** y que las migraciones se aplican únicamente desde `db/pg_migrations/` del pipeline. Las server routes usan exclusivamente `SELECT`. Sin Postgres alcanzable (`NUXT_PG_*` sin configurar), el DAL live falla con un 503 explícito — usar `NUXT_DAL_ADAPTER=fixture` para desarrollo offline.
- **R2**: bucket expuesto con acceso público de lectura (dominio custom o `r2.dev`) + CORS habilitado para el origen del viewer. El viewer construye URLs desde `rasters.r2_key`; no lista el bucket ni conoce su estructura más allá de la convención documentada en el [contrato](contrato.md). Sin cambios por la migración D1→Postgres — siempre fue acceso por URL pública, nunca binding.
