<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useActor } from '@xstate/vue'
import { fromPromise } from 'xstate'
import type { BaseMapId } from '#shared/basemaps'
import { BASE_MAP_IDS, BASE_MAP_LABELS } from '#shared/basemaps'
import type {
  LightningBucketFile,
  LightningBucketMeta,
  Phenomenon,
  RasterMeta,
  VwpLevel,
  WindGridFile,
  WindGridMeta,
} from '#shared/contract'
import { zLightningBucketFile, zWindGridFile } from '#shared/contract'
import { rasterProductDef } from '#shared/products'
import { loadPrefs, PREF_DEFAULTS, savePrefs } from '../../../composables/useViewerPrefs'
import { animationMachine } from '../../../machines/animation'
import { overlayMachine } from '../../../machines/overlay'
import type { OverlayLayerId } from '../../../machines/overlay'
import { viewerMachine } from '../../../machines/viewer'
import type { DisplayQueryParams, NavigateParams, OverlayQueryParams, PrefsParams } from '../../../machines/viewer'
import { formatFull } from '../../../utils/time-display'
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
    },
  })
})

const ctx = computed(() => snapshot.value.context)
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

const timelineReady = computed(() => snapshot.value.matches({ timeline: 'ready' }))
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
          query: { site: input.site, day: input.day },
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
  overlaySend({ type: 'SET_ACTIVE', layers: ctx.value.layers, panel: ctx.value.panel })
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
watch([() => ctx.value.layers, () => ctx.value.panel], ([layers, panel]) => {
  overlaySend({ type: 'SET_ACTIVE', layers, panel })
})
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
  return `GFS ciclo ${cycleH}Z f${String(meta.forecast_hour).padStart(3, '0')} · ${validHm}Z`
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

