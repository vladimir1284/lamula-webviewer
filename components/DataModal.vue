<script setup lang="ts">
// Modal único de datos (D36): reemplaza SidePanel.vue (rail Celdas/Tendencia)
// y VwpModal.vue (modal VWP aparte) — los 3 paneles ya comparten el mismo
// PanelId (cells|trend|vwp) en overlayMachine, así que viven en un solo
// <dialog> con tabs top-level en vez de 3 superficies distintas. El
// contenido de VWP (antes en VwpModal.vue) se mueve tal cual acá — no hay
// duplicación, es el único lugar donde ese markup existe una vez borrado
// VwpModal.vue. Abre/cierra con el mismo patrón que VwpModal tenía: la
// página hace watch(ctx.panel) y llama open()/close(); acá solo se expone
// eso. Cambiar de tab con el modal YA abierto (sin pasar por open()) emite
// update:panel, que la página reenvía como SELECT_PANEL — ver el fix en
// TabModal.vue (open() respeta el v-model, no resetea a la primera tab).
import { ref } from 'vue'
import type { Phenomenon, VwpLevel } from '#shared/contract'
import type { PanelId } from '../machines/overlay'
import type { ClockPref } from '../utils/time-display'
import type { UnitsPref } from '../utils/units'

withDefaults(defineProps<{
  panel: PanelId | null
  // Celdas
  phenomena: Phenomenon[] | null
  joined: string | null
  selectedCell: string | null
  pastCellIds: string[]
  futureCellIds: string[]
  // Tendencia
  series: Phenomenon[] | null
  seriesError?: string | null
  // VWP
  vwpProfiles: Record<string, VwpLevel[]>
  vwpWindow: string[]
  vwpJoined: string | null
  vwpError?: string | null
  vwpEmpty?: boolean
  // compartidos
  units?: UnitsPref
  clock?: ClockPref
}>(), { units: 'imperial', clock: 'utc', seriesError: null, vwpError: null, vwpEmpty: false })

const emit = defineEmits<{
  close: []
  'update:panel': [panel: PanelId]
  'select-cell': [cellId: string | null]
  'toggle-past-track': [cellId: string]
  'toggle-future-track': [cellId: string]
}>()

const TABS: { id: PanelId, label: string }[] = [
  { id: 'cells', label: 'Celdas' },
  { id: 'trend', label: 'Tendencia' },
  { id: 'vwp', label: 'VWP' },
]

const modal = ref<{ open: () => void, close: () => void }>()
const vwpSubTab = ref<'chart' | 'table'>('chart')

defineExpose({
  open: () => modal.value?.open(),
  close: () => modal.value?.close(),
})
</script>

<template>
  <TabModal
    ref="modal"
    title="Datos"
    testid-prefix="data-modal"
    :tabs="TABS"
    :active="panel ?? 'cells'"
    @close="emit('close')"
    @update:active="emit('update:panel', $event as PanelId)"
  >
    <template #cells>
      <CellTable
        :phenomena="phenomena"
        :joined="joined"
        :selected-cell="selectedCell"
        :past-cell-ids="pastCellIds"
        :future-cell-ids="futureCellIds"
        :units="units"
        @select="emit('select-cell', $event)"
        @toggle-past-track="emit('toggle-past-track', $event)"
        @toggle-future-track="emit('toggle-future-track', $event)"
      />
    </template>
    <template #trend>
      <TrendChart
        :series="series"
        :cell-id="selectedCell"
        :error="seriesError"
        :units="units"
        :clock="clock"
      />
    </template>
    <template #vwp>
      <div class="mb-2 flex gap-1 border-b border-slate-700 pb-2">
        <button
          type="button"
          data-testid="vwp-modal-tab-chart"
          class="rounded px-3 py-1 text-sm"
          :class="vwpSubTab === 'chart' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800'"
          @click="vwpSubTab = 'chart'"
        >
          Gráfico
        </button>
        <button
          type="button"
          data-testid="vwp-modal-tab-table"
          class="rounded px-3 py-1 text-sm"
          :class="vwpSubTab === 'table' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800'"
          @click="vwpSubTab = 'table'"
        >
          Datos
        </button>
      </div>
      <p v-if="vwpError" data-testid="vwp-error" class="rounded bg-amber-900/40 p-3 text-sm text-amber-200">
        Error consultando el VWP: {{ vwpError }}
      </p>
      <p
        v-else-if="vwpEmpty || vwpWindow.length === 0"
        data-testid="vwp-empty"
        class="rounded bg-slate-800 p-3 text-sm text-slate-400"
      >
        Sin perfil de viento hasta este instante del día.
      </p>
      <VwpChart
        v-else-if="vwpSubTab === 'chart'"
        :profiles="vwpProfiles"
        :window="vwpWindow"
        :joined="vwpJoined"
        :units="units"
        :clock="clock"
      />
      <VwpTable
        v-else
        :profiles="vwpProfiles"
        :joined="vwpJoined"
        :units="units"
      />
    </template>
  </TabModal>
</template>
