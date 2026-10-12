<script setup lang="ts">
// Vista de mosaico multi-radar (D43/P4) — hermana reducida de
// pages/[site]/[product]/[[time]].vue: mismo patrón SSR + XState + URL
// manda, pero SIN VWP/viento/rayos/anotaciones/export/feedback (alcance
// recortado, ver machines/mosaic-viewer.ts) y SIN animación aún (geometría
// por fila, ver MosaicMap.vue).
//
// D48: la vista usa los MISMOS componentes de chrome que el viewer de un
// solo radar — misma cinta de marca, mismo LayersMenu (`variant="mosaic"`,
// que oculta lo que no existe acá), mismo PrefsDialog, misma ventana de
// timeline de `animationFrames` muestras. Lo único propio es el chip de
// dominio y el overlay de cobertura.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useActor } from '@xstate/vue'
import { fromPromise } from 'xstate'
import type { BaseMapId } from '#shared/basemaps'
import type { OverlayLayerId } from '../../../../machines/overlay'
import type {
  LightningBucketFile,
  LightningBucketMeta,
  MosaicRasterMeta,
  Phenomenon,
  WindGridFile,
  WindGridMeta,
  WindLevel,
} from '#shared/contract'
import { zLightningBucketFile, zWindGridFile } from '#shared/contract'
import { rasterProductDef } from '#shared/products'
import { mosaicLayersQueryPatch, mosaicQueryPatch, parseMosaicRoute, useMosaicNavigate } from '../../../../composables/useMosaicRoute'
import { loadPrefs, PREF_DEFAULTS, savePrefs } from '../../../../composables/useViewerPrefs'
import { mosaicViewerMachine } from '../../../../machines/mosaic-viewer'
import type {
  MosaicDisplayQueryParams,
  MosaicLayersQueryParams,
  MosaicNavigateParams,
  MosaicPrefsParams,
} from '../../../../machines/mosaic-viewer'
import type { CoverageSite } from '../../../../utils/map/coverage-rings-layer'
import { nearestWithin, WIND_JOIN_TOLERANCE_S } from '../../../../utils/overlay/join'
import {
  bucketsInWindow,
  dedupeStrikes,
  observationWindow,
  strikesInWindow,
} from '../../../../utils/overlay/lightning-join'
import { mergeWindGrids } from '../../../../utils/wind/grid'
import { formatFull, formatFullParts } from '../../../../utils/time-display'
import { dayWindow72h } from '../../../../utils/time-window'
import { computeGaps } from '../../../../utils/timeline/gaps'
import { convertRasterValue } from '../../../../utils/units'

const QUERY_SYNC_DEBOUNCE_MS = 300

definePageMeta({
  key: route => route.params.domain as string,
  validate(route) {
    const { domain, product, time } = route.params
    if (typeof domain !== 'string' || !/^[A-Z0-9]{2,12}$/.test(domain)) return false
    if (typeof product !== 'string' || !/^\d+$/.test(product)) return false
    if (typeof time === 'string' && time !== '' && !/^\d{8}T\d{6}$/.test(time)) return false
    return true
  },
})

const route = useRoute()
// sin export en esta vista todavía (P4 no lo incluye) — la ref solo existe
// porque el template la asigna a MosaicMap vía `ref="radarMap"`
const radarMap = ref(null)
const prefsDialog = ref<{ open: () => void }>()
const timelineMenu = ref<{ open: () => void }>()

const { data: domains, error: domainsError } = await useFetch('/api/mosaic/domains')
const { data: products } = await useFetch('/api/products')
const { data: radars } = await useFetch('/api/radars')

const initialRoute = parseMosaicRoute(route)
if (!initialRoute) {
  throw createError({ statusCode: 404, statusMessage: 'Ruta de mosaico inválida' })
}

const nowT = useState('mosaic-now', () => new Date().toISOString().slice(0, 19)).value
const tInitial = initialRoute.time ?? nowT

