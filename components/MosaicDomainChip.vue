<script setup lang="ts">
// Chip flotante top-left de la vista de mosaico (D43/P4) — hermano reducido
// de RadarProductChip.vue: selector de dominio+producto, estado del slot
// mostrado, y una sola línea con los radares del dominio — los que aportaron
// al slot en el color de acento, los ausentes en gris (misma información que
// el overlay de cobertura del mapa, para quien lo tenga apagado).
import { computed, ref } from 'vue'
import type { MosaicDomain, MosaicRasterMeta, Phenomenon, Product } from '#shared/contract'
import { stormCellAttrs } from '#shared/contract'
import type { RasterProductDef } from '#shared/products'
import { rasterProductDef } from '#shared/products'
import { mosaicCellId, siteColor } from '../utils/overlay/mosaic-cells'
import type { UnitsPref } from '../utils/units'
// Import explícito (no auto-import de Nuxt): así el componente también monta
// en los tests de vitest, que corren fuera del runtime de Nuxt.
import { useProductLabel } from '../composables/useProductLabel'

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
  /** celdas multi-radar del slot mostrado (P5/D45) */
  cells: Phenomenon[]
  selectedCell: string | null
  /** ruta al viewer de un solo radar de un sitio del dominio (D48): el
   * enlace vive acá, no en la cinta de marca — simétrico al `mosaic-enter-link`
   * de RadarProductChip.vue */
  singleRadarPath?: string | null
}>()

const emit = defineEmits<{
  'select-domain': [event: Event]
  'select-product': [event: Event]
  'select-cell': [cellId: string | null]
}>()

const { t } = useI18n()
const productLabel = useProductLabel()

// Un solo control de despliegue, igual que `RadarProductChip.vue` (D56).
const expanded = ref(false)
const hasError = computed(() => Boolean(props.domainsError || props.rasterFetchError || !props.productDef))

const currentDomain = computed(() => props.domains.find(d => d.domain_id === props.domain) ?? null)
const contributingIds = computed(() => new Set((props.raster?.contributing ?? []).map(c => c.site)))
/** todos los sitios del dominio en orden, marcados por si aportaron al slot */
const siteRows = computed(() =>
  (currentDomain.value?.site_ids ?? []).map(site => ({ site, contributing: contributingIds.value.has(site) })),
)

interface CellRow {
  id: string
  site: string
  cellId: string
  dbzMax: number | null
  color: string
}

const cellRows = computed<CellRow[]>(() => {
  const siteOrder = currentDomain.value?.site_ids ?? []
  return props.cells
    .filter(p => p.kind === 'storm_cell' && p.cell_id !== null)
    .map((p) => {
      const attrs = stormCellAttrs(p.attrs)
      return {
        id: mosaicCellId(p.site_id, p.cell_id!),
        site: p.site_id,
        cellId: p.cell_id!,
        dbzMax: attrs.dbz_max ?? null,
        color: siteColor(p.site_id, siteOrder),
      }
    })
    .sort((a, b) => (b.dbzMax ?? -Infinity) - (a.dbzMax ?? -Infinity))
})

function onCellRow(id: string) {
  emit('select-cell', id === props.selectedCell ? null : id)
}

const fmtDbz = (v: number | null) => (v === null ? '—' : v.toFixed(0))
</script>

