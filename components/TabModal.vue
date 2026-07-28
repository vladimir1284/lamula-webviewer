<script setup lang="ts">
// Modal genérico con tabs (D35/D36) — <dialog> nativo, mismo patrón sin
// librería que PrefsDialog/TimelineMenu (showModal()/close(), sin PrimeVue).
// `active` es un v-model opcional (D36): si el padre lo bindea (DataModal,
// para poder cambiar de tab con el modal ya abierto sin pasar por open()),
// open() respeta ese valor en vez de resetear a tabs[0] — evita el flash de
// la primera tab. Si nadie lo bindea, se comporta como antes (reset a
// tabs[0] en cada open()).
import { ref, watch } from 'vue'

const props = defineProps<{
  title: string
  tabs: { id: string, label: string }[]
  testidPrefix: string
  active?: string
}>()

const emit = defineEmits<{
  close: []
  'update:active': [id: string]
}>()

const dialog = ref<HTMLDialogElement>()
const internalActive = ref(props.active ?? props.tabs[0]?.id)

watch(() => props.active, (value) => {
  if (value !== undefined) internalActive.value = value
})

function setActive(id: string) {
  internalActive.value = id
  emit('update:active', id)
}

defineExpose({
  open: () => {
    if (props.active === undefined) internalActive.value = props.tabs[0]?.id
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
        :class="internalActive === tab.id
          ? 'bg-slate-900 text-slate-100'
          : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'"
        @click="setActive(tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="max-h-[80vh] overflow-y-auto p-3">
      <slot :name="internalActive" />
    </div>
  </dialog>
</template>