const { data: initialRaster, error: initialRasterError } = await useFetch<MosaicRasterMeta>(
  '/api/mosaic/rasters/closest',
  {
    key: `mosaic-closest:${initialRoute.domain}:${initialRoute.product}:${tInitial}`,
    query: { domain: initialRoute.domain, product: initialRoute.product, t: tInitial },
    watch: false,
  },
)

const dayInitial = tInitial.slice(0, 10)
const { data: initialTimes, error: initialTimesError } = await useFetch<MosaicRasterMeta[]>(
  '/api/mosaic/rasters/day',
  {
    key: `mosaic-day:${initialRoute.domain}:${initialRoute.product}:${dayInitial}`,
    query: { domain: initialRoute.domain, product: initialRoute.product, day: dayInitial },
    watch: false,
  },
)

const navigate = useMosaicNavigate()
const router = useRouter()

let queryTimer: ReturnType<typeof setTimeout> | undefined
function syncQuery(params: MosaicDisplayQueryParams) {
  clearTimeout(queryTimer)
  queryTimer = setTimeout(() => {
    const query = { ...route.query, ...mosaicQueryPatch(params) }
    router.replace({ query: Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined)) })
  }, QUERY_SYNC_DEBOUNCE_MS)
}
onBeforeUnmount(() => clearTimeout(queryTimer))

// selección de celda (P5/D45): replace inmediato, sin debounce — igual que
// SELECT_CELL en el viewer de un solo radar (D23), un click no debe sentirse
// con latencia de slider
function syncCellQuery(params: { cellId: string | null }) {
  const query = { ...route.query, cell: params.cellId ?? undefined }
  router.replace({ query: Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined)) })
}

// toggles de capa (D23): replace inmediato, sin debounce — igual que
// syncOverlayQuery en el viewer de un solo radar
function syncLayersQuery(params: MosaicLayersQueryParams) {
  const query = { ...route.query, ...mosaicLayersQueryPatch(params) }
  router.replace({ query: Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined)) })
}

