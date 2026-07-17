<script setup lang="ts">
// Menú del botón ☰ de TimelineStrip (D28/F3): a diferencia de PrefsDialog
// (preferencias de display generales), este panel es exclusivo de la
// animación — cantidad de observaciones (pref persistida, antes vivía en
// PrefsDialog) y velocidad (estado efímero de animationMachine, no se
// guarda en prefs). Mismo patrón <dialog> nativo, stateless.
import { ref } from 'vue'
import type { UserPrefsSlice } from '../machines/viewer'

defineProps<{
  animationFrames: number
  speed: number
}>()

const emit = defineEmits<{
  setPref: [patch: Partial<UserPrefsSlice>]
  speed: [value: number]
}>()

const SPEEDS = [0.5, 1, 2]

const dialog = ref<HTMLDialogElement>()

defineExpose({
  open: () => dialog.value?.showModal(),
})
</script>

<template>
  <dialog
    ref="dialog"
    data-testid="timeline-menu-dialog"
    aria-labelledby="timeline-menu-title"
    class="w-72 rounded-lg border border-slate-600 bg-slate-800 p-0 text-slate-100 backdrop:bg-slate-950/60"
  >
    <form method="dialog">
      <div class="flex items-center justify-between border-b border-slate-700 px-4 py-2">
        <h2 id="timeline-menu-title" class="text-sm font-bold">Animación</h2>
        <button
          data-testid="timeline-menu-close"
          aria-label="Cerrar"
          class="rounded px-2 py-1 text-slate-400 hover:bg-slate-700 hover:text-slate-100"
        >
          ✕
        </button>
      </div>

      <div class="space-y-4 p-4 text-sm">
        <label class="flex items-center gap-2">
          <span class="w-32">Observaciones:</span>
          <select
            data-testid="pref-animation-frames"
            class="rounded border border-slate-600 bg-slate-800 px-2 py-1 flex-1"
            :value="String(animationFrames)"
            @change="emit('setPref', { animationFrames: Number(($event.target as HTMLSelectElement).value) })"
          >
            <option value="6">6</option>
            <option value="12">12</option>
            <option value="24">24</option>
            <option value="48">48</option>
          </select>
        </label>

        <fieldset class="rounded bg-slate-900/60 p-3">
          <legend class="px-1 text-slate-400">Velocidad</legend>
          <label v-for="s in SPEEDS" :key="s" class="flex items-center gap-2">
            <input
              type="radio"
              name="timeline-menu-speed"
              :data-testid="`timeline-menu-speed-${s}`"
              :checked="speed === s"
              @change="emit('speed', s)"
            >
            <span>{{ s }}x</span>
          </label>
        </fieldset>
      </div>
    </form>
  </dialog>
</template>
