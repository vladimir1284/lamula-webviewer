# Máquinas de estado de la interfaz

Todo el estado de la UI se modela con **XState v5** ([decisión 18](decisiones.md)). Esta página es la referencia viva de cada máquina: diagrama, eventos y efectos. **Convención:** el commit que toca una máquina actualiza su diagrama aquí — si el diagrama y `machines/` divergen, es un bug de revisión.

Principios:

- **La URL manda.** La ruta (`/{site}/{product}/{time}` + `?opacity&base`) es la fuente de verdad de lo compartible. Los cambios de ruta —incluido back/forward del navegador— entran a la máquina como evento `ROUTE_CHANGED`; las transiciones que cambian la selección navegan como efecto (`push`/`replace`). La máquina nunca contradice la barra de direcciones.
- **Máquinas puras.** Viven en `machines/`, sin tocar DOM ni router: los efectos (navegación, localStorage, fetch) se inyectan como input/actores, así los unit tests corren con `createActor` sin montar nada.
- **Estado efímero también aquí.** Opacidad, cursor o progreso de buffer no viajan en la URL, pero sí viven en el contexto de la máquina (eventos `SET_OPACITY`, `CURSOR_MOVE`, …).

## Inventario

| Máquina | Fichero | Responsabilidad | Estado |
|---|---|---|---|
| `viewerMachine` | `machines/viewer.ts` | Raíz de la página viewer: selección, carga del raster, timeline, prefs, toggles de overlays | implementada |
| `animationMachine` | `machines/animation.ts` | Playback: buffering, play/pause, reloj, dwell | implementada |
| `frameMachine` | `machines/frame.ts` | Ciclo de vida de un frame del pool (pending → ready/failed) | implementada |
| `overlayMachine` | `machines/overlay.ts` | Fenómenos + VWP: índices del día, join temporal, serie de celda, perfiles | implementada |

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
    state "viewerMachine" as VM {
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
            r_shown --> r_steppingNext: STEP +1 (sin vecino local)
            r_shown --> r_steppingPrev: STEP -1 (sin vecino local)
            r_steppingNext --> r_shown: fetchStep → raster (navigate replace) / 404 (atEnd)
            r_steppingPrev --> r_shown: fetchStep → raster (navigate replace) / 404 (atStart)
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
    }
