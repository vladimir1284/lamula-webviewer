<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useActor } from '@xstate/vue'
import { fromPromise } from 'xstate'
import type { BaseMapId } from '#shared/basemaps'
import type {
  LightningBucketFile,
  LightningBucketMeta,
  Phenomenon,
  RasterMeta,
  VwpLevel,
  WindGridFile,
  WindGridMeta,
  WindLevel,
} from '#shared/contract'
import { WIND_LEVEL_LABELS, zLightningBucketFile, zWindGridFile } from '#shared/contract'
import { rasterProductDef } from '#shared/products'
import { loadPrefs, PREF_DEFAULTS, savePrefs } from '../../../composables/useViewerPrefs'
import { animationMachine } from '../../../machines/animation'
import { overlayMachine } from '../../../machines/overlay'
import type { OverlayLayerId, PanelId } from '../../../machines/overlay'
import { viewerMachine } from '../../../machines/viewer'
import type { DisplayQueryParams, NavigateParams, OverlayQueryParams, PrefsParams } from '../../../machines/viewer'
import { formatFull, formatFullParts } from '../../../utils/time-display'
import { dayWindow72h } from '../../../utils/time-window'
import { computeGaps } from '../../../utils/timeline/gaps'
import { convertRasterValue } from '../../../utils/units'

const DEFAULT_OPACITY = 0.8
const DEFAULT_BASE = 'osm' as const
const DEFAULT_SAT = false
const DEFAULT_SAT_VARIANT = 'ir' as const
const DEFAULT_SAT_OPACITY = 0.6
const QUERY_SYNC_DEBOUNCE_MS = 300
// tras pausar la animación, espera esto antes de resincronizar overlays
// (fenómenos/VWP) al frame visible — evita fetch por cada frame reproducido
const OVERLAY_RESUME_DELAY_MS = 3000

definePageMeta({
  key: route => route.params.site as string,
  // params malformados → 404 de Nuxt (corre también en SSR). La validez
  // semántica de la fecha (mes 13, hora 25) se resuelve abajo con pathToIso.
  validate(route) {
    const { site, product, time } = route.params
    if (typeof site !== 'string' || !/^[A-Z0-9]{3}$/.test(site)) return false
    if (typeof product !== 'string' || !/^\d+$/.test(product)) return false
    if (typeof time === 'string' && time !== '' && !/^\d{8}T\d{6}$/.test(time)) return false
    return true
  },
})

const route = useRoute()
const prefsDialog = ref<{ open: () => void }>()
const timelineMenu = ref<{ open: () => void }>()
const dataModal = ref<{ open: () => void, close: () => void }>()

const { data: radars, error: radarsError } = await useFetch('/api/radars')
const { data: products } = await useFetch('/api/products')

const initialRoute = parseViewerRoute(route)
if (!initialRoute) {
  throw createError({ statusCode: 404, statusMessage: 'Ruta de viewer inválida' })
}

// Instante "ahora" para la vista live, calculado una vez en SSR (viaja en el
// payload; recalcular en cliente rompería la key del useFetch de abajo).
const nowT = useState('viewer-now', () => new Date().toISOString().slice(0, 19)).value
const tInitial = initialRoute.time ?? nowT

// Closest inicial en SSR: shell + metadata servidos; la máquina posee todo
// el ciclo de vida posterior (este fetch no re-observa nada).
const { data: initialRaster, error: initialRasterError } = await useFetch<RasterMeta>(
  '/api/rasters/closest',
  {
    key: `viewer-closest:${initialRoute.site}:${initialRoute.product}:${tInitial}`,
    query: { site: initialRoute.site, product: initialRoute.product, t: tInitial },
    watch: false,
  },
)

const dayInitial = tInitial.slice(0, 10)
// Timeline inicial en SSR: misma lógica — evita el parpadeo de un loading
// client-only al primer paint.
const { data: initialTimes, error: initialTimesError } = await useFetch<RasterMeta[]>(
  '/api/rasters/day',
  {
    key: `viewer-day:${initialRoute.site}:${initialRoute.product}:${dayInitial}`,
    query: { site: initialRoute.site, product: initialRoute.product, day: dayInitial },
    watch: false,
  },
)

const navigate = useViewerNavigate()
const router = useRouter()

// query modifiers (opacity/base/satélite) con replace debounced — solo si
// difieren del default, para no ensuciar la URL con el estado inicial
let queryTimer: ReturnType<typeof setTimeout> | undefined
function syncQuery(params: DisplayQueryParams) {
  clearTimeout(queryTimer)
  queryTimer = setTimeout(() => {
    const query = { ...route.query }
    if (params.opacity === DEFAULT_OPACITY) delete query.opacity
    else query.opacity = String(params.opacity)
    if (params.base === DEFAULT_BASE) delete query.base
    else query.base = params.base
    if (params.sat === DEFAULT_SAT) delete query.sat
    else query.sat = params.sat ? '1' : '0'
    if (params.satVariant === DEFAULT_SAT_VARIANT) delete query.satVar
    else query.satVar = params.satVariant
    if (params.satOpacity === DEFAULT_SAT_OPACITY) delete query.satOp
    else query.satOp = String(params.satOpacity)
    router.replace({ query })
  }, QUERY_SYNC_DEBOUNCE_MS)
}
onBeforeUnmount(() => clearTimeout(queryTimer))

