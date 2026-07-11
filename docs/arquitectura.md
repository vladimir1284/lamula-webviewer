# Arquitectura

Una sola aplicación **Nuxt 3** desplegada en **Cloudflare Pages** (preset `cloudflare-pages` de Nitro). Las server routes (`/server/api/*`) corren como Pages Functions en el edge y leen D1 por binding; el cliente renderiza el mapa OpenLayers y decodifica los COG directamente desde R2. No hay backend propio que operar: el "backend" es la misma app.

```
                    Cloudflare Pages (un solo deploy)
┌─────────────────────────────────────────────────────────────┐
│  Nuxt 3                                                     │
│                                                             │
│  server routes (/api/*)          cliente (navegador)        │
│  ┌──────────────────────┐        ┌────────────────────────┐ │
│  │ DAL adaptador live   │  JSON  │ Pinia stores           │ │
│  │ binding D1 (lectura) │───────▶│ OpenLayers map         │ │
│  │ claves R2 → URLs     │        │  WebGLTileLayer +      │ │
│  └──────────┬───────────┘        │  ol/source/GeoTIFF ────┼─┼──▶ R2 (COGs,
│             │                    │  paleta = color ramp   │ │    HTTP range,
│             ▼                    │  proj4 AEQD por radar  │ │    CORS)
│      Cloudflare D1               └────────────────────────┘ │
│      (compartida con                                        │
│       nexrad-l3-pipeline,                                   │
│       solo lectura aquí)                                    │
└─────────────────────────────────────────────────────────────┘
```

## Componentes

| Componente | Responsabilidad |
|---|---|
| **DAL** | Interfaz única de datos. Adaptador **live**: server routes → binding D1 + construcción de URLs R2. Adaptador **fixture**: mismas rutas servidas desde respuestas grabadas + COGs golden del repo, para CI determinista y desarrollo offline. Nada por encima del DAL sabe de dónde vienen los datos. |
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
| Framework | Nuxt 3 (Vue 3, Composition API, TypeScript) | preset Nitro `cloudflare-pages` |
| Estado / routing | Pinia + Vue Router (integrados en Nuxt) | |
| Estilos | Tailwind CSS | |
| Componentes | PrimeVue v4 (modo unstyled + Tailwind) | DataTable/DatePicker/Slider pesados en esta app |
| Mapa | OpenLayers ≥ 9 + proj4 | `ol/source/GeoTIFF`, `WebGLTileLayer` |
| i18n | @nuxtjs/i18n | es + en |
| Validación API | Zod en server routes | los tipos del contrato viven en un módulo compartido server/cliente |
| Tests | Vitest + @vue/test-utils + Playwright | visual-regression con goldens propios |
| Deploy | Cloudflare Pages vía `wrangler-action` en GitHub Actions | preview deployments por PR |

## Flujo de datos típico (una vista)

1. Ruta `/{radar}/{product}/{datetime}` (SSR resuelve shell + metadata inicial).
2. Cliente pide `/api/rasters/closest?site=AMX&product=153&t=…` → fila de `rasters` con `r2_key`, calibración y dimensiones.
3. `ol/source/GeoTIFF` abre `https://<r2-público>/{r2_key}` — descarga solo los tiles/overviews del viewport (range requests).
4. Estilo WebGL mapea nivel crudo → color con la paleta del producto; niveles 0 (nodata) y 1 (range folded) con tratamiento especial.
5. Overlays (celdas, meso, TVS, VWP) llegan de `/api/phenomena` y `/api/vwp` por `(site, vol_time)` del raster mostrado.
6. Timeline pide `/api/rasters/times?site&product&day` para poblar el slider; animación prefetchea los N frames siguientes.

## Estado en URL

- **Ruta**: `/{locale?}/{radar}/{product}/{datetime}` — lo compartible.
- **Query**: `?overlays=cells,tracks,meso&base=osm&opacity=0.8` — modificadores de vista.
- **localStorage**: solo preferencias no compartibles (locale por defecto, última capa base).

Una URL pegada en otro navegador reproduce la vista exacta (mismo frame, mismos overlays).

## Acceso a datos compartidos

- **D1**: binding de solo-lectura-por-disciplina — D1 no tiene roles; el contrato es que este proyecto **jamás escribe** y que las migraciones se aplican únicamente desde `db/` del pipeline. Las server routes usan exclusivamente `SELECT`.
- **R2**: bucket expuesto con acceso público de lectura (dominio custom o `r2.dev`) + CORS habilitado para el origen del viewer. El viewer construye URLs desde `rasters.r2_key`; no lista el bucket ni conoce su estructura más allá de la convención documentada en el [contrato](contrato.md).
