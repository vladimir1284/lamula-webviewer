<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useActor } from '@xstate/vue'
import { fromPromise } from 'xstate'
import type { RasterMeta } from '#shared/contract'
import { rasterProductDef } from '#shared/products'
import { savePrefs } from '../../../composables/useViewerPrefs'
import { viewerMachine } from '../../../machines/viewer'
import type { NavigateParams, PrefsParams } from '../../../machines/viewer'

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
  },
  actions: {
    navigate: (_, params: NavigateParams) => navigate(params.patch, params.mode),
    persistPrefs: (_, params: PrefsParams) => savePrefs(params),
    syncQuery: (_, params: { opacity: number, base: 'osm' | 'off' }) => syncQuery(params),
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
const raster = computed(() => (snapshot.value.matches('shown') ? ctx.value.raster : null))
const rasterEmpty = computed(() => snapshot.value.matches('empty'))
const rasterFetchError = computed(() =>
  snapshot.value.matches('error') ? ctx.value.rasterError : null,
)

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
      </aside>

      <main class="min-w-0 flex-1">
        <ClientOnly>
          <RadarMap
            v-if="radar"
            :radar="radar"
            :raster="raster"
            :product-def="productDef"
            :opacity="ctx.opacity"
            :show-base="ctx.base !== 'off'"
            @cursor="send({ type: 'CURSOR_MOVE', sample: $event })"
            @raster-error="send({ type: 'COG_ERROR', message: $event })"
          />
        </ClientOnly>
      </main>
    </div>
  </div>
</template>