// toggles de overlays (D23): replace inmediato, sin debounce — acciones
// discretas; ausencia en la query = default off (URLs de F3 intactas)
function syncOverlayQuery(params: OverlayQueryParams) {
  const patch = overlayQueryPatch(params)
  const query = Object.fromEntries(
    Object.entries({ ...route.query, ...patch }).filter(([, v]) => v !== undefined),
  )
  router.replace({ query })
}

const machine = viewerMachine.provide({
  actors: {
    fetchClosest: fromPromise(async ({ input }) => {
      try {
        return await $fetch<RasterMeta>('/api/rasters/closest', {
          query: { site: input.site, product: input.product, t: input.t },
        })
      }
      catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404) return null
        throw err
      }
    }),
    fetchDay: fromPromise(async ({ input }) =>
      $fetch<RasterMeta[]>('/api/rasters/day', {
        query: { site: input.site, product: input.product, day: input.day },
      }),
    ),
    fetchStep: fromPromise(async ({ input }) => {
      try {
        return await $fetch<RasterMeta>(`/api/rasters/${input.mode}`, {
          query: { site: input.site, product: input.product, t: input.t },
        })
      }
      catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404) return null
        throw err
      }
    }),
  },
  actions: {
    navigate: (_, params: NavigateParams) => navigate(params.patch, params.mode),
    persistPrefs: (_, params: PrefsParams) => savePrefs(params),
    syncQuery: (_, params: DisplayQueryParams) => syncQuery(params),
    syncOverlayQuery: (_, params: OverlayQueryParams) => syncOverlayQuery(params),
  },
})

const { snapshot, send } = useActor(machine, {
  input: {
    radars: radars.value ?? [],
    products: products.value ?? [],
    route: initialRoute,
    nowT,
    initialRaster: initialRaster.value ?? null,
    initialError:
      initialRasterError.value && initialRasterError.value.statusCode !== 404
        ? initialRasterError.value.statusMessage ?? initialRasterError.value.message
        : null,
    initialTimes: initialTimes.value ?? [],
    initialTimelineError: initialTimesError.value
      ? initialTimesError.value.statusMessage ?? initialTimesError.value.message
      : null,
  },
})

// URL manda: todo cambio de ruta (selects, stepping, back/forward) entra a
// la máquina como evento; ella decide si refetchear (guard sameFrame).
watch(
  () => route.fullPath,
  () => {
    const parsed = parseViewerRoute(route)
    if (parsed) send({ type: 'ROUTE_CHANGED', route: parsed })
  },
)
onMounted(() => {
  send({ type: 'MOUNTED' })
  // prefs de display (D28): localStorage no existe en SSR — el contexto
  // arranca con placeholders (clock:'utc') y aquí entran los valores reales;
  // sin nada guardado aplican los defaults (clock:'local')
  const prefs = loadPrefs()
  send({
    type: 'PREFS_LOADED',
    prefs: {
      coverage: prefs?.coverage ?? PREF_DEFAULTS.coverage,
      units: prefs?.units ?? PREF_DEFAULTS.units,
      clock: prefs?.clock ?? PREF_DEFAULTS.clock,
      animationFrames: prefs?.animationFrames ?? PREF_DEFAULTS.animationFrames,
      smooth: prefs?.smooth ?? PREF_DEFAULTS.smooth,
      smoothRadius: prefs?.smoothRadius ?? PREF_DEFAULTS.smoothRadius,
      showPalette: prefs?.showPalette ?? PREF_DEFAULTS.showPalette,
    },
  })
})

const ctx = computed(() => snapshot.value.context)

// DataModal (D36): no es parte de la URL en sí, pero se abre/cierra en
// función de ctx.panel (cells|trend|vwp|null) — mismo contrato que el rail
// derecho + el modal VWP de antes, ahora consolidados en un solo modal con
// tabs. El watch cubre clicks en el menú de capas y el cierre (✕/Esc, que
// dispara onDataModalClose → SELECT_PANEL null); onMounted cubre el
// deep-link ?panel=cells|trend|vwp (el watch por sí solo no ve el valor
// inicial). Cambiar de tab CON el modal abierto no pasa por este watch —
// DataModal emite update:panel directo (ver onDataModalUpdatePanel).
onMounted(() => {
  if (ctx.value.panel !== null) dataModal.value?.open()
})
watch(() => ctx.value.panel, (p) => {
  if (p !== null) dataModal.value?.open()
  else dataModal.value?.close()
})
function onDataModalClose() {
  if (ctx.value.panel !== null) send({ type: 'SELECT_PANEL', panel: null })
}
function onDataModalUpdatePanel(panel: PanelId) {
  send({ type: 'SELECT_PANEL', panel })
}
const radar = computed(() => ctx.value.radars.find(r => r.site_id === ctx.value.site) ?? null)
const rasterProducts = computed(() => ctx.value.products.filter(p => p.kind === 'raster'))
const productDef = computed(() => rasterProductDef(ctx.value.product))
const raster = computed(() => (snapshot.value.matches({ raster: 'shown' }) ? ctx.value.raster : null))
const rasterEmpty = computed(() => snapshot.value.matches({ raster: 'empty' }))
const rasterFetchError = computed(() =>
  snapshot.value.matches({ raster: 'error' }) ? ctx.value.rasterError : null,
)