<template>
  <div class="pointer-events-auto absolute left-4 top-4 z-20 w-auto md:w-72 max-w-[calc(100vw-9rem)] md:max-w-[calc(100vw-2rem)]">
    <div class="rounded-lg border border-slate-700 bg-slate-900/95 shadow-lg" :class="expanded ? 'rounded-b-none border-b-0' : ''">
      <!-- cabecera en dos filas y un solo despliegue: ver `RadarProductChip.vue` (D56) -->
      <div class="px-3 py-2">
        <button
          type="button"
          data-testid="mosaic-chip-toggle"
          class="flex min-h-11 w-full items-center gap-2.5 text-left md:min-h-0"
          :aria-expanded="expanded"
          aria-controls="mosaic-chip-selectors mosaic-chip-details"
          @click="expanded = !expanded"
        >
          <span class="min-w-0 flex-1 text-sm font-bold">
            {{ currentDomain?.name ?? domain }} · {{ productLabel(productDef, t('mosaic.noPaletteShort')) }}
          </span>
          <span class="shrink-0 text-slate-400" aria-hidden="true">{{ expanded ? '︿' : '⌄' }}</span>
        </button>

        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-300">
          <span v-if="slotTimeParts" class="font-mono font-semibold text-teal-400">{{ slotTimeParts.time }}</span>
          <span class="whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-400">{{ t('mosaic.badgeLabel') }}</span>
          <NuxtLink
            v-if="singleRadarPath"
            :to="singleRadarPath"
            data-testid="mosaic-exit-link"
            class="inline-flex min-h-11 items-center rounded bg-slate-800 px-1.5 py-1 text-[11px] text-teal-400 underline hover:bg-slate-700 md:min-h-0"
          >
            {{ t('mosaic.singleRadarLink') }}
          </NuxtLink>
        </div>
      </div>
    </div>

    <div
      v-if="expanded"
      id="mosaic-chip-selectors"
      class="space-y-3 rounded-b-lg border border-t border-slate-700 border-t-slate-700/60 bg-slate-900/95 p-3 text-sm shadow-lg"
    >
      <label class="block">
        <span class="mb-1 block text-slate-400">{{ t('mosaic.domainLabel') }}</span>
        <select
          :value="domain"
          data-testid="mosaic-domain-select"
          class="w-full rounded border border-slate-500 bg-slate-800 p-2"
          @change="$emit('select-domain', $event)"
        >
          <option v-for="d in domains" :key="d.domain_id" :value="d.domain_id">
            {{ d.name }} ({{ d.site_ids.join('+') }})
          </option>
        </select>
      </label>

      <label class="block">
        <span class="mb-1 block text-slate-400">{{ t('mosaic.productLabel') }}</span>
        <select
          :value="String(product)"
          data-testid="mosaic-product-select"
          class="w-full rounded border border-slate-500 bg-slate-800 p-2"
          @change="$emit('select-product', $event)"
        >
          <option v-for="p in rasterProducts" :key="p.code" :value="String(p.code)">
            {{ productLabel(rasterProductDef(p.code), p.mnemonic) }} ({{ p.mnemonic }})
          </option>
        </select>
      </label>
    </div>

    <div
      id="mosaic-chip-details"
      class="mt-1.5 space-y-2"
      :class="(expanded || hasError) ? 'block' : 'hidden md:block'"
    >
      <p
        v-if="domainsError"
        data-testid="mosaic-domains-error"
        role="alert"
        class="rounded bg-amber-900/40 p-3 text-sm text-amber-200 shadow-lg"
      >
        {{ t('mosaic.domainsUnavailable', { detail: domainsError.statusMessage ?? domainsError.message }) }}
      </p>
      <p
        v-if="!productDef"
        data-testid="mosaic-product-no-palette"
        role="alert"
        class="rounded bg-amber-900/40 p-3 text-sm text-amber-200 shadow-lg"
      >
        {{ t('mosaic.noPaletteCatalog') }}
      </p>
      <p
        v-if="rasterFetchError"
        data-testid="mosaic-raster-error"
        role="alert"
        class="rounded bg-amber-900/40 p-3 text-sm text-amber-200 shadow-lg"
      >
        {{ t('mosaic.fetchError', { detail: rasterFetchError }) }}
      </p>
      <p
        v-else-if="rasterEmpty"
        data-testid="mosaic-raster-empty"
        role="status"
        class="rounded bg-slate-900/95 p-3 text-sm text-slate-400 shadow-lg"
      >
        {{ t('mosaic.empty') }}
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
          <dt class="text-slate-400">{{ t('mosaic.cursorValueLabel') }}</dt>
          <dd data-testid="mosaic-cursor-value" class="font-mono">{{ cursorLabel ?? '—' }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-slate-400">{{ t('mosaic.latLonLabel') }}</dt>
          <dd data-testid="mosaic-cursor-latlon" class="font-mono">{{ cursorLatLonLabel ?? '—' }}</dd>
        </div>
        <!-- cobertura en una línea: mismo dato que la máscara del mapa —
             quien aportó al slot en el color de acento, el ausente en gris -->
        <div class="flex justify-between gap-4">
          <dt class="text-slate-400">{{ t('mosaic.sitesLabel') }}</dt>
          <dd data-testid="mosaic-contributing" class="flex flex-wrap justify-end gap-x-1.5 font-mono">
            <span
              v-for="row in siteRows"
              :key="row.site"
              :data-contributing="row.contributing ? '1' : '0'"
              :class="row.contributing ? 'font-semibold text-teal-400' : 'text-slate-400'"
            >{{ row.site }}</span>
            <span v-if="siteRows.length === 0">—</span>
          </dd>
        </div>
      </dl>

      <!-- celdas multi-radar (P5/D45): mismo dato que los markers del mapa,
           coloreadas por sitio de origen; sin deduplicar entre radares -->
      <div v-if="cellRows.length > 0" data-testid="mosaic-cell-list" class="rounded bg-slate-900/95 p-2 text-xs shadow-lg">
        <h3 class="mb-1 font-semibold text-slate-300">{{ t('mosaic.cellsHeading') }}</h3>
        <ul class="max-h-40 space-y-0.5 overflow-y-auto">
          <li
            v-for="row in cellRows"
            :key="row.id"
            :data-testid="`mosaic-cell-row-${row.id}`"
            class="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5"
            :class="row.id === selectedCell ? 'bg-yellow-400/10 text-yellow-200' : 'hover:bg-slate-800'"
            @click="onCellRow(row.id)"
          >
            <span class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: row.color }" />
            <span class="font-mono text-slate-400">{{ row.site }}</span>
            <span class="font-mono font-semibold">{{ row.cellId }}</span>
            <span class="ml-auto font-mono text-slate-400">{{ fmtDbz(row.dbzMax) }} dBZ</span>
          </li>
        </ul>
      </div>

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
        role="alert"
        class="flex items-start gap-2 rounded bg-amber-900/40 p-3 text-sm text-amber-200 shadow-lg"
      >
        <span aria-hidden="true">⚠️</span>
        <span class="min-w-0 break-words">{{ cogError }}</span>
      </p>
    </div>
  </div>
</template>