const machine = mosaicViewerMachine.provide({
  actors: {
    fetchClosest: fromPromise(async ({ input }) => {
      try {
        return await $fetch<MosaicRasterMeta>('/api/mosaic/rasters/closest', {
          query: { domain: input.domain, product: input.product, t: input.t },
        })
      }
      catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404) return null
        throw err
      }
    }),
    fetchDay: fromPromise(async ({ input }) =>
      $fetch<MosaicRasterMeta[]>('/api/mosaic/rasters/day', {
        query: { domain: input.domain, product: input.product, day: input.day },
      }),
    ),
    fetchStep: fromPromise(async ({ input }) => {
      try {
        return await $fetch<MosaicRasterMeta>(`/api/mosaic/rasters/${input.mode}`, {
          query: { domain: input.domain, product: input.product, t: input.t },
        })
      }
      catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404) return null
        throw err
      }
    }),
    // unión por sitio del dominio contra el mismo slot_time (P5/D45): reusa
    // los endpoints del viewer de un solo radar, sin API nueva. Un sitio que
    // falla o no tiene volumen en tolerancia simplemente no aporta celdas —
    // el mismo espíritu de "un radar caído no apaga el mosaico" (D43).
    fetchCells: fromPromise(async ({ input }) => {
      const dom = (domains.value ?? []).find(d => d.domain_id === input.domain)
      const siteIds = dom?.site_ids ?? []
      const day = input.t.slice(0, 10)
      const results = await Promise.allSettled(siteIds.map(async (site) => {
        const times = await $fetch<string[]>('/api/phenomena/times', { query: { site, day } })
        const joined = nearestWithin(times, input.t)
        if (joined === null) return []
        return await $fetch<Phenomenon[]>('/api/phenomena', { query: { site, vol_time: joined } })
      }))
      return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
    }),
    // Viento (D49): el índice y el JSON u/v son POR SITIO, así que se
    // consulta cada `site_id` del dominio contra el mismo slot_time y se
    // UNEN las grillas (`mergeWindGrids`). Un sitio que falla o queda fuera
    // de tolerancia no aporta — mismo criterio que fetchCells.
    fetchWind: fromPromise(async ({ input }) => {
      const dom = (domains.value ?? []).find(d => d.domain_id === input.domain)
      const siteIds = dom?.site_ids ?? []
      const day = input.t.slice(0, 10)
      const results = await Promise.allSettled(siteIds.map(async (site) => {
        const times = await $fetch<WindGridMeta[]>('/api/wind/times', {
          query: { site, day, level: input.level },
        })
        const joined = nearestWithin(times.map(w => w.valid_time), input.t, WIND_JOIN_TOLERANCE_S)
        if (joined === null) return null
        const meta = times.find(w => w.valid_time === joined)
        if (!meta?.wind_url) return null
        const res = await fetch(meta.wind_url)
        if (!res.ok) throw new Error(`viento ${meta.r2_key}: HTTP ${res.status}`)
        return zWindGridFile.parse(await res.json()) as WindGridFile
      }))
      const grids = results.flatMap(r => (r.status === 'fulfilled' && r.value !== null ? [r.value] : []))
      return mergeWindGrids(grids)
    }),
    // Rayos (D49): cubos de 300 s por sitio que solapan la ventana
    // (slot anterior, slot], unidos y DEDUPLICADOS — dos radares vecinos
    // reciben la misma descarga del feed GLM.
    fetchLightning: fromPromise(async ({ input }) => {
      const dom = (domains.value ?? []).find(d => d.domain_id === input.domain)
      const siteIds = dom?.site_ids ?? []
      const day = input.t.slice(0, 10)
      const window = observationWindow(input.t, input.prevT)
      const results = await Promise.allSettled(siteIds.map(async (site) => {
        const buckets = await $fetch<LightningBucketMeta[]>('/api/lightning/times', {
          query: { site, day },
        })
        const metas = bucketsInWindow(buckets, window)
        return await Promise.all(metas.map(async (meta) => {
          if (!meta.lightning_url) throw new Error('origen R2 sin configurar (lightning_url null)')
          const res = await fetch(meta.lightning_url)
          if (!res.ok) throw new Error(`rayos ${meta.r2_key}: HTTP ${res.status}`)
          return zLightningBucketFile.parse(await res.json()) as LightningBucketFile
        }))
      }))
      const files = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
      return dedupeStrikes(strikesInWindow(files, window))
    }),
  },
  actions: {
    navigate: (_, params: MosaicNavigateParams) => navigate(params.patch, params.mode),
    syncQuery: (_, params: MosaicDisplayQueryParams) => syncQuery(params),
    syncCellQuery: (_, params: { cellId: string | null }) => syncCellQuery(params),
    syncLayersQuery: (_, params: MosaicLayersQueryParams) => syncLayersQuery(params),
    persistPrefs: (_, params: MosaicPrefsParams) => savePrefs(params),
  },
})

const { snapshot, send } = useActor(machine, {
  input: {
    route: initialRoute,
    nowT,
    initialRaster: initialRaster.value ?? null,
    initialError: initialRasterError.value && initialRasterError.value.statusCode !== 404
      ? initialRasterError.value.statusMessage ?? initialRasterError.value.message
      : null,
    initialTimes: initialTimes.value ?? [],
    initialTimelineError: initialTimesError.value
      ? initialTimesError.value.statusMessage ?? initialTimesError.value.message
      : null,
  },
})

watch(
  () => route.fullPath,
  () => {
    const parsed = parseMosaicRoute(route)
    if (parsed) send({ type: 'ROUTE_CHANGED', route: parsed })
  },
)
onMounted(() => {
  send({ type: 'MOUNTED' })
  // prefs de display (D28): localStorage no existe en SSR — el contexto
  // arranca con placeholders y acá entran los valores reales. Mismas claves
  // que el viewer de un solo radar: units/clock/paleta viajan entre vistas.
  const prefs = loadPrefs()
  send({
    type: 'PREFS_LOADED',
    prefs: {
      units: prefs?.units ?? PREF_DEFAULTS.units,
      clock: prefs?.clock ?? PREF_DEFAULTS.clock,
      animationFrames: prefs?.animationFrames ?? PREF_DEFAULTS.animationFrames,
      showPalette: prefs?.showPalette ?? PREF_DEFAULTS.showPalette,
    },
  })
  // nunca en SSR (onMounted es client-only) — evita el doble fetch
  // servidor+cliente de las capas que vengan encendidas en la URL
  send({ type: 'OVERLAY_INIT' })
})