// ventana de 72h anclada a last_seen_at (decisión 11) — no wall-clock: un
// radar muerto sigue mostrando sus días con datos, las fixtures no se pudren
const availableDays = computed(() => (radar.value ? dayWindow72h(radar.value.last_seen_at) : []))
const timelineEmpty = computed(() => snapshot.value.matches({ timeline: 'empty' }))
const timelineFetchError = computed(() =>
  snapshot.value.matches({ timeline: 'error' }) ? ctx.value.timelineError : null,
)

function onSelectDay(day: string) {
  send({ type: 'SELECT_DAY', day })
}

// 'refreshingTick' (poll de en-vivo cada 30s) cuenta como ready: los `times`
// previos siguen siendo válidos mientras se refetchea en silencio — si no,
// la strip se desmonta/remonta en cada tick y parpadea (v-else-if cae al
// medio sin match ni un instante).
const timelineReady = computed(() =>
  snapshot.value.matches({ timeline: 'ready' }) || snapshot.value.matches({ timeline: 'refreshingTick' }),
)
// lista completa del día, solo para gating de step en el extremo (no se renderiza)
const dayTimes = computed(() => ctx.value.times.map(r => r.vol_time))
// la strip renderiza la ventana de animación (animationFrames), no el día entero
const timelineTimes = computed(() => timelineWindowMeta.value.map(r => r.vol_time))
const timelineGaps = computed(() => computeGaps(timelineTimes.value))
// resaltar el frame realmente mostrado; si aún no resolvió, el time pedido
const timelineCurrent = computed(() => raster.value?.vol_time ?? ctx.value.time)
const currentIdx = computed(() =>
  ctx.value.time !== null ? dayTimes.value.indexOf(ctx.value.time) : -1,
)
// dentro de los vecinos locales siempre se puede pisar; en el extremo,
// depende de si ya se confirmó (404) que no hay más en esa dirección
const canStepPrev = computed(() => currentIdx.value > 0 || !ctx.value.atStart)
const canStepNext = computed(() =>
  (currentIdx.value !== -1 && currentIdx.value < dayTimes.value.length - 1) || !ctx.value.atEnd,
)

function onTimelineSelect(time: string) {
  send({ type: 'SELECT_TIME', time })
}
function onTimelineStep(dir: 1 | -1) {
  send({ type: 'STEP', dir })
}

// ── Animación (F3 paso 6) ────────────────────────────────────────────────
// Modo estático (F2, RadarMap con :raster) hasta que el usuario presiona
// play por primera vez; a partir de ahí RadarMap pasa a modo pool
// (:frames) y lo mantiene aun en pausa (scrubbing reutiliza el mismo pool).
const ANIM_BASE_FPS = 2
const { snapshot: animSnapshot, send: animSend } = useActor(animationMachine, {
  input: { fps: ANIM_BASE_FPS, lastFrameDwellMs: 1500 },
})
const animationEngaged = ref(false)

// selector .5x/1x/2x/3x: 1x preserva el ritmo ya afinado del proyecto
// (ANIM_BASE_FPS), el resto escala sobre esa base
const animSpeed = ref(1)
function onSpeedChange(speed: number) {
  animSpeed.value = speed
  animSend({ type: 'SPEED', fps: ANIM_BASE_FPS * speed })
}
const pendingAutoPlay = ref(false)

const windowAnchorIdx = ref<number>(-1)
const windowAnchorR2Key = ref<string | null>(null)

watch(
  () => [ctx.value.times, ctx.value.time, ctx.value.animationFrames] as const,
  ([times, time, maxFrames]) => {
    if (times.length === 0) {
      windowAnchorIdx.value = -1
      windowAnchorR2Key.value = null
      return
    }
    const currentIdx = times.findIndex(r => r.vol_time === time)
    if (currentIdx === -1) return
    
    const anchor = windowAnchorIdx.value
    const startIdx = Math.max(0, anchor - maxFrames + 1)
    
    const sameFrame = anchor >= 0 && anchor < times.length && times[anchor].r2_key === windowAnchorR2Key.value
    
    if (!sameFrame || currentIdx < startIdx || currentIdx > anchor) {
      windowAnchorIdx.value = currentIdx
      windowAnchorR2Key.value = times[currentIdx].r2_key
    }
  },
  { immediate: true }
)