```

**Contexto:** `radars`, `products`, `site`, `product`, `time` (ISO naive; `null` = vista live), `nowT` (instante SSR), `raster`, `rasterError`, `day` (YYYY-MM-DD que la región `timeline` tiene cargado/objetivo), `times`, `timelineError`, `atStart`/`atEnd` (404 ya confirmado en esa dirección — deshabilita el botón), `opacity`, `base`, `cursor`, `cogError`.

| Evento | Región | Efecto |
|---|---|---|
| `ROUTE_CHANGED` | `raster` | guard `sameFrame` (site+product+time sin cambios reales) → asigna contexto + `persistPrefs`; si el `time` solicitado existe en `context.times` (fast-path) → asigna contexto y el `raster` directamente desde la timeline sin hacer fetch; si no → `.loading` (reentrar cancela el fetch en vuelo, resetea `atStart`/`atEnd`) + `persistPrefs` |
| `ROUTE_CHANGED` | `timeline` | guard `sameDay` (site+product+día sin cambios — cubre stepping dentro del día) → nada; si no → `.loading` con el `day` derivado del nuevo `time` |
| `STEP(dir)` | `raster` | vecino local en `context.times` → `navigate` replace directo (sin roundtrip); si no hay vecino y esa dirección ya está confirmada (`atStart`/`atEnd`) → no-op; si no → `.steppingNext`/`.steppingPrev` (llama `/api/rasters/{next,prev}`: éxito navega replace, 404 marca `atStart`/`atEnd` y se queda en el frame actual, sin error visible) |
| `SELECT_TIME(time)` | — | click en un tick de la timeline → `navigate` replace directo |
| `SELECT_DAY` | `timeline` | guard `sameDaySelected` → nada; si no → `.jumping`: al resolver, si el día tiene datos, salta (push) al último `vol_time`; si no, se queda en `empty` sin tocar la URL (nada a lo que saltar) |
| `MOUNTED` | — | guard (time `null` + raster resuelto) → efecto `navigate` replace al `vol_time` (la URL siempre contiene el frame exacto) |
| `SELECT_SITE` / `SELECT_PRODUCT` | — | efecto `navigate` push — la máquina **no** refetchea aquí; el refetch llega por `ROUTE_CHANGED` en cada región (URL manda) |
| `SET_OPACITY` | — | asigna contexto + `persistPrefs` + `syncQuery` (query `?opacity` con replace debounced 300 ms, omitida si es el default 0.8) |
| `CURSOR_MOVE` / `COG_ERROR` | — | asignan contexto |
| `TOGGLE_LAYER(layer)` | — | añade/quita la capa en `context.layers` + `syncOverlayQuery` (replace inmediato de `?layers` — D23; sin debounce, es acción discreta). El cambio solo-query reentra por `ROUTE_CHANGED` y cae en `sameFrame`: el raster no reparpadea |
| `SELECT_PANEL(panel\|null)` | — | asigna `context.panel` + `syncOverlayQuery` (`?panel`) |
| `SELECT_CELL(cellId\|null)` | — | asigna `context.cell` (+ si el panel está cerrado, lo abre en `trend` — el gesto pide ver esa celda) + `syncOverlayQuery` (`?cell`) |

**Corrección de URL generalizada:** cuando `fetchClosest` resuelve, si el `vol_time` devuelto difiere del `time` pedido (vista live, o cualquier instante que no coincide con un vol_time real — p.ej. el `SELECT_DAY` pide "fin de día" implícitamente vía `/api/rasters/day` y salta al último real), se hace `replace`/`push` al `vol_time` exacto. La URL nunca muestra un instante distinto del frame realmente exhibido (puerta M3).

**Assign optimista de `context.time`:** toda acción que navega con un `time` (`STEP`, `SELECT_TIME`, `MOUNTED`, la corrección de mismatch, el éxito de `steppingNext/Prev`/`jumping`) asigna `context.time` en el mismo paso, no solo el efecto `navigate`. `router.replace()`/`push()` resuelve async y el watcher de ruta de la página reacciona un tick después (evento `ROUTE_CHANGED`); sin el assign optimista, un segundo evento disparado de inmediato (doble click, tecla repetida) leería `context.time` desactualizado y calcularía el siguiente salto desde la posición vieja. Reproducido con un e2e de stepping rápido por teclado antes de aplicar el fix — cuando `ROUTE_CHANGED` finalmente llega, `assignRoute` reconfirma el mismo valor (no-op).

**Prefs (`lamula:prefs` en localStorage, nunca el `time` ni el `day`):** toda navegación (`ROUTE_CHANGED`) y todo cambio de opacidad disparan `persistPrefs` con `{site, product, opacity, base}` — así `/` siempre redirige a la última selección real, no a un valor mudo. `composables/useViewerPrefs.ts` valida versión/shape al leer (corrupto o `v` desconocida → `null`, no rompe la redirección).

**Dependencias inyectadas** (`.provide()` en la página; mocks en tests): actores `fetchClosest` (`$fetch` a `/api/rasters/closest`, 404 → `null`), `fetchDay` (`$fetch` a `/api/rasters/day`) y `fetchStep` (`$fetch` a `/api/rasters/{next,prev}`, 404 → `null` — solo se llama al agotar los vecinos locales de `context.times`, es decir al cruzar el día); acciones `navigate` (router push/replace conservando query, `composables/useViewerRoute.ts`), `persistPrefs` (`savePrefs`) y `syncQuery` (replace debounced de `?opacity&base`, ambas en la página).

**Day picker (`components/DayPicker.vue`):** botones de día UTC sobre la ventana de 72h anclada a `radar.last_seen_at` (`utils/time-window.ts::dayWindow72h`, decisión 11) — no wall-clock, así un radar muerto sigue mostrando sus días con datos y las fixtures no se pudren. Click → evento `SELECT_DAY`.

**Timeline strip (`components/TimelineStrip.vue`):** strip proporcional al rango `[times[0], times.at(-1)]` del día cargado; un tick por `vol_time` (click → `SELECT_TIME`), huecos marcados cuando el intervalo excede `max(2×mediana, 10 min)` (`utils/timeline/gaps.ts::computeGaps` — con menos de 3 times no hay señal para una mediana, no se marcan huecos), botones prev/next (→ `STEP`) deshabilitados según `atStart`/`atEnd`. Teclado: `←`/`→` en `window` disparan `STEP`, ignorados con foco en `input`/`select`/`textarea`.

## `overlayMachine`

Overlays de fenómenos + panel VWP (F4, decisiones 24/27). Separada de
`viewerMachine` (patrón `animationMachine`): el vol_time efectivo durante la
animación vive en la página (`times[activeFrameIndex]`), no en `viewerMachine`.
La página la orquesta con watchers — `SET_SCOPE` (site/día), `SET_TIME` (frame
mostrado, animación o estático), `SET_ACTIVE` (toggles parseados de la URL),
`SELECT_CELL` (celda de `?cell`). Arranca con todo `idle` y **sin fetch** en
SSR y cliente por igual (la activación llega por eventos tras el mount) — sin
mismatch de hidratación.

`type: 'parallel'`, cuatro regiones. **Todos los eventos se manejan a nivel de
región** (ninguno en la raíz — la lección del ensombrecido de `viewerMachine`
aplicada por diseño): varias regiones pueden manejar el mismo evento porque en
XState v5 los eventos se difunden a todas las regiones activas. Dos sutilezas
de esa difusión, aprovechadas aquí: (1) los *guards* de todas las regiones se
evalúan contra el snapshot **previo** al micropaso — por eso los guards de
`SET_ACTIVE` leen el payload del evento y no `context.layers/panel` (el assign
corre en `index`); (2) las *acciones* sí se ejecutan en orden de documento
sobre el contexto ya actualizado — por eso el `entry` de `vwp.sync` puede leer
el `volTime` que `frame` asignó en el mismo micropaso.

```mermaid
stateDiagram-v2
    state "overlayMachine" as OM {
        state "index — índices del día (fetchTimes)" as I {
            [*] --> i_idle
            i_idle --> i_loading: SET_ACTIVE con algo activo e índice sin cargar
            i_loading --> i_ready: phen+vwp times (raise INDEX_READY)
            i_loading --> i_error: fetchTimes falla
            i_ready --> i_deciding: SET_SCOPE (limpia todo)
            i_deciding --> i_loading: algo sigue activo
            i_deciding --> i_idle: nada activo
        }
        --
        state "frame — fenómenos del frame mostrado" as F {
            [*] --> f_idle
            f_idle --> f_join: SET_TIME / SET_ACTIVE / INDEX_READY (activo + índice cargado)
            f_join --> f_noData: joined = null (nada ≤ tolerancia)
            f_join --> f_resolved: cache hit por vol_time
            f_join --> f_fetching: volumen casado sin cache
            f_fetching --> f_resolved: fetchPhenomena → filas (cachea)
            f_fetching --> f_error: fetchPhenomena falla
            f_resolved --> f_shown: filas > 0
            f_resolved --> f_noData: volumen sin fenómenos (joined presente)
            f_shown --> f_join: SET_TIME (reentra, last-wins)
            f_noData --> f_join: SET_TIME
            f_shown --> f_idle: SET_ACTIVE sin capas ni panel de celdas / SET_SCOPE
        }
        --
        state "series — tendencia por cell_id" as S {
            [*] --> s_idle
            s_idle --> s_loading: SELECT_CELL(id)
            s_loading --> s_shown: fetchSeries → serie
            s_loading --> s_error: fetchSeries falla
            s_shown --> s_idle: SELECT_CELL(null) / SET_SCOPE
            s_shown --> s_loading: SELECT_CELL(otro id)
        }
        --
        state "vwp — perfiles del día (solo panel=vwp)" as V {
            [*] --> v_idle
            v_idle --> v_sync: SET_ACTIVE panel=vwp / INDEX_READY / SET_TIME
            v_sync --> v_empty: sin perfiles hasta el frame
            v_sync --> v_shown: ventana completa en cache
            v_sync --> v_loading: faltan perfiles
            v_loading --> v_shown: fetchVwp (batch de los que faltan)
            v_loading --> v_error: fetchVwp falla
            v_shown --> v_sync: SET_TIME (recalcula ventana/joined)
            v_shown --> v_idle: SET_ACTIVE panel≠vwp / SET_SCOPE
        }
    }