const volTimeLabel = computed(() =>
  raster.value ? formatFull(raster.value.vol_time, ctx.value.clock) : null,
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
  <div class="flex h-screen flex-col bg-slate-900 text-slate-100">
    <header class="flex items-baseline gap-4 border-b border-slate-700 px-4 py-2">
      <h1 class="text-lg font-bold">LAMULA WebViewer</h1>
      <p v-if="radar" class="text-sm text-slate-400">
        <span class="font-mono">{{ radar.icao ?? radar.site_id }}</span>
        <FreshnessBadge :last-seen-at="radar.last_seen_at" class="ml-2" />
      </p>
      <!-- leading-none + sin padding vertical: no debe crecer el header — el
           mapa se encogería y los goldens comparan su render píxel a píxel -->
      <button
        data-testid="prefs-open"
        aria-label="Preferencias"
        class="ml-auto self-center rounded px-2 leading-none text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        @click="prefsDialog?.open()"
      >
        ⚙
      </button>
    </header>

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

    <div class="flex min-h-0 flex-1">
      <aside class="w-80 shrink-0 space-y-4 overflow-y-auto border-r border-slate-700 p-4">
        <p
          v-if="radarsError"
          data-testid="radars-error"
          class="rounded bg-amber-900/40 p-3 text-sm text-amber-200"
        >
          D1 no disponible: {{ radarsError.statusMessage ?? radarsError.message }}
        </p>

        <label class="block text-sm">
          <span class="mb-1 block text-slate-400">Radar</span>
          <select
            :value="ctx.site"
            data-testid="radar-select"
            class="w-full rounded border border-slate-600 bg-slate-800 p-2"
            @change="onSelectSite"
          >
            <option v-for="r in ctx.radars" :key="r.site_id" :value="r.site_id">
              {{ r.icao ?? r.site_id }}
            </option>
          </select>
        </label>

        <label class="block text-sm">
          <span class="mb-1 block text-slate-400">Producto</span>
          <select
            :value="String(ctx.product)"
            data-testid="product-select"
            class="w-full rounded border border-slate-600 bg-slate-800 p-2"
            @change="onSelectProduct"
          >
            <option v-for="p in rasterProducts" :key="p.code" :value="String(p.code)">
              {{ rasterProductDef(p.code)?.name ?? p.mnemonic }} ({{ p.mnemonic }})
            </option>
          </select>
        </label>

        <label class="block text-sm">
          <span class="mb-1 block text-slate-400">Mapa base</span>
          <!-- sin opción 'off': apagar la base es cosa de e2e/goldens (?base=off),
               no una elección de usuario; con base=off el select muestra el default -->
          <select
            :value="ctx.base === 'off' ? 'osm' : ctx.base"
            data-testid="base-select"
            class="w-full rounded border border-slate-600 bg-slate-800 p-2"
            @change="onSelectBase"
          >
            <option v-for="id in BASE_MAP_IDS" :key="id" :value="id">
              {{ BASE_MAP_LABELS[id] }}
            </option>
          </select>
        </label>

        <p
          v-if="!productDef"
          data-testid="product-no-palette"
          class="rounded bg-amber-900/40 p-3 text-sm text-amber-200"
        >
          Producto sin paleta en el catálogo del viewer.
        </p>

        <template v-if="productDef">
          <MapLegend :palette="productDef.palette" :units="ctx.units" />

          <label class="block text-sm">
            <span class="mb-1 block text-slate-400">Opacidad</span>
            <input
              :value="ctx.opacity"
              data-testid="opacity-slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              class="w-full"
              @input="onOpacityInput"
            >
          </label>

          <label class="flex items-center gap-2 text-sm" :class="{ 'opacity-50': animationEngaged }">
            <input
              type="checkbox"
              data-testid="smooth-toggle"
              :checked="ctx.smooth"
              :disabled="animationEngaged"
              @change="onToggleSmooth"
            >
            <span>Suavizar celdas del raster</span>
          </label>

          <label
            v-if="ctx.smooth"
            class="block text-sm"
            :class="{ 'opacity-50': animationEngaged }"
          >
            <span class="mb-1 block text-slate-400">Radio de suavizado</span>
            <select
              data-testid="smooth-radius-select"
              :value="ctx.smoothRadius"
              :disabled="animationEngaged"
              class="w-full rounded bg-slate-800 text-slate-100"
              @change="onSelectSmoothRadius"
            >
              <option value="1">1× (sin remuestreo)</option>
              <option value="2">2×</option>
              <option value="4">4×</option>
              <option value="8">8×</option>
            </select>
          </label>

          <p v-if="animationEngaged" class="text-xs text-slate-400">
            No disponible durante la animación.
          </p>

          <p class="text-sm text-slate-400">
            Valor bajo cursor:
            <span data-testid="cursor-value" class="font-mono text-slate-100">
              {{ cursorLabel ?? '—' }}
            </span>
          </p>

          <p class="text-sm text-slate-400">
            Lat/lon bajo cursor:
            <span data-testid="cursor-latlon" class="font-mono text-slate-100">
              {{ cursorLatLonLabel ?? '—' }}
            </span>
          </p>
        </template>

        <p
          v-if="rasterFetchError"
          data-testid="raster-error"
          class="rounded bg-amber-900/40 p-3 text-sm text-amber-200"
        >
          Error consultando rasters: {{ rasterFetchError }}
        </p>
        <p
          v-else-if="rasterEmpty"
          data-testid="raster-empty"
          class="rounded bg-slate-800 p-3 text-sm text-slate-400"
        >
          Sin raster para esta selección.
        </p>
        <dl
          v-else-if="raster"
          data-testid="raster-meta"
          class="space-y-1 rounded bg-slate-800 p-3 text-sm"
        >
          <div class="flex justify-between">
            <dt class="text-slate-400">Volumen</dt>
            <dd class="font-mono">{{ volTimeLabel }}</dd>
          </div>
          <div v-if="raster.vcp != null" class="flex justify-between">
            <dt class="text-slate-400">VCP</dt>
            <dd class="font-mono">{{ raster.vcp }}</dd>
          </div>
          <div v-if="raster.el_angle != null" class="flex justify-between">
            <dt class="text-slate-400">Elevación</dt>
            <dd class="font-mono">{{ raster.el_angle }}°</dd>
          </div>
        </dl>

        <!-- fallo de carga del COG: aviso aparte, no oculta la metadata -->
        <p
          v-if="ctx.cogError"
          data-testid="cog-error"
          class="rounded bg-amber-900/40 p-3 text-sm text-amber-200"
        >
          {{ ctx.cogError }}
        </p>

        <fieldset class="rounded bg-slate-800 p-3 text-sm">
          <legend class="px-1 text-slate-400">Satélite</legend>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="sat-toggle"
              :checked="ctx.sat"
              @change="onToggleSatellite"
            >
            <span>Mostrar capa GOES</span>
          </label>
          <template v-if="ctx.sat">
            <label class="mt-2 block">
              <span class="mb-1 block text-slate-400">Variante</span>
              <select
                :value="ctx.satVariant"
                data-testid="sat-variant-select"
                class="w-full rounded border border-slate-600 bg-slate-800 p-2"
                @change="onSelectSatVariant"
              >
                <option value="ir">Infrarrojo</option>
                <option value="vis">Visible</option>
              </select>
            </label>
            <label class="mt-2 block">
              <span class="mb-1 block text-slate-400">Opacidad</span>
              <input
                :value="ctx.satOpacity"
                data-testid="sat-opacity-slider"
                type="range"
                min="0"
                max="1"
                step="0.05"
                class="w-full"
                @input="onSatOpacityInput"
              >
            </label>
            <p class="mt-1 text-xs text-slate-400">
              No se muestra durante la animación.
            </p>
          </template>
        </fieldset>

        <fieldset class="rounded bg-slate-800 p-3 text-sm">
          <legend class="px-1 text-slate-400">Fenómenos</legend>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="layer-toggle-cells"
              :checked="ctx.layers.includes('cells')"
              @change="onToggleLayer('cells')"
            >
            <span>Celdas de tormenta</span>
          </label>
          <template v-if="ctx.layers.includes('cells')">
            <label class="mt-1 flex items-center gap-2 pl-4">
              <input
                type="checkbox"
                data-testid="layer-toggle-track-past"
                :checked="ctx.layers.includes('trackPast')"
                @change="onToggleLayer('trackPast')"
              >
              <span>Trayectoria pasada (todas)</span>
            </label>
            <label class="mt-1 flex items-center gap-2 pl-4">
              <input
                type="checkbox"
                data-testid="layer-toggle-track-future"
                :checked="ctx.layers.includes('trackFuture')"
                @change="onToggleLayer('trackFuture')"
              >
              <span>Trayectoria futura (todas)</span>
            </label>
          </template>
          <label class="mt-1 flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="layer-toggle-meso"
              :checked="ctx.layers.includes('meso')"
              @change="onToggleLayer('meso')"
            >
            <span>Mesociclones / TVS</span>
          </label>
          <p
            v-if="overlayJoinInfo"
            data-testid="overlay-info"
            class="mt-2 text-xs text-slate-400"
          >
            {{ overlayJoinInfo }}
          </p>
        </fieldset>

        <fieldset class="rounded bg-slate-800 p-3 text-sm">
          <legend class="px-1 text-slate-400">Viento</legend>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="layer-toggle-wind"
              :checked="ctx.layers.includes('wind')"
              @change="onToggleLayer('wind')"
            >
            <span>Viento en superficie (10 m)</span>
          </label>
          <p
            v-if="windInfo"
            data-testid="wind-info"
            class="mt-2 text-xs text-slate-400"
          >
            {{ windInfo }}
          </p>
          <p
            v-if="ctx.layers.includes('wind')"
            class="mt-1 text-xs text-slate-400"
          >
            No se muestra durante la animación.
          </p>
        </fieldset>

        <fieldset class="rounded bg-slate-800 p-3 text-sm">
          <legend class="px-1 text-slate-400">Rayos</legend>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="layer-toggle-lightning"
              :checked="ctx.layers.includes('lightning')"
              @change="onToggleLayer('lightning')"
            >
            <span>Descargas eléctricas</span>
          </label>
          <p
            v-if="lightningInfo"
            data-testid="lightning-info"
            class="mt-2 text-xs text-slate-400"
          >
            {{ lightningInfo }}
          </p>
          <p
            v-if="ctx.layers.includes('lightning')"
            class="mt-1 text-xs text-slate-400"
          >
            No se muestra durante la animación.
          </p>
        </fieldset>

        <DayPicker
          v-if="availableDays.length > 0"
          :days="availableDays"
          :model-value="ctx.day"
          @update:model-value="onSelectDay"
        />
      </aside>

      <main class="relative min-w-0 flex-1">
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

        <!-- barra de tiempo flotante (estilo nowCOAST): sin panel contenedor,
             directamente sobre el mapa — decisión explícita de la maqueta -->
        <div class="pointer-events-none absolute inset-x-0 bottom-6 px-8">
          <div class="pointer-events-auto mx-auto max-w-4xl">
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
              :speed="animSpeed"
              @select="onTimelineSelect"
              @step="onTimelineStep"
              @toggle="onToggleAnimation"
              @speed="onSpeedChange"
              @refresh="send({ type: 'REFRESH_TIMELINE' })"
              @menu="timelineMenu?.open()"
            />
          </div>
        </div>
      </main>

      <SidePanel :panel="ctx.panel" @select="send({ type: 'SELECT_PANEL', panel: $event })">
        <template #cells>
          <CellTable
            :phenomena="overlayCtx.phenomena"
            :joined="overlayCtx.joined"
            :selected-cell="ctx.cell"
            :past-cell-ids="ctx.pastCells"
            :future-cell-ids="ctx.futureCells"
            :units="ctx.units"
            @select="send({ type: 'SELECT_CELL', cellId: $event })"
            @toggle-past-track="onToggleCellTrack($event, 'past')"
            @toggle-future-track="onToggleCellTrack($event, 'future')"
          />
        </template>
        <template #trend>
          <TrendChart
            :series="overlayCtx.series"
            :cell-id="ctx.cell"
            :error="overlayCtx.seriesError"
            :units="ctx.units"
            :clock="ctx.clock"
          />
        </template>
        <template #vwp>
          <VwpPanel
            :profiles="overlayCtx.vwpProfiles"
            :window="overlayCtx.vwpWindow"
            :joined="overlayCtx.vwpJoined"
            :error="overlayCtx.vwpError"
            :empty="overlaySnapshot.matches({ vwp: 'empty' })"
            :units="ctx.units"
            :clock="ctx.clock"
          />
        </template>
      </SidePanel>
    </div>
  </div>
</template>