// ventana [anchor-maxFrames+1, anchor] anclada a windowAnchorIdx — la misma
// ventana alimenta tanto la strip (siempre) como el pool de animación (al jugar)
const timelineWindowMeta = computed(() => {
  const times = ctx.value.times
  if (times.length === 0) return []
  const maxFrames = ctx.value.animationFrames
  const anchor = windowAnchorIdx.value === -1 ? 0 : windowAnchorIdx.value
  const startIdx = Math.max(0, anchor - maxFrames + 1)
  return times.slice(startIdx, startIdx + maxFrames)
})

const _rawAnimFrames = computed(() => {
  if (!animationEngaged.value) return null
  return timelineWindowMeta.value.length > 0 ? timelineWindowMeta.value : null
})

const animFrames = ref<RasterMeta[] | null>(null)
watch(_rawAnimFrames, (newFrames) => {
  if (!newFrames) {
    animFrames.value = null
    return
  }
  const oldFrames = animFrames.value
  let shouldUpdate = false
  
  if (!oldFrames) {
    shouldUpdate = true
  } else if (oldFrames.length !== newFrames.length) {
    shouldUpdate = true
  } else if (newFrames.some((f, i) => f.r2_key !== oldFrames[i].r2_key)) {
    shouldUpdate = true
  }
  
  if (shouldUpdate) {
    animFrames.value = newFrames
  }
}, { immediate: true })

const animPlaying = computed(() => animSnapshot.value.matches('playing'))

const activeFrameIndex = computed(() => {
  const frames = animFrames.value
  if (!frames || frames.length === 0) return 0
  
  if (animPlaying.value) {
    return animSnapshot.value.context.index
  }
  
  const idx = frames.findIndex(r => r.vol_time === ctx.value.time)
  return Math.max(0, idx)
})

function engageAnimation() {
  animationEngaged.value = true
  // arrancar una animación apaga el checkbox "en vivo" — el loop de refresco
  // no debe pisar el frame que la animación está reproduciendo
  send({ type: 'SET_LIVE_REFRESH', value: false })
  if (animSnapshot.value.matches('paused')) {
    animSend({ type: 'PLAY' })
  } else {
    pendingAutoPlay.value = true
  }
}

function onToggleAnimation() {
  if (!animationEngaged.value) {
    engageAnimation()
    return
  }
  const wasPlaying = animSnapshot.value.matches('playing')
  animSend({ type: 'TOGGLE' })
  if (wasPlaying) {
    // decisión F3: durante playback la URL no se toca; al pausar, replace
    // con el frame que quedó visible
    const t = animFrames.value?.[animSnapshot.value.context.index]?.vol_time
    if (t) send({ type: 'SELECT_TIME', time: t })
  }
}

// buffering → paused automático (frame 0 objetivo listo): si el usuario
// pidió play, arranca sola en cuanto termina de bufferear
watch(() => animSnapshot.value.value, (state) => {
  if (state === 'paused' && pendingAutoPlay.value) {
    pendingAutoPlay.value = false
    animSend({ type: 'PLAY' })
  }
})

// reconstruye el pool si los frames seleccionados cambian 
watch(() => animFrames.value, (frames) => {
  animSend({ type: 'SET_FRAMES', count: frames?.length ?? 0, startIndex: activeFrameIndex.value })
}, { immediate: true })

// stepping/select manuales mientras la animación está pausada: mantener el
// índice de animación sincronizado para que "play" retome desde ahí
watch(() => ctx.value.time, () => {
  if (!animationEngaged.value || animSnapshot.value.matches('playing')) return
  const idx = animFrames.value?.findIndex(r => r.vol_time === ctx.value.time) ?? 0
  animSend({ type: 'SEEK', index: Math.max(0, idx) })
})

const animCurrentVolTime = computed(() => animFrames.value?.[activeFrameIndex.value]?.vol_time ?? ctx.value.time)
// resalta el frame realmente mostrado en la barra: el de animación mientras
// está enganchada (aunque en pausa — la URL no se toca hasta pausar), si no
// el de timelineCurrent de siempre
const sliderCurrent = computed(() => animationEngaged.value ? animCurrentVolTime.value : timelineCurrent.value)

