<script setup lang="ts">
// Modal VWP (D35): botón del menú izquierdo abre esto en vez del tab del
// rail derecho. Compone TabModal (tabs Gráfico/Datos) + los estados
// error/empty que antes vivían en VwpPanel. Abre/cierra en función de
// ctx.panel==='vwp' (la página hace el watch; acá solo se expone open/close).
import { ref } from 'vue'
import type { VwpLevel } from '#shared/contract'
import type { ClockPref } from '../utils/time-display'
import type { UnitsPref } from '../utils/units'

withDefaults(defineProps<{
  profiles: Record<string, VwpLevel[]>
  window: string[]
  joined: string | null
  error?: string | null
  empty?: boolean
  units?: UnitsPref
  clock?: ClockPref
}>(), { units: 'imperial', clock: 'utc', error: null })

const emit = defineEmits<{
  close: []
}>()

const TABS = [
  { id: 'chart', label: 'Gráfico' },
  { id: 'table', label: 'Datos' },
]

const modal = ref<{ open: () => void, close: () => void }>()

defineExpose({
  open: () => modal.value?.open(),
  close: () => modal.value?.close(),
})
</script>

<template>
  <TabModal
    ref="modal"
    title="Perfil de viento (VWP)"
    testid-prefix="vwp-modal"
    :tabs="TABS"
    @close="emit('close')"
  >
    <template #chart>
      <p v-if="error" data-testid="vwp-error" class="rounded bg-amber-900/40 p-3 text-sm text-amber-200">
        Error consultando el VWP: {{ error }}
      </p>
      <p
        v-else-if="empty || window.length === 0"
        data-testid="vwp-empty"
        class="rounded bg-slate-800 p-3 text-sm text-slate-400"
      >
        Sin perfil de viento hasta este instante del día.
      </p>
      <VwpChart
        v-else
        :profiles="profiles"
        :window="window"
        :joined="joined"
        :units="units"
        :clock="clock"
      />
    </template>
    <template #table>
      <p v-if="error" data-testid="vwp-error" class="rounded bg-amber-900/40 p-3 text-sm text-amber-200">
        Error consultando el VWP: {{ error }}
      </p>
      <p
        v-else-if="empty || window.length === 0"
        data-testid="vwp-empty"
        class="rounded bg-slate-800 p-3 text-sm text-slate-400"
      >
        Sin perfil de viento hasta este instante del día.
      </p>
      <VwpTable
        v-else
        :profiles="profiles"
        :joined="joined"
        :units="units"
      />
    </template>
  </TabModal>
</template>
