<script setup lang="ts">
// Panel derecho colapsable (D26): rail de tabs siempre visible; el
// contenido (slots por tab) solo con panel abierto. El estado vive en la
// URL (?panel — D23): esto solo emite, viewerMachine navega.
import type { PanelId } from '../machines/overlay'

const props = defineProps<{
  panel: PanelId | null
}>()

const emit = defineEmits<{
  select: [panel: PanelId | null]
}>()

const TABS: { id: PanelId, label: string }[] = [
  { id: 'cells', label: 'Celdas' },
  { id: 'trend', label: 'Tendencia' },
  { id: 'vwp', label: 'VWP' },
]

function onTab(id: PanelId) {
  emit('select', props.panel === id ? null : id)
}
</script>

<template>
  <div class="flex h-full">
    <div class="flex w-9 shrink-0 flex-col gap-1 border-l border-slate-700 bg-slate-900 py-2">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        :data-testid="`panel-tab-${tab.id}`"
        class="rounded px-1 py-3 text-xs [writing-mode:vertical-rl]"
        :class="panel === tab.id
          ? 'bg-slate-700 text-slate-100'
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'"
        @click="onTab(tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>
    <aside
      v-if="panel"
      data-testid="side-panel"
      class="w-96 shrink-0 overflow-y-auto border-l border-slate-700 bg-slate-900 p-3"
    >
      <slot :name="panel" />
    </aside>
  </div>
</template>