// ── Overlays de fenómenos + VWP (F4) ─────────────────────────────────────
// overlayMachine arranca idle sin fetch (SSR-safe); la activación llega por
// los watchers post-mount. El vol_time efectivo mostrado es el del pool en
// animación y el del raster resuelto en estático.
const { snapshot: overlaySnapshot, send: overlaySend } = useActor(
  overlayMachine.provide({
    actors: {
      fetchTimes: fromPromise(async ({ input }) => {
        const query = { site: input.site, day: input.day }
        const [phen, vwp] = await Promise.all([
          $fetch<string[]>('/api/phenomena/times', { query }),
          $fetch<string[]>('/api/vwp/times', { query }),
        ])
        return { phen, vwp }
      }),
      fetchPhenomena: fromPromise(async ({ input }) =>
        $fetch<Phenomenon[]>('/api/phenomena', {
          query: { site: input.site, vol_time: input.volTime },
        }),
      ),
      fetchSeries: fromPromise(async ({ input }) =>
        $fetch<Phenomenon[]>('/api/phenomena/series', {
          query: { site: input.site, cell_id: input.cellId },
        }),
      ),
      fetchVwp: fromPromise(async ({ input }) => {
        const entries = await Promise.all(
          input.volTimes.map(async t => [
            t,
            await $fetch<VwpLevel[]>('/api/vwp', { query: { site: input.site, vol_time: t } }),
          ] as const),
        )
        return Object.fromEntries(entries)
      }),
      fetchWindTimes: fromPromise(async ({ input }) =>
        $fetch<WindGridMeta[]>('/api/wind/times', {
          query: { site: input.site, day: input.day, level: input.level },
        }),
      ),
      // JSON u/v directo de R2 (como los COGs) — validado antes de animar
      fetchWindGrid: fromPromise(async ({ input }): Promise<WindGridFile> => {
        const { meta } = input
        if (!meta.wind_url) throw new Error('origen R2 sin configurar (wind_url null)')
        const res = await fetch(meta.wind_url)
        if (!res.ok) throw new Error(`viento ${meta.r2_key}: HTTP ${res.status}`)
        return zWindGridFile.parse(await res.json())
      }),
      fetchLightningTimes: fromPromise(async ({ input }) =>
        $fetch<LightningBucketMeta[]>('/api/lightning/times', {
          query: { site: input.site, day: input.day },
        }),
      ),
      // ficheros de cubo directo de R2 (batch) — validados antes de animar
      fetchLightningBuckets: fromPromise(
        async ({ input }): Promise<Record<string, LightningBucketFile>> => {
          const entries = await Promise.all(
            input.metas.map(async (meta: LightningBucketMeta) => {
              if (!meta.lightning_url) {
                throw new Error('origen R2 sin configurar (lightning_url null)')
              }
              const res = await fetch(meta.lightning_url)
              if (!res.ok) throw new Error(`rayos ${meta.r2_key}: HTTP ${res.status}`)
              return [meta.r2_key!, zLightningBucketFile.parse(await res.json())] as const
            }),
          )
          return Object.fromEntries(entries)
        },
      ),
    },
  }),
  { input: { site: initialRoute.site, day: dayInitial } },
)
const overlayCtx = computed(() => overlaySnapshot.value.context)

const displayedVolTime = computed(() =>
  animationEngaged.value ? animCurrentVolTime.value : raster.value?.vol_time ?? null,
)

// frame anterior del día al mostrado — define la ventana de observación
// del overlay de rayos (D31); null (primer frame / fuera del día cargado)
// → la máquina cae al fallback de 600 s
function prevDayVolTime(volTime: string | null): string | null {
  if (volTime === null) return null
  const idx = dayTimes.value.indexOf(volTime)
  return idx > 0 ? dayTimes.value[idx - 1]! : null
}

onMounted(() => {
  overlaySend({
    type: 'SET_TIME',
    volTime: displayedVolTime.value,
    prevVolTime: prevDayVolTime(displayedVolTime.value),
  })
  overlaySend({
    type: 'SET_ACTIVE',
    layers: ctx.value.layers,
    panel: ctx.value.panel,
    windLevel: ctx.value.windLevel,
  })
  if (ctx.value.cell !== null) overlaySend({ type: 'SELECT_CELL', cellId: ctx.value.cell })
})
watch([() => ctx.value.site, () => ctx.value.day], ([site, day]) => {
  overlaySend({ type: 'SET_SCOPE', site, day })
})
// durante reproducción, overlays (fenómenos/VWP) no siguen cada frame — solo
// el raster anima; al pausar, resincroniza pasados unos segundos (ver
// OVERLAY_RESUME_DELAY_MS)
let overlayResumeTimer: ReturnType<typeof setTimeout> | null = null
watch(displayedVolTime, (volTime) => {
  if (animPlaying.value) return
  overlaySend({ type: 'SET_TIME', volTime, prevVolTime: prevDayVolTime(volTime) })
})
watch(animPlaying, (playing) => {
  if (overlayResumeTimer) {
    clearTimeout(overlayResumeTimer)
    overlayResumeTimer = null
  }
  if (playing) return
  overlayResumeTimer = setTimeout(() => {
    overlayResumeTimer = null
    overlaySend({
      type: 'SET_TIME',
      volTime: displayedVolTime.value,
      prevVolTime: prevDayVolTime(displayedVolTime.value),
    })
  }, OVERLAY_RESUME_DELAY_MS)
})
onBeforeUnmount(() => {
  if (overlayResumeTimer) clearTimeout(overlayResumeTimer)
})
watch(
  [() => ctx.value.layers, () => ctx.value.panel, () => ctx.value.windLevel],
  ([layers, panel, windLevel]) => {
    overlaySend({ type: 'SET_ACTIVE', layers, panel, windLevel })
  },
)
watch(() => ctx.value.cell, cellId => overlaySend({ type: 'SELECT_CELL', cellId }))

