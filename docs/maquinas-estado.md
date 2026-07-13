# Máquinas de estado de la interfaz

Todo el estado de la UI se modela con **XState v5** ([decisión 18](decisiones.md)). Esta página es la referencia viva de cada máquina: diagrama, eventos y efectos. **Convención:** el commit que toca una máquina actualiza su diagrama aquí — si el diagrama y `machines/` divergen, es un bug de revisión.

Principios:

- **La URL manda.** La ruta (`/{site}/{product}/{time}` + `?opacity&base`) es la fuente de verdad de lo compartible. Los cambios de ruta —incluido back/forward del navegador— entran a la máquina como evento `ROUTE_CHANGED`; las transiciones que cambian la selección navegan como efecto (`push`/`replace`). La máquina nunca contradice la barra de direcciones.
- **Máquinas puras.** Viven en `machines/`, sin tocar DOM ni router: los efectos (navegación, localStorage, fetch) se inyectan como input/actores, así los unit tests corren con `createActor` sin montar nada.
- **Estado efímero también aquí.** Opacidad, cursor o progreso de buffer no viajan en la URL, pero sí viven en el contexto de la máquina (eventos `SET_OPACITY`, `CURSOR_MOVE`, …).

## Inventario

| Máquina | Fichero | Responsabilidad | Estado |
|---|---|---|---|
| `viewerMachine` | `machines/viewer.ts` | Raíz de la página viewer: selección, carga del raster, timeline, prefs | implementada |
| `animationMachine` | `machines/animation.ts` | Playback: buffering, play/pause, reloj, dwell | pendiente (F3 paso 6) |
| `frameMachine` | `machines/frame.ts` | Ciclo de vida de un frame del pool (prefetch → ready/failed) | pendiente (F3 paso 6) |

## `viewerMachine`

Raíz de la página `pages/[site]/[product]/[[time]].vue`, `type: 'parallel'` con
dos regiones concurrentes: **`raster`** (el frame mostrado) y **`timeline`**
(los rasters del día). Cada región deriva su estado inicial de un fetch hecho
en SSR (`initialRaster`/`initialError` y `initialTimes`/`initialTimelineError`)
vía su propio pseudo-estado `init` — sin trabajo async, el snapshot pre-start
es idéntico en servidor y cliente (hidratación segura; el actor arranca en
`onMounted`).

**Nota de implementación (XState v5):** en una máquina paralela, un `on` a
nivel raíz queda ensombrecido en cuanto *cualquier* región define su propio
`on` para el mismo evento — el evento se da por manejado en esa región y no
burbujea al padre. Por eso `ROUTE_CHANGED` se maneja **dentro de cada
región**, no en la raíz; `assignRoute`/`persistPrefs` corren en la región
`raster` (declarada primero, se ejecuta antes que `timeline` en el mismo
micropaso, así `timeline` ya lee el contexto actualizado). Confirmado con un
test canario antes de fiarse de este comportamiento.

```mermaid
stateDiagram-v2
    state "raster" as R {
        [*] --> r_init
        r_init --> r_shown: initialRaster ≠ null
        r_init --> r_empty: closest SSR dio 404
        r_init --> r_error: fallo del closest SSR
        r_loading --> r_shown: fetchClosest → raster
        r_loading --> r_empty: fetchClosest → 404
        r_loading --> r_error: fetchClosest falla
        r_shown --> r_loading: ROUTE_CHANGED ¬sameFrame
        r_empty --> r_loading: ROUTE_CHANGED ¬sameFrame
        r_error --> r_loading: ROUTE_CHANGED ¬sameFrame
        r_loading --> r_loading: ROUTE_CHANGED ¬sameFrame (cancela el fetch en vuelo)
    }
    --
    state "timeline" as T {
        [*] --> t_init
        t_init --> t_ready: initialTimes.length > 0
        t_init --> t_empty: initialTimes vacío
        t_init --> t_error: fallo del /api/rasters/day SSR
        t_loading --> t_ready: fetchDay → times
        t_loading --> t_empty: fetchDay → []
        t_loading --> t_error: fetchDay falla
        t_ready --> t_loading: ROUTE_CHANGED ¬sameDay
        t_empty --> t_loading: ROUTE_CHANGED ¬sameDay
        t_ready --> t_jumping: SELECT_DAY ¬sameDaySelected
        t_empty --> t_jumping: SELECT_DAY ¬sameDaySelected
        t_jumping --> t_ready: fetchDay → times (+ navigate push al último vol_time)
        t_jumping --> t_empty: fetchDay → [] (sin frame al que saltar, la URL no cambia)
    }
```

