<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useActor } from '@xstate/vue'
import { fromPromise } from 'xstate'
import type { Phenomenon, RasterMeta, VwpLevel } from '#shared/contract'
import { rasterProductDef } from '#shared/products'
import { savePrefs } from '../../../composables/useViewerPrefs'
import { animationMachine } from '../../../machines/animation'
import { overlayMachine } from '../../../machines/overlay'
import { viewerMachine } from '../../../machines/viewer'
import type { NavigateParams, OverlayQueryParams, PrefsParams } from '../../../machines/viewer'
import { dayWindow72h } from '../../../utils/time-window'
import { computeGaps } from '../../../utils/timeline/gaps'

const DEFAULT_OPACITY = 0.8
const DEFAULT_BASE = 'osm' as const
const QUERY_SYNC_DEBOUNCE_MS = 300

definePageMeta({
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

// query modifiers (opacity/base) con replace debounced — solo si difieren
// del default, para no ensuciar la URL con el estado inicial
let queryTimer: ReturnType<typeof setTimeout> | undefined
function syncQuery(params: { opacity: number, base: 'osm' | 'off' }) {
  clearTimeout(queryTimer)
  queryTimer = setTimeout(() => {
    const query = { ...route.query }
    if (params.opacity === DEFAULT_OPACITY) delete query.opacity
    else query.opacity = String(params.opacity)
    if (params.base === DEFAULT_BASE) delete query.base
    else query.base = params.base
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
    syncQuery: (_, params: { opacity: number, base: 'osm' | 'off' }) => syncQuery(params),
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
onMounted(() => send({ type: 'MOUNTED' }))

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
const timelineTimes = computed(() => ctx.value.times.map(r => r.vol_time))
const timelineGaps = computed(() => computeGaps(timelineTimes.value))
// resaltar el frame realmente mostrado; si aún no resolvió, el time pedido
const timelineCurrent = computed(() => raster.value?.vol_time ?? ctx.value.time)
const currentIdx = computed(() =>
  ctx.value.time !== null ? timelineTimes.value.indexOf(ctx.value.time) : -1,
)
// dentro de los vecinos locales siempre se puede pisar; en el extremo,
// depende de si ya se confirmó (404) que no hay más en esa dirección
const canStepPrev = computed(() => currentIdx.value > 0 || !ctx.value.atStart)
const canStepNext = computed(() =>
  (currentIdx.value !== -1 && currentIdx.value < timelineTimes.value.length - 1) || !ctx.value.atEnd,
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
const { snapshot: animSnapshot, send: animSend } = useActor(animationMachine, {
  input: { fps: 4, lastFrameDwellMs: 1500 },
})
const animationEngaged = ref(false)
const pendingAutoPlay = ref(false)

function currentTimesIndex(): number {
  const idx = ctx.value.times.findIndex(r => r.vol_time === ctx.value.time)
  return idx === -1 ? 0 : idx
}

function engageAnimation() {
  animationEngaged.value = true
  pendingAutoPlay.value = true
  animSend({ type: 'SET_FRAMES', count: ctx.value.times.length, startIndex: currentTimesIndex() })
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
    const t = ctx.value.times[animSnapshot.value.context.index]?.vol_time
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

// cambiar de día con la animación ya activa: reconstruye el pool para el
// nuevo día (pausa implícita — buffering exige el nuevo frame 0)
watch(() => ctx.value.day, () => {
  if (!animationEngaged.value) return
  animSend({ type: 'SET_FRAMES', count: ctx.value.times.length, startIndex: currentTimesIndex() })
})

// stepping/select manuales mientras la animación está pausada: mantener el
// índice de animación sincronizado para que "play" retome desde ahí
watch(() => ctx.value.time, () => {
  if (!animationEngaged.value || animSnapshot.value.matches('playing')) return
  animSend({ type: 'SEEK', index: currentTimesIndex() })
})

const animPlaying = computed(() => animSnapshot.value.matches('playing'))
const animFrames = computed(() => (animationEngaged.value && ctx.value.times.length > 0 ? ctx.value.times : null))
const activeFrameIndex = computed(() => {
  if (ctx.value.times.length === 0) return 0
  return animPlaying.value ? animSnapshot.value.context.index : currentTimesIndex()
})
const animCurrentVolTime = computed(() => ctx.value.times[activeFrameIndex.value]?.vol_time ?? null)
const animBufferReady = computed(() =>
  animSnapshot.value.context.frames.filter(f => f.getSnapshot().matches('ready')).length,
)
const animBufferTotal = computed(() => animSnapshot.value.context.frames.length)

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
    },
  }),
  { input: { site: initialRoute.site, day: dayInitial } },
)
const overlayCtx = computed(() => overlaySnapshot.value.context)

const displayedVolTime = computed(() =>
  animationEngaged.value ? animCurrentVolTime.value : raster.value?.vol_time ?? null,
)

onMounted(() => {
  overlaySend({ type: 'SET_TIME', volTime: displayedVolTime.value })
  overlaySend({ type: 'SET_ACTIVE', layers: ctx.value.layers, panel: ctx.value.panel })
  if (ctx.value.cell !== null) overlaySend({ type: 'SELECT_CELL', cellId: ctx.value.cell })
})
watch([() => ctx.value.site, () => ctx.value.day], ([site, day]) => {
  overlaySend({ type: 'SET_SCOPE', site, day })
})
watch(displayedVolTime, volTime => overlaySend({ type: 'SET_TIME', volTime }))
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

function onToggleLayer(layer: 'cells' | 'meso') {
  send({ type: 'TOGGLE_LAYER', layer })
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
  const unit = productDef.value?.unit ?? ''
  return `${cursor.value?.toFixed(1)} ${unit}`
})

function onSelectSite(event: Event) {
  send({ type: 'SELECT_SITE', site: (event.target as HTMLSelectElement).value })
}
function onSelectProduct(event: Event) {
  send({ type: 'SELECT_PRODUCT', product: Number((event.target as HTMLSelectElement).value) })
}
function onOpacityInput(event: Event) {
  send({ type: 'SET_OPACITY', value: Number((event.target as HTMLInputElement).value) })
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
    </header>

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

        <p
          v-if="!productDef"
          data-testid="product-no-palette"
          class="rounded bg-amber-900/40 p-3 text-sm text-amber-200"
        >
          Producto sin paleta en el catálogo del viewer.
        </p>

        <template v-if="productDef">
          <MapLegend :palette="productDef.palette" />

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

          <p class="text-sm text-slate-400">
            Valor bajo cursor:
            <span data-testid="cursor-value" class="font-mono text-slate-100">
              {{ cursorLabel ?? '—' }}
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
            <dd class="font-mono">{{ raster.vol_time }}Z</dd>
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

        <DayPicker
          v-if="availableDays.length > 0"
          :days="availableDays"
          :model-value="ctx.day"
          @update:model-value="onSelectDay"
        />
        <p
          v-if="timelineFetchError"
          data-testid="timeline-error"
          class="rounded bg-amber-900/40 p-3 text-sm text-amber-200"
        >
          Error consultando la timeline: {{ timelineFetchError }}
        </p>
        <p
          v-else-if="timelineEmpty"
          data-testid="timeline-empty"
          class="rounded bg-slate-800 p-3 text-sm text-slate-400"
        >
          Sin volúmenes este día (UTC).
        </p>
        <TimelineStrip
          v-else-if="timelineReady"
          :times="timelineTimes"
          :current="timelineCurrent"
          :gaps="timelineGaps"
          :can-prev="canStepPrev"
          :can-next="canStepNext"
          @select="onTimelineSelect"
          @step="onTimelineStep"
        />
        <AnimationControls
          :playing="animPlaying"
          :ready="timelineReady"
          :current-vol-time="animCurrentVolTime"
          :buffer-ready="animBufferReady"
          :buffer-total="animBufferTotal"
          @toggle="onToggleAnimation"
        />
      </aside>

      <main class="min-w-0 flex-1">
        <ClientOnly>
          <RadarMap
            v-if="radar"
            :radar="radar"
            :raster="raster"
            :frames="animFrames"
            :active-frame="activeFrameIndex"
            :product-def="productDef"
            :opacity="ctx.opacity"
            :show-base="ctx.base !== 'off'"
            :phenomena="overlayPhenomena"
            :selected-cell="ctx.cell"
            @select-cell="send({ type: 'SELECT_CELL', cellId: $event })"
            @cursor="send({ type: 'CURSOR_MOVE', sample: $event })"
            @raster-error="send({ type: 'COG_ERROR', message: $event })"
            @frame-ready="animSend({ type: 'FRAME_READY', index: $event })"
            @frame-error="(i, message) => animSend({ type: 'FRAME_FAILED', index: i, message })"
            @move-end="animSend({ type: 'MOVE_END' })"
          />
        </ClientOnly>
      </main>
    </div>
  </div>
</template>