// filas del volumen casado, filtradas por capas activas (el mapa no decide)
const overlayPhenomena = computed(() => {
  const rows = overlayCtx.value.phenomena
  if (!rows || ctx.value.layers.length === 0) return null
  const wantCells = ctx.value.layers.includes('cells')
  const wantMeso = ctx.value.layers.includes('meso')
  return rows.filter(p =>
    (p.kind === 'storm_cell' && wantCells) || (p.kind === 'meso' && wantMeso),
  )
})
// el volumen de fenómenos mostrado no es (necesariamente) el del raster
const overlayJoinInfo = computed(() => {
  if (ctx.value.layers.length === 0) return null
  if (overlaySnapshot.value.matches({ frame: 'noData' })) {
    return overlayCtx.value.joined === null
      ? 'Sin datos de celdas cerca de este instante.'
      : 'Sin fenómenos detectados en este volumen.'
  }
  if (overlaySnapshot.value.matches({ frame: 'error' })) {
    return `Error consultando fenómenos: ${overlayCtx.value.frameError}`
  }
  return null
})

// ── Capa de viento (GFS 10 m) ────────────────────────────────────────────
// El grid ya casado lo publica la máquina; null = capa limpia (off/noData).
const windGridShown = computed(() =>
  ctx.value.layers.includes('wind') ? overlayCtx.value.windGrid : null,
)
const windInfo = computed(() => {
  if (!ctx.value.layers.includes('wind')) return null
  const s = overlaySnapshot.value
  if (s.matches({ wind: 'error' })) {
    return `Error cargando viento: ${overlayCtx.value.windError}`
  }
  if (s.matches({ wind: 'noData' })) return 'Sin dato de viento para este frame.'
  const meta = overlayCtx.value.windTimes?.find(
    w => w.valid_time === overlayCtx.value.windJoined,
  )
  if (!meta) return null
  const cycleH = meta.cycle_time.slice(11, 13)
  const validHm = meta.valid_time.slice(11, 16)
  // '10m' es el nivel por defecto (único ingerido en producción) — no se
  // repite en la etiqueta, que ya se lee en el <select> de nivel
  const levelSuffix = meta.level === '10m' ? '' : ` · ${WIND_LEVEL_LABELS[meta.level]}`
  return `GFS ciclo ${cycleH}Z f${String(meta.forecast_hour).padStart(3, '0')} · ${validHm}Z${levelSuffix}`
})

// ── Capa de rayos (GLM) ──────────────────────────────────────────────────
// Los strikes ya normalizados a la ventana del frame los publica la
// máquina; null = capa limpia (off/noData).
const lightningStrikesShown = computed(() =>
  ctx.value.layers.includes('lightning') ? overlayCtx.value.lightningStrikes : null,
)
const lightningInfo = computed(() => {
  if (!ctx.value.layers.includes('lightning')) return null
  const s = overlaySnapshot.value
  if (s.matches({ lightning: 'error' })) {
    return `Error cargando rayos: ${overlayCtx.value.lightningError}`
  }
  if (s.matches({ lightning: 'noData' })) {
    return 'Sin descargas registradas para este frame.'
  }
  const strikes = overlayCtx.value.lightningStrikes
  if (strikes === null) return null
  return strikes.length === 0
    ? 'Sin descargas dentro del intervalo del frame.'
    : `${strikes.length} descargas en el intervalo del frame.`
})

function onToggleLayer(layer: OverlayLayerId) {
  send({ type: 'TOGGLE_LAYER', layer })
}

function onSelectWindLevel(event: Event) {
  send({ type: 'SELECT_WIND_LEVEL', level: (event.target as HTMLSelectElement).value as WindLevel })
}

function onToggleCellTrack(cellId: string, kind: 'past' | 'future') {
  send({ type: 'TOGGLE_CELL_TRACK', cellId, kind })
}

const EDITABLE_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA'])
function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && EDITABLE_TAGS.has(target.tagName)) return
  if (event.key === 'ArrowLeft') onTimelineStep(-1)
  else if (event.key === 'ArrowRight') onTimelineStep(1)
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const cursorLabel = computed(() => {
  const cursor = ctx.value.cursor
  if (!cursor) return null
  if (cursor.rangeFolded) return 'RF'
  if (cursor.level === null) return null
  // leyenda y cursor comparten conversión (D28): mostrar km/h en uno y kt
  // en la otra sería mentir en una de las dos superficies
  const converted = convertRasterValue(cursor.value ?? 0, productDef.value?.unit ?? '', ctx.value.units)
  return `${converted.value.toFixed(1)} ${converted.unit}`
})

const cursorLatLonLabel = computed(() => {
  const cursor = ctx.value.cursor
  if (!cursor) return null
  return `${cursor.lat.toFixed(4)}, ${cursor.lon.toFixed(4)}`
})

const volTimeParts = computed(() =>
  raster.value ? formatFullParts(raster.value.vol_time, ctx.value.clock) : null,
)

// GOES no tiene vol_time propio (WMS en vivo): usa el mismo vol_time del
// raster mostrado — coherente con currentDisplayTime() en RadarMap.vue.
const satTimeLabel = computed(() =>
  ctx.value.sat && !animPlaying.value && raster.value
    ? formatFull(raster.value.vol_time, ctx.value.clock)
    : null,
)