const ctx = computed(() => snapshot.value.context)
const rasterProducts = computed(() => (products.value ?? []).filter(p => p.kind === 'raster'))
const productDef = computed(() => rasterProductDef(ctx.value.product))
const raster = computed(() => (snapshot.value.matches({ raster: 'shown' }) ? ctx.value.raster : null))
const rasterEmpty = computed(() => snapshot.value.matches({ raster: 'empty' }))
const rasterFetchError = computed(() => (snapshot.value.matches({ raster: 'error' }) ? ctx.value.rasterError : null))

const currentDomain = computed(() => (domains.value ?? []).find(d => d.domain_id === ctx.value.domain) ?? null)
const domainSites = computed<CoverageSite[]>(() => {
  if (!currentDomain.value || !radars.value) return []
  const ids = new Set(currentDomain.value.site_ids)
  return radars.value.filter(r => ids.has(r.site_id)).map(r => ({ site_id: r.site_id, lat: r.lat, lon: r.lon }))
})
const contributingSites = computed(() => (raster.value?.contributing ?? []).map(c => c.site))
// capa de celdas apagada por defecto, igual que en el viewer de un solo
// radar (`?layers=cells`): el contexto conserva lo ya cargado para que
// reencender no refetchee, pero no se dibuja nada mientras esté apagada
const cellsShown = computed(() => (ctx.value.layers.includes('cells') ? ctx.value.cells : []))
// mismas reglas que el viewer de un solo radar: la capa apagada no dibuja,
// pero el dato queda cacheado en el contexto para no refetchear al volver
const windGridShown = computed(() => (ctx.value.layers.includes('wind') ? ctx.value.windGrid : null))
const lightningStrikesShown = computed(() =>
  ctx.value.layers.includes('lightning') ? ctx.value.lightningStrikes : null,
)
const windInfo = computed(() => {
  if (!ctx.value.layers.includes('wind')) return null
  if (snapshot.value.matches({ wind: 'error' })) return `Error cargando viento: ${ctx.value.windError}`
  if (snapshot.value.matches({ wind: 'noData' })) return 'Sin dato de viento para este slot.'
  if (snapshot.value.matches({ wind: 'loading' })) return 'Cargando viento…'
  return 'Unión de las grillas GFS de los radares del dominio.'
})
const lightningInfo = computed(() => {
  if (!ctx.value.layers.includes('lightning')) return null
  if (snapshot.value.matches({ lightning: 'error' })) return `Error cargando rayos: ${ctx.value.lightningError}`
  if (snapshot.value.matches({ lightning: 'loading' })) return 'Cargando rayos…'
  const strikes = ctx.value.lightningStrikes
  if (strikes === null) return null
  return strikes.length === 0
    ? 'Sin descargas dentro del intervalo del slot.'
    : `${strikes.length} descargas en el intervalo del slot.`
})
const satTimeLabel = computed(() =>
  ctx.value.sat && raster.value ? formatFull(raster.value.slot_time, ctx.value.clock) : null,
)

// ventana de 72h anclada al last_seen_at MÁS RECIENTE de los radares miembros
// (no hay un last_seen_at propio del dominio) — un dominio con un radar caído
// sigue mostrando sus días con datos (mismo espíritu de la decisión 11)
const availableDays = computed(() => {
  const sites = domainSites.value
  if (sites.length === 0 || !radars.value) return []
  const member = radars.value.filter(r => sites.some(s => s.site_id === r.site_id))
  const lastSeen = member.map(r => r.last_seen_at).sort().at(-1)
  return lastSeen ? dayWindow72h(lastSeen) : []
})
const timelineEmpty = computed(() => snapshot.value.matches({ timeline: 'empty' }))
const timelineFetchError = computed(() => (snapshot.value.matches({ timeline: 'error' }) ? ctx.value.timelineError : null))
const timelineReady = computed(() =>
  snapshot.value.matches({ timeline: 'ready' }) || snapshot.value.matches({ timeline: 'refreshingTick' }),
)
const dayTimes = computed(() => ctx.value.times.map(r => r.slot_time))

