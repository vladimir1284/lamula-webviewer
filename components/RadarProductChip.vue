<script setup lang="ts">
// Chip flotante top-left (D36): reemplaza el <header> fijo + los selects de
// radar/producto + el bloque de estado del raster que vivían en el aside
// izquierdo. Identidad + estado de lo que se está mirando; los controles de
// qué se dibuja ENCIMA del mapa viven en LayersMenu.vue, no acá.
import { ref } from 'vue'
import type { Radar, Product, RasterMeta } from '#shared/contract'
import type { RasterProductDef } from '#shared/products'
import { rasterProductDef } from '#shared/products'

defineProps<{
  radars: Radar[]
  site: string
  rasterProducts: Product[]
  product: number
  productDef: RasterProductDef | null
  radar: Radar | null
  radarsError: { statusMessage?: string, message: string } | null
  rasterFetchError: string | null
  rasterEmpty: boolean
  raster: RasterMeta | null
  volTimeLabel: string | null
  cogError: string | null
}>()

defineEmits<{
  'select-site': [event: Event]
  'select-product': [event: Event]
}>()

const expanded = ref(false)
</script>

<template>
  <div class="pointer-events-auto absolute left-4 top-4 z-20 w-72 max-w-[calc(100vw-2rem)]">
    <button
      type="button"
      data-testid="radar-chip-toggle"
      class="flex w-full items-center gap-2.5 rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-left shadow-lg"
      @click="expanded = !expanded"
    >
      <AppLogo :size="20" class="shrink-0 text-teal-400" />
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-bold">
          {{ radar?.icao ?? site }} · {{ productDef?.name ?? 'sin paleta' }}
        </span>
        <FreshnessBadge v-if="radar" :last-seen-at="radar.last_seen_at" class="ml-0 mt-0.5" />
      </span>
      <span class="shrink-0 text-slate-400" aria-hidden="true">{{ expanded ? '︿' : '⌄' }}</span>
    </button>

    <!-- estado del raster: SIEMPRE visible, no detrás del toggle — es
         información de un vistazo (equivalente al resumen de pronóstico de
         Windy bajo su buscador), no un control -->
    <div class="mt-1.5 space-y-2">
      <p
        v-if="radarsError"
        data-testid="radars-error"
        class="rounded bg-amber-900/40 p-3 text-sm text-amber-200 shadow-lg"
      >
        D1 no disponible: {{ radarsError.statusMessage ?? radarsError.message }}
      </p>
      <p
        v-if="!productDef"
        data-testid="product-no-palette"
        class="rounded bg-amber-900/40 p-3 text-sm text-amber-200 shadow-lg"
      >
        Producto sin paleta en el catálogo del viewer.
      </p>
      <p
        v-if="rasterFetchError"
        data-testid="raster-error"
        class="rounded bg-amber-900/40 p-3 text-sm text-amber-200 shadow-lg"
      >
        Error consultando rasters: {{ rasterFetchError }}
      </p>
      <p
        v-else-if="rasterEmpty"
        data-testid="raster-empty"
        class="rounded bg-slate-900/95 p-3 text-sm text-slate-400 shadow-lg"
      >
        Sin raster para esta selección.
      </p>
      <dl
        v-else-if="raster"
        data-testid="raster-meta"
        class="space-y-1 rounded bg-slate-900/95 p-3 text-sm shadow-lg"
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
        v-if="cogError"
        data-testid="cog-error"
        class="rounded bg-amber-900/40 p-3 text-sm text-amber-200 shadow-lg"
      >
        {{ cogError }}
      </p>
    </div>

    <!-- solo los selectores viven detrás del toggle: identidad+estado de
         arriba ya cubre lo que se mira sin necesidad de expandir -->
    <div
      v-if="expanded"
      class="mt-1.5 space-y-3 rounded-lg border border-slate-700 bg-slate-900/95 p-3 text-sm shadow-lg"
    >
      <label class="block">
        <span class="mb-1 block text-slate-400">Radar</span>
        <select
          :value="site"
          data-testid="radar-select"
          class="w-full rounded border border-slate-600 bg-slate-800 p-2"
          @change="$emit('select-site', $event)"
        >
          <option v-for="r in radars" :key="r.site_id" :value="r.site_id">
            {{ r.icao ?? r.site_id }}
          </option>
        </select>
      </label>

      <label class="block">
        <span class="mb-1 block text-slate-400">Producto</span>
        <select
          :value="String(product)"
          data-testid="product-select"
          class="w-full rounded border border-slate-600 bg-slate-800 p-2"
          @change="$emit('select-product', $event)"
        >
          <option v-for="p in rasterProducts" :key="p.code" :value="String(p.code)">
            {{ rasterProductDef(p.code)?.name ?? p.mnemonic }} ({{ p.mnemonic }})
          </option>
        </select>
      </label>
    </div>
  </div>
</template>