function onSelectSite(event: Event) {
  send({ type: 'SELECT_SITE', site: (event.target as HTMLSelectElement).value })
}
function onSelectProduct(event: Event) {
  send({ type: 'SELECT_PRODUCT', product: Number((event.target as HTMLSelectElement).value) })
}
function onOpacityInput(event: Event) {
  send({ type: 'SET_OPACITY', value: Number((event.target as HTMLInputElement).value) })
}
function onSelectBase(event: Event) {
  send({ type: 'SELECT_BASE', base: (event.target as HTMLSelectElement).value as BaseMapId })
}
function onToggleSmooth(event: Event) {
  send({ type: 'SET_PREF', patch: { smooth: (event.target as HTMLInputElement).checked } })
}
function onSelectSmoothRadius(event: Event) {
  send({ type: 'SET_PREF', patch: { smoothRadius: Number((event.target as HTMLSelectElement).value) as 1 | 2 | 4 | 8 } })
}
function onToggleShowPalette(event: Event) {
  send({ type: 'SET_PREF', patch: { showPalette: (event.target as HTMLInputElement).checked } })
}
function onToggleSatellite() {
  send({ type: 'TOGGLE_SATELLITE' })
}
function onSelectSatVariant(event: Event) {
  send({ type: 'SELECT_SAT_VARIANT', variant: (event.target as HTMLSelectElement).value as 'vis' | 'ir' })
}
function onSatOpacityInput(event: Event) {
  send({ type: 'SET_SAT_OPACITY', value: Number((event.target as HTMLInputElement).value) })
}
</script>

