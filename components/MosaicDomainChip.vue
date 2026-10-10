<script setup lang="ts">
// Chip flotante top-left de la vista de mosaico (D43/P4) — hermano reducido
// de RadarProductChip.vue: selector de dominio+producto, estado del slot
// mostrado, y la lista de quién aportó / quién falta (lo que el overlay de
// cobertura pinta en el mapa, acá en texto para quien no pueda leer el mapa
// o tenga la capa apagada).
import { computed, ref } from 'vue'
import type { MosaicDomain, MosaicRasterMeta, Product } from '#shared/contract'
import type { RasterProductDef } from '#shared/products'
import { rasterProductDef } from '#shared/products'
import type { UnitsPref } from '../utils/units'

const props = defineProps<{
  domains: MosaicDomain[]
  domain: string
  rasterProducts: Product[]
  product: number
  productDef: RasterProductDef | null
  domainsError: { statusMessage?: string, message: string } | null
  rasterFetchError: string | null
  rasterEmpty: boolean
  raster: MosaicRasterMeta | null
  slotTimeParts: { date: string, time: string } | null
  cogError: string | null
  cursorLabel: string | null
  cursorLatLonLabel: string | null
  showPalette: boolean
  units: UnitsPref
}>()

defineEmits<{
  'select-domain': [event: Event]
  'select-product': [event: Event]
}>()

const expanded = ref(false)
const showDetailsMobile = ref(false)
const hasError = computed(() => Boolean(props.domainsError || props.rasterFetchError || !props.productDef))

const currentDomain = computed(() => props.domains.find(d => d.domain_id === props.domain) ?? null)
const contributingIds = computed(() => new Set((props.raster?.contributing ?? []).map(c => c.site)))
const absentSites = computed(() => (currentDomain.value?.site_ids ?? []).filter(s => !contributingIds.value.has(s)))
</script>