```

**Contexto:** `site`, `day`, `volTime` (frame mostrado; `SET_SCOPE` lo anula —
el de un scope anterior no vale, la página reemite `SET_TIME`), `layers`,
`panel`, `cellId`, `phenTimes`/`vwpTimes` (índices; `null` = sin cargar),
`joined` (vol_time de fenómenos casado; `null` con estado `noData` distingue
"nada en tolerancia" de "volumen sin fenómenos" — `phenomena: []`),
`phenomena`, `phenCache` (inmutable por vol_time → cache sin invalidación),
`series`, `vwpWindow` (≤12 columnas del día hasta el frame), `vwpJoined`,
`vwpProfiles` (cache por vol_time), errores por región.

| Evento | Regiones que lo manejan | Efecto |
|---|---|---|
| `SET_SCOPE(site, day)` | todas | `index` asigna scope y limpia caches/índices/serie/volTime (única región que asigna); las demás vuelven a `idle`; `index.deciding` recarga si algo sigue activo |
| `SET_TIME(volTime)` | `frame`, `vwp` | `frame` asigna `volTime` y, si está activo con índice cargado, reentra `.join` (last-wins: reentrar cancela el fetch en vuelo); `vwp` recalcula ventana/joined si el panel está abierto |
| `SET_ACTIVE(layers, panel)` | `index`, `frame`, `vwp` | `index` asigna toggles y carga índices si hacen falta; `frame`/`vwp` activan o vuelven a `idle` (guards sobre el payload del evento, ver arriba) |
| `SELECT_CELL(cellId\|null)` | `series` | carga la serie cross-volumen o la limpia |
| `INDEX_READY` (interno, `raise`) | `frame`, `vwp` | resuelve lo que quedó pendiente mientras cargaba el índice |

**Join temporal (D24):** `joined = nearestWithin(phenTimes, volTime, 600 s)`
(`utils/overlay/join.ts`; empate → anterior, la regla de `pickClosest`).
Durante animación la mayoría de frames casan al mismo volumen → cache hit sin
red; los fetch reales son ≤ nº de volúmenes de fenómenos del día. Fuera de
tolerancia el overlay se limpia (`noData`) — nunca celdas de otro momento
presentadas como actuales.

**Dependencias inyectadas:** actores `fetchTimes` (`Promise.all` de
`/api/phenomena/times` + `/api/vwp/times`), `fetchPhenomena`
(`/api/phenomena`), `fetchSeries` (`/api/phenomena/series`), `fetchVwp`
(batch de `/api/vwp` para los vol_times sin cache).

## `frameMachine`

Ciclo de vida de UN frame del pool de animación, spawneado por `animationMachine` (uno por índice, no hay estado duplicado fuera del árbol de actores). El driver real (`utils/map/frame-pool.ts`) es quien decide cuándo un frame está listo — detecta `renderComplete` de su capa WebGL y llama `FRAME_READY`/`FRAME_FAILED` en la máquina padre, que reenvía `READY`/`FAILED` al hijo correspondiente.

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> ready: READY
    pending --> failed: FAILED
    ready --> pending: INVALIDATE
    failed --> pending: INVALIDATE
```