<template>
  <div class="relative flex h-screen w-screen overflow-hidden bg-slate-900 text-slate-100">
    <div class="relative min-w-0 flex-1 overflow-hidden">
      <PrefsDialog
        ref="prefsDialog"
        :coverage="ctx.coverage"
        :units="ctx.units"
        :clock="ctx.clock"
        @set-pref="send({ type: 'SET_PREF', patch: $event })"
      />

      <TimelineMenu
        ref="timelineMenu"
        :animation-frames="ctx.animationFrames"
        :speed="animSpeed"
        @set-pref="send({ type: 'SET_PREF', patch: $event })"
        @speed="onSpeedChange"
      />

      <DataModal
        ref="dataModal"
        :panel="ctx.panel"
        :phenomena="overlayCtx.phenomena"
        :joined="overlayCtx.joined"
        :selected-cell="ctx.cell"
        :past-cell-ids="ctx.pastCells"
        :future-cell-ids="ctx.futureCells"
        :series="overlayCtx.series"
        :series-error="overlayCtx.seriesError"
        :vwp-profiles="overlayCtx.vwpProfiles"
        :vwp-window="overlayCtx.vwpWindow"
        :vwp-joined="overlayCtx.vwpJoined"
        :vwp-error="overlayCtx.vwpError"
        :vwp-empty="overlaySnapshot.matches({ vwp: 'empty' })"
        :units="ctx.units"
        :clock="ctx.clock"
        @close="onDataModalClose"
        @update:panel="onDataModalUpdatePanel"
        @select-cell="send({ type: 'SELECT_CELL', cellId: $event })"
        @toggle-past-track="onToggleCellTrack($event, 'past')"
        @toggle-future-track="onToggleCellTrack($event, 'future')"
      />

      <ClientOnly>
        <RadarMap
          v-if="radar"
          :radar="radar"
          :raster="raster"
          :frames="animFrames"
          :active-frame="activeFrameIndex"
          :anim-playing="animPlaying"
          :product-def="productDef"
          :opacity="ctx.opacity"
          :base-map="ctx.base"
          :show-coverage="ctx.coverage"
          :phenomena="overlayPhenomena"
          :selected-cell="ctx.cell"
          :show-past-all="ctx.layers.includes('trackPast')"
          :show-future-all="ctx.layers.includes('trackFuture')"
          :past-cell-ids="ctx.pastCells"
          :future-cell-ids="ctx.futureCells"
          :sat-enabled="ctx.sat"
          :sat-variant="ctx.satVariant"
          :sat-opacity="ctx.satOpacity"
          :wind-grid="windGridShown"
          :lightning-strikes="lightningStrikesShown"
          :smooth="ctx.smooth"
          :smooth-radius="ctx.smoothRadius"
          @select-cell="send({ type: 'SELECT_CELL', cellId: $event })"
          @cursor="send({ type: 'CURSOR_MOVE', sample: $event })"
          @raster-error="send({ type: 'COG_ERROR', message: $event })"
          @frame-ready="animSend({ type: 'FRAME_READY', index: $event })"
          @frame-error="(i, message) => animSend({ type: 'FRAME_FAILED', index: i, message })"
          @move-end="animSend({ type: 'MOVE_END' })"
        />
      </ClientOnly>

      <!-- marca centrada arriba: tab trapezoidal que sale del borde superior
           (reemplaza el ícono que vivía dentro de RadarProductChip) -->
      <div class="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center">
        <div
          class="pointer-events-auto flex h-11 w-72 items-center justify-center gap-2 bg-gradient-to-b from-slate-950/80 to-slate-700/80 px-6 shadow-lg ring-1 ring-inset ring-white/10"
          style="clip-path: path('M0,0 L288,0 L257.06,32.42 Q246,44 230,44 L58,44 Q42,44 30.94,32.42 Z')"
        >
          <AppLogo :size="24" class="shrink-0 text-teal-400" />
          <span class="text-sm font-bold tracking-wide text-slate-100">LAMULA<sup class="text-[0.6em]">™</sup> WebViewer</span>
        </div>
      </div>

      <!-- identidad + estado del raster activo (D36): reemplaza el header fijo
           + el primer bloque del aside izquierdo -->
      <RadarProductChip
        :radars="ctx.radars"
        :site="ctx.site"
        :raster-products="rasterProducts"
        :product="ctx.product"
        :product-def="productDef"
        :radar="radar"
        :radars-error="radarsError"
        :raster-fetch-error="rasterFetchError"
        :raster-empty="rasterEmpty"
        :raster="raster"
        :vol-time-parts="volTimeParts"
        :cog-error="ctx.cogError"
        :cursor-label="cursorLabel"
        :cursor-lat-lon-label="cursorLatLonLabel"
        :show-palette="ctx.showPalette"
        :units="ctx.units"
        @select-site="onSelectSite"
        @select-product="onSelectProduct"
      />

      <!-- barra de tiempo flotante (estilo nowCOAST): sin panel contenedor,
           directamente sobre el mapa. La leyenda (D36) se mudó al chip de
           radar/producto, debajo de lat/lon (checkbox "Mostrar paleta de
           colores" en LayersMenu) — la esquina inferior derecha queda libre
           siempre, el timebar ya no reserva espacio para ella. -->
      <div
        class="pointer-events-none absolute bottom-6 left-4 right-4 z-10 md:left-8 md:right-8"
      >
        <div class="pointer-events-auto">
          <p
            v-if="timelineFetchError"
            data-testid="timeline-error"
            class="rounded bg-amber-900/80 p-3 text-sm text-amber-200 shadow"
          >
            Error consultando la timeline: {{ timelineFetchError }}
          </p>
          <p
            v-else-if="timelineEmpty"
            data-testid="timeline-empty"
            class="rounded bg-slate-800/80 p-3 text-sm text-slate-400 shadow"
          >
            Sin volúmenes este día (UTC).
          </p>
          <TimelineStrip
            v-else-if="timelineReady"
            :times="timelineTimes"
            :current="sliderCurrent"
            :gaps="timelineGaps"
            :can-prev="canStepPrev"
            :can-next="canStepNext"
            :clock="ctx.clock"
            :playing="animPlaying"
            :live-refresh="ctx.liveRefresh"
            @select="onTimelineSelect"
            @step="onTimelineStep"
            @toggle="onToggleAnimation"
            @set-live-refresh="value => send({ type: 'SET_LIVE_REFRESH', value })"
            @menu="timelineMenu?.open()"
          />
        </div>
      </div>
    </div>

    <!-- menú de capas (D36) + panel acoplado a la derecha (D37): en md+ el
         panel es un hermano flex real (no overlay) que empuja el mapa a la
         izquierda achicando el wrapper .flex-1 de arriba — RadarMap ya
         resuelve el resize con su ResizeObserver (ver RadarMap.vue). En
         mobile sigue siendo overlay full-screen (sin lugar para correr el
         mapa en una pantalla angosta). -->
    <LayersMenu
      :base="ctx.base"
      :has-palette="!!productDef"
      :opacity="ctx.opacity"
      :smooth="ctx.smooth"
      :smooth-radius="ctx.smoothRadius"
      :show-palette="ctx.showPalette"
      :animation-engaged="animationEngaged"
      :sat="ctx.sat"
      :sat-variant="ctx.satVariant"
      :sat-opacity="ctx.satOpacity"
      :sat-time-label="satTimeLabel"
      :layers="ctx.layers"
      :wind-level="ctx.windLevel"
      :wind-info="windInfo"
      :lightning-info="lightningInfo"
      :overlay-join-info="overlayJoinInfo"
      :available-days="availableDays"
      :day="ctx.day"
      @select-base="onSelectBase"
      @opacity-input="onOpacityInput"
      @toggle-smooth="onToggleSmooth"
      @select-smooth-radius="onSelectSmoothRadius"
      @toggle-show-palette="onToggleShowPalette"
      @toggle-satellite="onToggleSatellite"
      @select-sat-variant="onSelectSatVariant"
      @sat-opacity-input="onSatOpacityInput"
      @toggle-layer="onToggleLayer"
      @select-wind-level="onSelectWindLevel"
      @select-day="onSelectDay"
      @open-panel="send({ type: 'SELECT_PANEL', panel: $event })"
      @open-prefs="prefsDialog?.open()"
    />
  </div>
</template>
