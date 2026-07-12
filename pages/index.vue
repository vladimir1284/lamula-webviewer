<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { RasterMeta } from '#shared/contract'
import { rasterProductDef } from '#shared/products'
import type { CursorSample } from '../utils/map/cursor'

const { data: radars, error: radarsError } = await useFetch('/api/radars')
const { data: products } = await useFetch('/api/products')

const siteId = ref(radars.value?.[0]?.site_id ?? '')
const radar = computed(
  () => radars.value?.find(r => r.site_id === siteId.value) ?? null,
)

const rasterProducts = computed(
  () => products.value?.filter(p => p.kind === 'raster') ?? [],
)
const N0B = 153
const productCode = ref(
  rasterProducts.value.some(p => p.code === N0B)
    ? N0B
    : rasterProducts.value[0]?.code ?? 0,
)
const productDef = computed(() => rasterProductDef(productCode.value))

// Raster más cercano a "ahora" (timeline/stepping llegan en F3).
// useState: el instante se calcula una vez en SSR y viaja en el payload —
// si el cliente recalculara, la key de useFetch cambiaría y rompería la
// hidratación.
const t = useState('rasters-closest-t', () => new Date().toISOString().slice(0, 19)).value
const {
  data: raster,
  error: rasterError,
  status: rasterStatus,
} = await useFetch<RasterMeta>('/api/rasters/closest', {
  query: computed(() => ({ site: siteId.value, product: productCode.value, t })),
  watch: [siteId, productCode],
})

// ?base=off apaga la base OSM (goldens visuales: solo raster + cobertura)
const route = useRoute()
const showBase = computed(() => route.query.base !== 'off')

const opacity = ref(0.8)
const cogError = ref('')
watch([siteId, productCode], () => {
  cogError.value = ''
})

const cursor = ref<CursorSample | null>(null)

const cursorLabel = computed(() => {
  if (!cursor.value) return null
  if (cursor.value.rangeFolded) return 'RF'
  const unit = productDef.value?.unit ?? ''
  return `${cursor.value.value?.toFixed(1)} ${unit}`
})
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
            v-model="siteId"
            data-testid="radar-select"
            class="w-full rounded border border-slate-600 bg-slate-800 p-2"
          >
            <option v-for="r in radars" :key="r.site_id" :value="r.site_id">
              {{ r.icao ?? r.site_id }}
            </option>
          </select>
        </label>

        <label class="block text-sm">
          <span class="mb-1 block text-slate-400">Producto</span>
          <select
            v-model.number="productCode"
            data-testid="product-select"
            class="w-full rounded border border-slate-600 bg-slate-800 p-2"
          >
            <option v-for="p in rasterProducts" :key="p.code" :value="p.code">
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
              v-model.number="opacity"
              data-testid="opacity-slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              class="w-full"
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
          v-if="rasterError"
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
          v-if="cogError"
          data-testid="cog-error"
          class="rounded bg-amber-900/40 p-3 text-sm text-amber-200"
        >
          {{ cogError }}
        </p>
      </aside>

      <main class="min-w-0 flex-1">
        <ClientOnly>
          <RadarMap
            v-if="radar"
            :radar="radar"
            :raster="rasterStatus === 'success' ? raster : null"
            :product-def="productDef"
            :opacity="opacity"
            :show-base="showBase"
            @cursor="cursor = $event"
            @raster-error="cogError = $event"
          />
        </ClientOnly>
      </main>
    </div>
  </div>
</template>