`INVALIDATE` lo envía `animationMachine` en `MOVE_END` a todos los frames salvo el activo (pan/zoom: sus tiles cacheados ya no sirven bajo el nuevo extent, vuelven a prefetchear).

## `animationMachine`

Playback de la serie del día: `idle → buffering → paused ⇄ playing`. Pura — no toca OL ni DOM; el pool real (`utils/map/frame-pool.ts`) decide *cuándo* un frame está listo, esta máquina decide *qué* mostrar y cuándo avanzar. `SET_FRAMES` spawnea un `frameMachine` hijo por índice (ids únicos por generación — evita colisión al reemplazar la serie de un día por la de otro).

```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> buffering: SET_FRAMES
    buffering --> buffering: SET_FRAMES (nueva generación)
    buffering --> paused: frame(index) ready
    buffering --> paused: todos resueltos (ready/failed) — salta a uno ready si hay, si no se queda igual
    paused --> playing: PLAY / TOGGLE
    playing --> playing: FRAME_DELAY (avanza si el siguiente está ready; hold si pending; salta si failed)
    playing --> paused: PAUSE / TOGGLE
    paused --> idle: MOVE_END (invalida los frames inactivos)
    playing --> paused: MOVE_END (pausa + invalida los inactivos)
```

**Contexto:** `frames` (refs a `frameMachine` hijos), `gen` (generación, para ids únicos al respawnear), `index` (frame mostrado), `fps`, `lastFrameDwellMs`.

