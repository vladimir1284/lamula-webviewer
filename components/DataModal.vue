<script setup lang="ts">
// Panel de datos (D37): reemplaza el <dialog> centrado (D36) — ahora ocupa
// el dock derecho donde vivía LayersMenu, con el doble de su ancho
// (md:w-80 → md:w-[40rem]), mismo patrón de acoplado/overlay que
// LayersMenu.vue (dock real en md+, overlay full-screen en mobile).
// Mutuamente excluyente con el panel de capas: abrir un tab de Datos desde
// LayersMenu ya cierra su dock (ver openPanel() ahí); abrir el menú de
// capas emite close-panel para cerrar este panel (ver @close-panel en la
// página). `active` es tab local (antes vivía en TabModal) — cambiar de
// tab con el panel ya abierto emite update:panel sin pasar por el prop
// `panel` (evita el flash de resetear a la primera tab).
import { computed, nextTick, ref, watch } from 'vue'
import type { Phenomenon, VwpLevel } from '#shared/contract'
import type { PanelId } from '../machines/overlay'
import type { ClockPref } from '../utils/time-display'
import type { UnitsPref } from '../utils/units'

const { t } = useI18n()

const props = withDefaults(defineProps<{
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

const TABS = computed<{ id: PanelId, label: string }[]>(() => [
  { id: 'cells', label: t('data.tabs.cells') },
  { id: 'trend', label: t('data.tabs.trend') },
  { id: 'vwp', label: t('data.tabs.vwp') },
])

const active = ref<PanelId>(props.panel ?? 'cells')
watch(() => props.panel, (p) => {
  if (p !== null) active.value = p
})

function setActive(id: PanelId) {
  active.value = id
  emit('update:panel', id)
}

// Navegación por teclado del tablist (patrón ARIA tabs): las flechas mueven
// entre pestañas, Home/End saltan a los extremos, y el foco sigue a la
// pestaña recién activada (activación automática).
function onTabKeydown(event: KeyboardEvent) {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
  if (!keys.includes(event.key)) return
  // Las flechas pertenecen al tablist mientras el foco esté acá: sin
  // stopPropagation el listener global de la página saltaría además de frame.
  event.preventDefault()
  event.stopPropagation()
  const ids: PanelId[] = TABS.value.map(tab => tab.id)
  const current = ids.indexOf(active.value)
  let next: number
  if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = ids.length - 1
  else if (event.key === 'ArrowLeft') next = (current - 1 + ids.length) % ids.length
  else next = (current + 1) % ids.length
  const id = ids[next]
  if (id === undefined) return
  setActive(id)
  // El foco debe seguir a la pestaña recién activada (activación automática).
  nextTick(() => {
    const el = document.getElementById(`data-modal-tab-${id}`)
    el?.focus()
  })
}

const vwpSubTab = ref<'chart' | 'table'>('chart')
</script>

<template>
  <div
    v-if="panel"
    data-testid="data-modal"
    class="pointer-events-auto fixed inset-x-0 bottom-0 top-12 z-40 overflow-y-auto rounded-t-2xl bg-slate-900 p-4 md:static md:z-auto md:h-full md:w-[40rem] md:shrink-0 md:rounded-none md:border-l md:border-slate-700 md:bg-slate-900/95 md:p-3 md:shadow-lg"
  >
    <div class="mb-2 flex justify-center md:hidden" aria-hidden="true">
      <div class="h-1.5 w-12 rounded-full bg-slate-600" />
    </div>

    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-sm font-bold">{{ t('data.title') }}</h2>
      <button
        type="button"
        data-testid="data-modal-close"
        :aria-label="t('common.close')"
        class="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>

    <div
      class="mb-3 flex gap-1 border-b border-slate-700 pb-2"
      role="tablist"
      :aria-label="t('data.tabsAriaLabel')"
    >
      <button
        v-for="tab in TABS"
        :id="`data-modal-tab-${tab.id}`"
        :key="tab.id"
        type="button"
        :data-testid="`data-modal-tab-${tab.id}`"
        role="tab"
        :aria-selected="active === tab.id"
        :aria-controls="`data-modal-panel-${tab.id}`"
        :tabindex="active === tab.id ? 0 : -1"
        class="rounded px-3 py-1.5 text-sm"
        :class="active === tab.id
          ? 'bg-slate-700 text-slate-100'
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'"
        @click="setActive(tab.id)"
        @keydown="onTabKeydown"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="text-sm">
      <div
        v-if="active === 'cells'"
        id="data-modal-panel-cells"
        role="tabpanel"
        aria-labelledby="data-modal-tab-cells"
        tabindex="0"
      >
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
      </div>

      <div
        v-else-if="active === 'trend'"
        id="data-modal-panel-trend"
        role="tabpanel"
        aria-labelledby="data-modal-tab-trend"
        tabindex="0"
      >
        <TrendChart
          :series="series"
          :cell-id="selectedCell"
          :error="seriesError"
          :units="units"
          :clock="clock"
        />
      </div>

      <div
        v-else
        id="data-modal-panel-vwp"
        role="tabpanel"
        aria-labelledby="data-modal-tab-vwp"
        tabindex="0"
      >
        <div class="mb-2 flex gap-1 border-b border-slate-700 pb-2">
          <button
            type="button"
            data-testid="vwp-modal-tab-chart"
            class="rounded px-3 py-1 text-sm"
            :class="vwpSubTab === 'chart' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800'"
            @click="vwpSubTab = 'chart'"
          >
            {{ t('data.vwp.tabChart') }}
          </button>
          <button
            type="button"
            data-testid="vwp-modal-tab-table"
            class="rounded px-3 py-1 text-sm"
            :class="vwpSubTab === 'table' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800'"
            @click="vwpSubTab = 'table'"
          >
            {{ t('data.vwp.tabTable') }}
          </button>
        </div>
        <p v-if="vwpError" data-testid="vwp-error" class="rounded bg-amber-900/40 p-3 text-sm text-amber-200">
          {{ t('data.vwp.error', { error: vwpError }) }}
        </p>
        <p
          v-else-if="vwpEmpty || vwpWindow.length === 0"
          data-testid="vwp-empty"
          class="rounded bg-slate-800 p-3 text-sm text-slate-400"
        >
          {{ t('data.vwp.empty') }}
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
      </div>
    </div>
  </div>
</template>
