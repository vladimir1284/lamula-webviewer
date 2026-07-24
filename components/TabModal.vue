<script setup lang="ts">
// Modal genérico con tabs (D35) — <dialog> nativo, mismo patrón sin librería
// que PrefsDialog/TimelineMenu (showModal()/close(), sin PrimeVue). Reusado
// por VwpModal hoy; pensado para la tendencia de celda seleccionada mañana.
import { ref } from 'vue'

const props = defineProps<{
  title: string
  tabs: { id: string, label: string }[]
  testidPrefix: string
}>()

const emit = defineEmits<{
  close: []
}>()

const dialog = ref<HTMLDialogElement>()
const active = ref(props.tabs[0]?.id)

defineExpose({
  open: () => {
    active.value = props.tabs[0]?.id
    dialog.value?.showModal()
  },
  close: () => dialog.value?.close(),
})
</script>

<template>
  <dialog
    ref="dialog"
    :data-testid="testidPrefix"
    :aria-labelledby="`${testidPrefix}-title`"
    class="w-[40rem] max-w-[95vw] rounded-lg border border-slate-600 bg-slate-800 p-0 text-slate-100 backdrop:bg-slate-950/60"
    @close="emit('close')"
  >
    <div class="flex items-center justify-between border-b border-slate-700 px-4 py-2">
      <h2 :id="`${testidPrefix}-title`" class="text-sm font-bold">
        {{ title }}
      </h2>
      <button
        :data-testid="`${testidPrefix}-close`"
        aria-label="Cerrar"
        class="rounded px-2 py-1 text-slate-400 hover:bg-slate-700 hover:text-slate-100"
        @click="dialog?.close()"
      >
        ✕
      </button>
    </div>

    <div class="flex gap-1 border-b border-slate-700 px-2 pt-2">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :data-testid="`${testidPrefix}-tab-${tab.id}`"
        class="rounded-t px-3 py-1.5 text-sm"
        :class="active === tab.id
          ? 'bg-slate-900 text-slate-100'
          : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'"
        @click="active = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="max-h-[80vh] overflow-y-auto p-3">
      <slot :name="active" />
    </div>
  </dialog>
</template>