| Evento | Efecto |
|---|---|
| `SET_FRAMES(count, startIndex?)` | detiene los hijos de la generación anterior, spawnea `count` nuevos, `index = clamp(startIndex ?? 0)` → `.buffering`. **`startIndex` es obligatorio en la práctica**: sin él, el buffer siempre esperaría el frame 0 aunque el viewer ya estuviera mostrando otro — bug real encontrado en el primer e2e de animación (ver más abajo) |
| `FRAME_READY(i)` / `FRAME_FAILED(i, msg)` | reenvía `READY`/`FAILED` al `frameMachine` hijo `i` — válido en cualquier estado |
| `PLAY` / `TOGGLE` (en `paused`) | → `playing` |
| `PAUSE` / `TOGGLE` (en `playing`) | → `paused` |
| `SEEK(i)` | asigna `index` (clamped); manejado en `buffering`/`paused`/`playing` |
| `MOVE_END` | invalida (`INVALIDATE`) todos los hijos salvo el activo → `paused` (no sigue animando sobre un extent que ya no corresponde a los demás frames; el activo se conserva, sin corte visual) |

**Salida de `buffering` sin bloqueo permanente:** el caso feliz es "el frame objetivo (`context.index`) está `ready`". Si ese frame específico *falla* (404 real, no un hueco transitorio), esperar solo por él colgaría la UI para siempre — por eso hay una segunda condición: en cuanto **todos** los hijos terminan de resolver (ninguno sigue `pending`), se sale igual, saltando a un índice `ready` si existe alguno; si absolutamente todos fallaron, se sale sin más (nada que mostrar, degradación vía `rasterError` del pool, no un buffering infinito).

**Avance en `playing` (`nextPlayableIndex`):** un frame `failed` (hueco real) se salta de forma transparente; uno `pending` frena el avance (se reintenta el próximo tick, no se salta — una descarga lenta no se confunde con un hueco permanente). El delay entre frames (`FRAME_DELAY`) es `1000/fps`, salvo en el último índice de la serie, donde usa `lastFrameDwellMs` antes de reiniciar el ciclo.