// Ventana de `animationFrames` muestras anclada al slot mostrado (D48) —
// misma mecánica que el viewer de un solo radar: la strip NO dibuja el día
// entero (288 slots de 300 s serían ~24 h de ticks ilegibles), solo las
// últimas N observaciones alrededor del ancla.
const windowAnchorIdx = ref(-1)
const windowAnchorKey = ref<string | null>(null)
watch(
  () => [ctx.value.times, ctx.value.time, ctx.value.animationFrames] as const,
  ([times, time, maxFrames]) => {
    if (times.length === 0) {
      windowAnchorIdx.value = -1
      windowAnchorKey.value = null
      return
    }
    const currentIdx = times.findIndex(r => r.slot_time === time)
    if (currentIdx === -1) return
    const anchor = windowAnchorIdx.value
    const startIdx = Math.max(0, anchor - maxFrames + 1)
    const sameFrame = anchor >= 0 && anchor < times.length && times[anchor]!.r2_key === windowAnchorKey.value
    if (!sameFrame || currentIdx < startIdx || currentIdx > anchor) {
      windowAnchorIdx.value = currentIdx
      windowAnchorKey.value = times[currentIdx]!.r2_key
    }
  },
  { immediate: true },
)
const timelineWindowMeta = computed(() => {
  const times = ctx.value.times
  if (times.length === 0) return []
  const maxFrames = ctx.value.animationFrames
  const anchor = windowAnchorIdx.value === -1 ? 0 : windowAnchorIdx.value
  const startIdx = Math.max(0, anchor - maxFrames + 1)
  return times.slice(startIdx, startIdx + maxFrames)
})
const timelineTimes = computed(() => timelineWindowMeta.value.map(r => r.slot_time))
const timelineGaps = computed(() => computeGaps(timelineTimes.value))
const currentIdx = computed(() => (ctx.value.time !== null ? dayTimes.value.indexOf(ctx.value.time) : -1))
const canStepPrev = computed(() => currentIdx.value > 0 || !ctx.value.atStart)
const canStepNext = computed(() => (currentIdx.value !== -1 && currentIdx.value < dayTimes.value.length - 1) || !ctx.value.atEnd)

function onTimelineSelect(time: string) {
  send({ type: 'SELECT_TIME', time })
}
function onTimelineStep(dir: 1 | -1) {
  send({ type: 'STEP', dir })
}
function onSelectDay(day: string) {
  send({ type: 'SELECT_DAY', day })
}

const slotTimeParts = computed(() => (raster.value ? formatFullParts(raster.value.slot_time, ctx.value.clock) : null))

const cursor = ref<{ lon: number, lat: number, level: number | null, value: number | null, rangeFolded: boolean } | null>(null)
function onCursor(sample: typeof cursor.value) {
  cursor.value = sample
}
const cursorLabel = computed(() => {
  if (!cursor.value) return null
  if (cursor.value.rangeFolded) return 'RF'
  if (cursor.value.level === null) return null
  const converted = convertRasterValue(cursor.value.value ?? 0, productDef.value?.unit ?? '', ctx.value.units)
  return `${converted.value.toFixed(1)} ${converted.unit}`
})
const cursorLatLonLabel = computed(() => (cursor.value ? `${cursor.value.lat.toFixed(4)}, ${cursor.value.lon.toFixed(4)}` : null))

