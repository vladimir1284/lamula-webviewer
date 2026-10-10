<script setup lang="ts">
// Vista de mosaico multi-radar (D43/P4) — hermana reducida de
// pages/[site]/[product]/[[time]].vue: mismo patrón SSR + XState + URL
// manda, pero SIN fenómenos/VWP/viento/rayos/anotaciones/export/feedback
// (alcance recortado, ver machines/mosaic-viewer.ts) y SIN animación aún
// (geometría por fila, ver MosaicMap.vue). Celdas multi-radar etiquetadas
// llegan en P5.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useActor } from '@xstate/vue'
import { fromPromise } from 'xstate'
import type { BaseMapId } from '#shared/basemaps'
import type { MosaicRasterMeta } from '#shared/contract'
import { rasterProductDef } from '#shared/products'
import { mosaicQueryPatch, parseMosaicRoute, useMosaicNavigate } from '../../../../composables/useMosaicRoute'
import { mosaicViewerMachine } from '../../../../machines/mosaic-viewer'
import type { MosaicDisplayQueryParams, MosaicNavigateParams } from '../../../../machines/mosaic-viewer'
import type { CoverageSite } from '../../../../utils/map/coverage-rings-layer'
import { formatFullParts } from '../../../../utils/time-display'
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
  },
  actions: {
    navigate: (_, params: MosaicNavigateParams) => navigate(params.patch, params.mode),
    syncQuery: (_, params: MosaicDisplayQueryParams) => syncQuery(params),
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
onMounted(() => send({ type: 'MOUNTED' }))

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
const timelineGaps = computed(() => computeGaps(dayTimes.value))
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

const slotTimeParts = computed(() => (raster.value ? formatFullParts(raster.value.slot_time, 'utc') : null))

const cursor = ref<{ lon: number, lat: number, level: number | null, value: number | null, rangeFolded: boolean } | null>(null)
function onCursor(sample: typeof cursor.value) {
  cursor.value = sample
}
const cursorLabel = computed(() => {
  if (!cursor.value) return null
  if (cursor.value.rangeFolded) return 'RF'
  if (cursor.value.level === null) return null
  const converted = convertRasterValue(cursor.value.value ?? 0, productDef.value?.unit ?? '', 'imperial')
  return `${converted.value.toFixed(1)} ${converted.unit}`
})
const cursorLatLonLabel = computed(() => (cursor.value ? `${cursor.value.lat.toFixed(4)}, ${cursor.value.lon.toFixed(4)}` : null))

function onSelectDomain(event: Event) {
  send({ type: 'SELECT_DOMAIN', domain: (event.target as HTMLSelectElement).value })
}
function onSelectProduct(event: Event) {
  send({ type: 'SELECT_PRODUCT', product: Number((event.target as HTMLSelectElement).value) })
}
function onSelectBase(base: BaseMapId) {
  send({ type: 'SELECT_BASE', base })
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
          @cursor="onCursor"
          @raster-error="send({ type: 'COG_ERROR', message: $event })"
        />
      </ClientOnly>

      <div class="pointer-events-none absolute inset-x-0 top-0 z-30 hidden md:flex justify-center">
        <div
          class="pointer-events-auto flex h-11 items-center gap-2 rounded-b-lg bg-gradient-to-b from-slate-950/80 to-slate-700/80 px-6 shadow-lg ring-1 ring-inset ring-white/10"
        >
          <AppLogo :size="24" class="shrink-0 text-teal-400" />
          <span class="text-sm font-bold tracking-wide text-slate-100">LAMULA<sup class="text-[0.6em]">™</sup> Mosaico</span>
          <NuxtLink :to="singleRadarPath" data-testid="mosaic-exit-link" class="ml-2 text-xs text-teal-400 underline">
            ver radar único
          </NuxtLink>
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
        :show-palette="true"
        units="imperial"
        @select-domain="onSelectDomain"
        @select-product="onSelectProduct"
      />

      <!-- controles mínimos (D43/P4): opacidad, mapa base, overlay de
           cobertura — sin LayersMenu completo (fenómenos/viento/rayos no
           aplican acá), eso llega con P5 si el alcance lo pide -->
      <div class="pointer-events-auto absolute right-4 top-4 z-20 flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900/95 p-3 text-xs shadow-lg">
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            data-testid="mosaic-coverage-toggle"
            :checked="ctx.coverage"
            @change="send({ type: 'TOGGLE_COVERAGE' })"
          >
          Cobertura
        </label>
        <label class="flex items-center gap-2">
          Opacidad
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            data-testid="mosaic-opacity"
            :value="ctx.opacity"
            @input="send({ type: 'SET_OPACITY', value: Number(($event.target as HTMLInputElement).value) })"
          >
        </label>
        <label class="flex items-center gap-2">
          Mapa
          <select
            data-testid="mosaic-base-select"
            :value="ctx.base"
            @change="onSelectBase(($event.target as HTMLSelectElement).value as BaseMapId)"
          >
            <option value="osm">OSM</option>
            <option value="carto-dark">CARTO oscuro</option>
            <option value="carto-light">CARTO claro</option>
          </select>
        </label>
      </div>

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
            :times="dayTimes"
            :current="raster?.slot_time ?? ctx.time"
            :gaps="timelineGaps"
            :can-prev="canStepPrev"
            :can-next="canStepNext"
            clock="utc"
            :playing="false"
            :show-play="false"
            :live-refresh="ctx.liveRefresh"
            @select="onTimelineSelect"
            @step="onTimelineStep"
            @toggle="() => {}"
            @set-live-refresh="value => send({ type: 'SET_LIVE_REFRESH', value })"
          />
        </div>
      </div>

      <!-- selector de día (72h ancladas al radar miembro más reciente) -->
      <div
        v-if="availableDays.length > 0"
        class="pointer-events-auto absolute bottom-24 left-4 z-10 rounded bg-slate-900/95 p-2 text-xs shadow-lg md:left-8"
      >
        <label class="flex items-center gap-2">
          Día
          <select data-testid="mosaic-day-select" :value="ctx.day" @change="onSelectDay(($event.target as HTMLSelectElement).value)">
            <option v-for="d in availableDays" :key="d" :value="d">{{ d }}</option>
          </select>
        </label>
      </div>
    </div>
  </div>
</template>