**Bug real encontrado con e2e (no solo unitario):** el primer intento de `SET_FRAMES` reseteaba `index` a `0` incondicionalmente; la página mandaba un `SEEK` aparte para corregirlo, pero `buffering` no manejaba `SEEK` en ese momento (evento ignorado silenciosamente) — el buffer esperaba el frame equivocado durante ~1 s hasta que el fallback de "todos resueltos" lo rescataba. Fix: `SET_FRAMES` acepta `startIndex` y fija el índice correcto en el mismo paso (además, `buffering` ahora sí maneja `SEEK` por robustez). Ilustra por qué la puerta de animación necesita e2e real, no solo tests de la máquina en aislamiento — el bug era de *integración* (dos eventos separados con una ventana de estado inválida en medio), invisible probando la máquina con un solo evento a la vez.

**Orquestación en la página** (`pages/[site]/[product]/[[time]].vue`): modo estático (F2, `RadarMap` con `:raster`) hasta que el usuario presiona play por primera vez (`animationEngaged`); a partir de ahí `RadarMap` pasa a modo pool (`:frames`) y lo mantiene aun en pausa (el scrubbing reutiliza el mismo pool, sin destruir/recrear capas). Mientras la animación está pausada, `context.time` de `viewerMachine` y `context.index` de `animationMachine` se mantienen sincronizados en ambas direcciones (stepping externo → `SEEK`; `PLAY`/`TOGGLE` al pausar → `SELECT_TIME` con replace) — decisión F3: **durante playback la URL no se toca**, solo al pausar.

## Pool de capas WebGL (`utils/map/frame-pool.ts`)

No es una máquina XState — es el driver imperativo que habla con OpenLayers y alimenta `FRAME_READY`/`FRAME_FAILED`. Verificado contra `node_modules/ol` 10.9.0:

- Una `WebGLTileLayer` + `GeoTIFF` **por frame** (no una sola capa con `setSource()`: eso dispone las texturas cacheadas y produce parpadeo).
- `visible:false` no carga tiles; `opacity:0` sí — el prefetch en segundo plano es una capa `visible:true, opacity:0`; al quedar lista y no ser la activa, se oculta (`visible:false`, cero costo de render).
- N capas con el mismo `className`/zIndex contiguo comparten **un solo contexto WebGL** — sin límite práctico de contextos, y ayuda en CI (SwiftShader pierde contexto con concurrencia).
- "Frame listo" = `layer.getRenderer().renderComplete`, muestreado en el `postrender` del mapa. Es una propiedad **semi-pública** del renderer (no forma parte de la API documentada de ol) — protegida por el canario `tests/unit/render-complete-canary.spec.ts`; si un upgrade de `ol` la renombra o la quita, ese test falla antes que el pool deje de avanzar en silencio. Plan B si se rompe: `rendercomplete` secuencial del mapa (más lento, 100 % API pública).
- Prefetch acotado a `PREFETCH_CONCURRENCY = 3` concurrentes; tope de seguridad `MAX_POOL = 24` frames (memoria) — 20 frames típicos caben sin evicción.
- `invalidateInactive()` (llamado en `moveend` del mapa): el frame activo se conserva; el resto vuelve a `'loading'` y se re-prioriza.

**Limitación conocida de los goldens/fixtures para e2e:** solo el `vol_time` más reciente de cada `(site, product)` tiene un COG golden commiteado (`tests/fixtures/cogs/r2/`) — el resto 404 en el entorno offline de CI. Los e2e de animación (`e2e/animation.spec.ts`) validan que la máquina no se cuelga y el ciclado es correcto ante fallos reales, pero **no** pueden validar el ciclado fluido de múltiples frames reales cargando a la vez; eso es la puerta manual contra datos vivos (`docs/validaciones.md`).