function onSelectDomain(event: Event) {
  send({ type: 'SELECT_DOMAIN', domain: (event.target as HTMLSelectElement).value })
}
function onSelectProduct(event: Event) {
  send({ type: 'SELECT_PRODUCT', product: Number((event.target as HTMLSelectElement).value) })
}
function onSelectBase(event: Event) {
  send({ type: 'SELECT_BASE', base: (event.target as HTMLSelectElement).value as BaseMapId })
}
function onOpacityInput(event: Event) {
  send({ type: 'SET_OPACITY', value: Number((event.target as HTMLInputElement).value) })
}
function onToggleShowPalette(event: Event) {
  send({ type: 'SET_PREF', patch: { showPalette: (event.target as HTMLInputElement).checked } })
}
function onToggleLayer(layer: OverlayLayerId) {
  // LayersMenu habla el vocabulario del viewer de un solo radar; acá existen
  // 'cells', 'wind' y 'lightning' (MOSAIC_LAYERS) — meso/trayectorias ni se
  // renderizan en variant="mosaic"
  if (layer === 'cells' || layer === 'wind' || layer === 'lightning') {
    send({ type: 'TOGGLE_LAYER', layer })
  }
}
function onSelectWindLevel(event: Event) {
  send({ type: 'SELECT_WIND_LEVEL', level: (event.target as HTMLSelectElement).value as WindLevel })
}
function onToggleSatellite() {
  send({ type: 'TOGGLE_SAT' })
}
function onSelectSatVariant(event: Event) {
  send({ type: 'SELECT_SAT_VARIANT', variant: (event.target as HTMLSelectElement).value as 'ir' | 'vis' })
}
function onSatOpacityInput(event: Event) {
  send({ type: 'SET_SAT_OPACITY', value: Number((event.target as HTMLInputElement).value) })
}
// PrefsDialog emite el patch completo de prefs; `coverage` en esta vista NO
// es una pref persistida sino estado de URL (`?coverage=0`), así que se
// desvía a TOGGLE_COVERAGE y el resto sigue el camino normal.
function onSetPref(patch: Partial<{ coverage: boolean, units: 'imperial' | 'si', clock: 'utc' | 'local', animationFrames: number, showPalette: boolean }>) {
  const { coverage, ...rest } = patch
  if (coverage !== undefined && coverage !== ctx.value.coverage) send({ type: 'TOGGLE_COVERAGE' })
  if (Object.keys(rest).length > 0) send({ type: 'SET_PREF', patch: rest })
}
function onSelectCell(cellId: string | null) {
  send({ type: 'SELECT_CELL', cellId })
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

const singleRadarPath = computed(() => {
  const first = domainSites.value[0]?.site_id
  return first ? `/${first}/${ctx.value.product}` : '/'
})
</script>

<template>
  <div class="relative flex h-screen w-screen overflow-hidden bg-slate-900 text-slate-100">
    <div class="relative min-w-0 flex-1 overflow-hidden">
      <ClientOnly>
        <MosaicMap
          v-if="currentDomain"
          ref="radarMap"
          :raster="raster"
          :product-def="productDef"
          :opacity="ctx.opacity"
          :base-map="ctx.base"
          :sites="domainSites"
          :radius-m="currentDomain.radius_m"
          :contributing="contributingSites"
          :show-coverage="ctx.coverage"
          :cells="cellsShown"
          :selected-cell="ctx.selectedCell"
          :sat-enabled="ctx.sat"
          :sat-variant="ctx.satVariant"
          :sat-opacity="ctx.satOpacity"
          :wind-grid="windGridShown"
          :lightning-strikes="lightningStrikesShown"
          @cursor="onCursor"
          @raster-error="send({ type: 'COG_ERROR', message: $event })"
          @select-cell="onSelectCell"
        />
      </ClientOnly>

      <!-- misma cinta de marca que el viewer de un solo radar (D48): no se
           toca entre vistas; el enlace de vuelta vive en el chip -->
      <div class="pointer-events-none absolute inset-x-0 top-0 z-30 hidden md:flex justify-center">
        <div
          class="pointer-events-auto flex h-11 w-72 items-center justify-center gap-2 bg-gradient-to-b from-slate-950/80 to-slate-700/80 px-6 shadow-lg ring-1 ring-inset ring-white/10"
          style="clip-path: path('M0,0 L288,0 L257.06,32.42 Q246,44 230,44 L58,44 Q42,44 30.94,32.42 Z')"
        >
          <AppLogo :size="24" class="shrink-0 text-teal-400" />
          <span class="text-sm font-bold tracking-wide text-slate-100">LAMULA<sup class="text-[0.6em]">™</sup> WebViewer</span>
        </div>
      </div>

      <MosaicDomainChip
        :domains="domains ?? []"
        :domain="ctx.domain"
        :raster-products="rasterProducts"
        :product="ctx.product"
        :product-def="productDef"
        :domains-error="domainsError"
        :raster-fetch-error="rasterFetchError"
        :raster-empty="rasterEmpty"
        :raster="raster"
        :slot-time-parts="slotTimeParts"
        :cog-error="ctx.cogError"
        :cursor-label="cursorLabel"
        :cursor-lat-lon-label="cursorLatLonLabel"
        :show-palette="ctx.showPalette"
        :units="ctx.units"
        :cells="cellsShown"
        :selected-cell="ctx.selectedCell"
        :single-radar-path="singleRadarPath"
        @select-domain="onSelectDomain"
        @select-product="onSelectProduct"
        @select-cell="onSelectCell"
      />

      <TimelineMenu
        ref="timelineMenu"
        :animation-frames="ctx.animationFrames"
        :show-speed="false"
        @set-pref="onSetPref"
      />

      <PrefsDialog
        ref="prefsDialog"
        :coverage="ctx.coverage"
        :units="ctx.units"
        :clock="ctx.clock"
        @set-pref="onSetPref"
      />

      <div class="pointer-events-none absolute bottom-6 left-4 right-4 z-10 md:left-8 md:right-8">
        <div class="pointer-events-auto">
          <p v-if="timelineFetchError" data-testid="mosaic-timeline-error" class="rounded bg-amber-900/80 p-3 text-sm text-amber-200 shadow">
            Error consultando la timeline del mosaico: {{ timelineFetchError }}
          </p>
          <p v-else-if="timelineEmpty" data-testid="mosaic-timeline-empty" class="rounded bg-slate-800/80 p-3 text-sm text-slate-400 shadow">
            Sin mosaicos este día (UTC).
          </p>
          <TimelineStrip
            v-else-if="timelineReady"
            :times="timelineTimes"
            :current="raster?.slot_time ?? ctx.time"
            :gaps="timelineGaps"
            :can-prev="canStepPrev"
            :can-next="canStepNext"
            :clock="ctx.clock"
            :playing="false"
            :show-play="false"
            :live-refresh="ctx.liveRefresh"
            @select="onTimelineSelect"
            @step="onTimelineStep"
            @toggle="() => {}"
            @set-live-refresh="value => send({ type: 'SET_LIVE_REFRESH', value })"
            @menu="timelineMenu?.open()"
          />
        </div>
      </div>

    </div>

    <!-- mismo menú de capas que el viewer de un solo radar (D48): el variant
         'mosaic' oculta satélite/viento/rayos/tendencia/VWP/anotaciones/
         export/feedback y el suavizado, que no existen en esta vista -->
    <LayersMenu
      variant="mosaic"
      :base="ctx.base"
      :panel-open="false"
      :has-palette="!!productDef"
      :opacity="ctx.opacity"
      :show-palette="ctx.showPalette"
      :layers="ctx.layers"
      :sat="ctx.sat"
      :sat-variant="ctx.satVariant"
      :sat-opacity="ctx.satOpacity"
      :sat-time-label="satTimeLabel"
      :wind-level="ctx.windLevel"
      :wind-info="windInfo"
      :lightning-info="lightningInfo"
      :available-days="availableDays"
      :day="ctx.day"
      @select-base="onSelectBase"
      @opacity-input="onOpacityInput"
      @toggle-show-palette="onToggleShowPalette"
      @toggle-layer="onToggleLayer"
      @toggle-satellite="onToggleSatellite"
      @select-sat-variant="onSelectSatVariant"
      @sat-opacity-input="onSatOpacityInput"
      @select-wind-level="onSelectWindLevel"
      @select-day="onSelectDay"
      @open-prefs="prefsDialog?.open()"
    />
  </div>
</template>
