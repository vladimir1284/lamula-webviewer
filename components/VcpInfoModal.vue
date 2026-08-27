<script setup lang="ts">
// Modal de ayuda sobre el VCP activo, abierto desde RadarProductChip.vue.
// Mismo patrón sin librería que PrefsDialog (<dialog> nativo).
import { computed, ref } from 'vue'
import { VCP_SOURCE_URL, vcpInfo } from '#shared/vcp'

const props = defineProps<{
  vcp: number | null
}>()

const dialog = ref<HTMLDialogElement>()
const info = computed(() => vcpInfo(props.vcp))

defineExpose({
  open: () => dialog.value?.showModal(),
})
</script>

<template>
  <dialog
    ref="dialog"
    data-testid="vcp-info-modal"
    aria-labelledby="vcp-info-title"
    class="w-96 max-w-[95vw] rounded-lg border border-slate-600 bg-slate-800 p-0 text-slate-100 backdrop:bg-slate-950/60"
  >
    <div class="flex items-center justify-between border-b border-slate-700 px-4 py-2">
      <h2 id="vcp-info-title" class="text-sm font-bold">
        VCP {{ vcp }}<template v-if="info"> — {{ info.name }}</template>
      </h2>
      <button
        data-testid="vcp-info-close"
        aria-label="Cerrar"
        class="rounded px-2 py-1 text-slate-400 hover:bg-slate-700 hover:text-slate-100"
        @click="dialog?.close()"
      >
        ✕
      </button>
    </div>

    <div class="space-y-3 p-4 text-sm">
      <template v-if="info">
        <dl class="grid grid-cols-2 gap-1 rounded bg-slate-900/60 p-2 text-xs">
          <dt class="text-slate-400">Grupo</dt>
          <dd class="font-mono">{{ info.group }}</dd>
          <dt class="text-slate-400">Elevaciones</dt>
          <dd class="font-mono">{{ info.elevations }}</dd>
          <dt class="text-slate-400">Duración del volumen</dt>
          <dd class="font-mono">{{ info.scanMinutes }} min</dd>
        </dl>
        <p>{{ info.description }}</p>
      </template>
      <p v-else data-testid="vcp-info-unknown" class="rounded bg-amber-900/40 p-3 text-amber-200">
        No tenemos una descripción adaptada para el VCP {{ vcp }}. Puede ser un patrón nuevo,
        experimental, o de un radar que no es un WSR-88D estándar.
      </p>

      <p class="text-xs text-slate-400">
        Fuente:
        <a :href="VCP_SOURCE_URL" target="_blank" rel="noopener" class="text-teal-400 hover:underline">
          Leer más en NOAA JetStream
        </a>
      </p>
    </div>
  </dialog>
</template>