**Contexto:** `radars`, `products`, `site`, `product`, `time` (ISO naive; `null` = vista live), `nowT` (instante SSR), `raster`, `rasterError`, `day` (YYYY-MM-DD que la región `timeline` tiene cargado/objetivo), `times`, `timelineError`, `opacity`, `base`, `cursor`, `cogError`.

| Evento | Región | Efecto |
|---|---|---|
| `ROUTE_CHANGED` | `raster` | guard `sameFrame` (site+product+time sin cambios reales) → asigna contexto + `persistPrefs`; si no → `.loading` (reentrar cancela el fetch en vuelo) + `persistPrefs` |
| `ROUTE_CHANGED` | `timeline` | guard `sameDay` (site+product+día sin cambios — cubre stepping dentro del día) → nada; si no → `.loading` con el `day` derivado del nuevo `time` |
| `SELECT_DAY` | `timeline` | guard `sameDaySelected` → nada; si no → `.jumping`: al resolver, si el día tiene datos, salta (push) al último `vol_time`; si no, se queda en `empty` sin tocar la URL (nada a lo que saltar) |
| `MOUNTED` | — | guard (time `null` + raster resuelto) → efecto `navigate` replace al `vol_time` (la URL siempre contiene el frame exacto) |
| `SELECT_SITE` / `SELECT_PRODUCT` | — | efecto `navigate` push — la máquina **no** refetchea aquí; el refetch llega por `ROUTE_CHANGED` en cada región (URL manda) |
| `SET_OPACITY` | — | asigna contexto + `persistPrefs` + `syncQuery` (query `?opacity` con replace debounced 300 ms, omitida si es el default 0.8) |
| `CURSOR_MOVE` / `COG_ERROR` | — | asignan contexto |

**Corrección de URL generalizada:** cuando `fetchClosest` resuelve, si el `vol_time` devuelto difiere del `time` pedido (vista live, o cualquier instante que no coincide con un vol_time real — p.ej. el `SELECT_DAY` pide "fin de día" implícitamente vía `/api/rasters/day` y salta al último real), se hace `replace`/`push` al `vol_time` exacto. La URL nunca muestra un instante distinto del frame realmente exhibido (puerta M3).

**Prefs (`lamula:prefs` en localStorage, nunca el `time` ni el `day`):** toda navegación (`ROUTE_CHANGED`) y todo cambio de opacidad disparan `persistPrefs` con `{site, product, opacity, base}` — así `/` siempre redirige a la última selección real, no a un valor mudo. `composables/useViewerPrefs.ts` valida versión/shape al leer (corrupto o `v` desconocida → `null`, no rompe la redirección).

**Dependencias inyectadas** (`.provide()` en la página; mocks en tests): actores `fetchClosest` (`$fetch` a `/api/rasters/closest`, 404 → `null`) y `fetchDay` (`$fetch` a `/api/rasters/day`); acciones `navigate` (router push/replace conservando query, `composables/useViewerRoute.ts`), `persistPrefs` (`savePrefs`) y `syncQuery` (replace debounced de `?opacity&base`, ambas en la página).

**Day picker (`components/DayPicker.vue`):** botones de día UTC sobre la ventana de 72h anclada a `radar.last_seen_at` (`utils/time-window.ts::dayWindow72h`, decisión 11) — no wall-clock, así un radar muerto sigue mostrando sus días con datos y las fixtures no se pudren. Click → evento `SELECT_DAY`.