<template>
  <div class="pointer-events-auto absolute left-4 top-4 z-20 w-auto md:w-72 max-w-[calc(100vw-9rem)] md:max-w-[calc(100vw-2rem)]">
    <div class="rounded-lg border border-slate-700 bg-slate-900/95 shadow-lg" :class="expanded ? 'rounded-b-none border-b-0' : ''">
      <div class="flex items-center justify-between gap-1 px-3 py-2">
        <button
          type="button"
          data-testid="mosaic-chip-toggle"
          class="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          @click="expanded = !expanded"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-bold">
              {{ currentDomain?.name ?? domain }} · {{ productDef?.name ?? 'sin paleta' }}
            </span>
            <span class="flex items-center gap-2 text-xs text-slate-300">
              <span v-if="slotTimeParts" class="font-mono font-semibold text-teal-400">{{ slotTimeParts.time }}</span>
              <span class="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-400">mosaico</span>
            </span>
          </span>
          <span class="shrink-0 text-slate-400" aria-hidden="true">{{ expanded ? '︿' : '⌄' }}</span>
        </button>

        <button
          type="button"
          data-testid="mosaic-details-toggle"
          aria-label="Detalles del mosaico"
          class="grid h-7 w-7 shrink-0 place-items-center rounded bg-slate-800 text-xs font-bold text-slate-300 hover:bg-slate-700 md:hidden"
          @click="showDetailsMobile = !showDetailsMobile"
        >
          ℹ️
        </button>
      </div>
    </div>

    <div
      v-if="expanded"
      class="space-y-3 rounded-b-lg border border-t border-slate-700 border-t-slate-700/60 bg-slate-900/95 p-3 text-sm shadow-lg"
    >
      <label class="block">
        <span class="mb-1 block text-slate-400">Dominio</span>
        <select
          :value="domain"
          data-testid="mosaic-domain-select"
          class="w-full rounded border border-slate-600 bg-slate-800 p-2"
          @change="$emit('select-domain', $event)"
        >
          <option v-for="d in domains" :key="d.domain_id" :value="d.domain_id">
            {{ d.name }} ({{ d.site_ids.join('+') }})
          </option>
        </select>
      </label>

      <label class="block">
        <span class="mb-1 block text-slate-400">Producto</span>
        <select
          :value="String(product)"
          data-testid="mosaic-product-select"
          class="w-full rounded border border-slate-600 bg-slate-800 p-2"
          @change="$emit('select-product', $event)"
        >
          <option v-for="p in rasterProducts" :key="p.code" :value="String(p.code)">
            {{ rasterProductDef(p.code)?.name ?? p.mnemonic }} ({{ p.mnemonic }})
          </option>
        </select>
      </label>
    </div>

    <div
      class="mt-1.5 space-y-2"
      :class="(showDetailsMobile || hasError) ? 'block' : 'hidden md:block'"
    >
      <p
        v-if="domainsError"
        data-testid="mosaic-domains-error"
        class="rounded bg-amber-900/40 p-3 text-sm text-amber-200 shadow-lg"
      >
        Dominios de mosaico no disponibles: {{ domainsError.statusMessage ?? domainsError.message }}
      </p>
      <p
        v-if="!productDef"
        data-testid="mosaic-product-no-palette"
        class="rounded bg-amber-900/40 p-3 text-sm text-amber-200 shadow-lg"
      >
        Producto sin paleta en el catálogo del viewer.
      </p>
      <p
        v-if="rasterFetchError"
        data-testid="mosaic-raster-error"
        class="rounded bg-amber-900/40 p-3 text-sm text-amber-200 shadow-lg"
      >
        Error consultando mosaicos: {{ rasterFetchError }}
      </p>
      <p
        v-else-if="rasterEmpty"
        data-testid="mosaic-raster-empty"
        class="rounded bg-slate-900/95 p-3 text-sm text-slate-400 shadow-lg"
      >
        Sin mosaico para esta selección.
      </p>
      <dl
        v-else-if="raster"
        data-testid="mosaic-raster-meta"
        class="space-y-1 rounded bg-slate-900/95 p-3 text-sm shadow-lg"
      >
        <div v-if="slotTimeParts" class="flex flex-col">
          <dd data-testid="mosaic-slot-time" class="font-mono text-lg font-semibold leading-tight">
            {{ slotTimeParts.time }}
          </dd>
          <dd data-testid="mosaic-slot-date" class="font-mono text-xs text-slate-400">
            {{ slotTimeParts.date }}
          </dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-slate-400">Valor bajo cursor</dt>
          <dd data-testid="mosaic-cursor-value" class="font-mono">{{ cursorLabel ?? '—' }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-slate-400">Lat/lon</dt>
          <dd data-testid="mosaic-cursor-latlon" class="font-mono">{{ cursorLatLonLabel ?? '—' }}</dd>
        </div>
        <!-- cobertura en texto: mismo dato que los anillos del mapa, para
             cuando la capa está apagada o es difícil de leer de un vistazo -->
        <div class="pt-1">
          <dt class="text-slate-400">Aportan</dt>
          <dd data-testid="mosaic-contributing" class="font-mono text-teal-400">
            {{ raster.contributing.length > 0 ? raster.contributing.map(c => c.site).join(', ') : '—' }}
          </dd>
        </div>
        <div v-if="absentSites.length > 0">
          <dt class="text-slate-400">Ausentes</dt>
          <dd data-testid="mosaic-absent" class="font-mono text-slate-500">{{ absentSites.join(', ') }}</dd>
        </div>
      </dl>

      <div
        v-if="showPalette && productDef"
        data-testid="mosaic-legend-chip"
        class="rounded bg-slate-900/95 p-2 shadow-lg"
      >
        <MapLegend :palette="productDef.palette" :units="units" />
      </div>

      <p
        v-if="cogError"
        data-testid="mosaic-cog-error"
        class="flex items-start gap-2 rounded bg-amber-900/40 p-3 text-sm text-amber-200 shadow-lg"
      >
        <span aria-hidden="true">⚠️</span>
        <span class="min-w-0 break-words">{{ cogError }}</span>
      </p>
    </div>
  </div>
</template>
