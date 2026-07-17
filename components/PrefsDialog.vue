<script setup lang="ts">
// Diálogo de preferencias de display (D28). <dialog> nativo — showModal()
// da top-layer, focus-trap y Esc sin librería (PrimeVue sigue sin uso, D26).
// Stateless: cada control emite el patch al instante (efecto en vivo, sin
// Guardar/Cancelar); el estado vive en viewerMachine y persiste vía SET_PREF.
import { ref } from 'vue'
import type { UserPrefsSlice } from '../machines/viewer'

defineProps<{
  coverage: boolean
  units: 'imperial' | 'si'
  clock: 'utc' | 'local'
  animationFrames: number
}>()

const emit = defineEmits<{
  setPref: [patch: Partial<UserPrefsSlice>]
}>()

const dialog = ref<HTMLDialogElement>()

defineExpose({
  open: () => dialog.value?.showModal(),
})
</script>

<template>
  <dialog
    ref="dialog"
    data-testid="prefs-dialog"
    aria-labelledby="prefs-title"
    class="w-80 rounded-lg border border-slate-600 bg-slate-800 p-0 text-slate-100 backdrop:bg-slate-950/60"
  >
    <form method="dialog">
      <div class="flex items-center justify-between border-b border-slate-700 px-4 py-2">
        <h2 id="prefs-title" class="text-sm font-bold">Preferencias</h2>
        <button
          data-testid="prefs-close"
          aria-label="Cerrar"
          class="rounded px-2 py-1 text-slate-400 hover:bg-slate-700 hover:text-slate-100"
        >
          ✕
        </button>
      </div>

      <div class="space-y-4 p-4 text-sm">
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            data-testid="pref-coverage"
            :checked="coverage"
            @change="emit('setPref', { coverage: ($event.target as HTMLInputElement).checked })"
          >
          <span>Mostrar alcance del radar</span>
        </label>

        <fieldset class="rounded bg-slate-900/60 p-3">
          <legend class="px-1 text-slate-400">Unidades</legend>
          <label class="flex items-center gap-2">
            <input
              type="radio"
              name="pref-units"
              data-testid="pref-units-imperial"
              :checked="units === 'imperial'"
              @change="emit('setPref', { units: 'imperial' })"
            >
            <span>Aeronáuticas (kt, kft)</span>
          </label>
          <label class="mt-1 flex items-center gap-2">
            <input
              type="radio"
              name="pref-units"
              data-testid="pref-units-si"
              :checked="units === 'si'"
              @change="emit('setPref', { units: 'si' })"
            >
            <span>Sistema internacional (km/h, km)</span>
          </label>
        </fieldset>

        <fieldset class="rounded bg-slate-900/60 p-3">
          <legend class="px-1 text-slate-400">Hora</legend>
          <label class="flex items-center gap-2">
            <input
              type="radio"
              name="pref-clock"
              data-testid="pref-clock-local"
              :checked="clock === 'local'"
              @change="emit('setPref', { clock: 'local' })"
            >
            <span>Local (tu zona horaria)</span>
          </label>
          <label class="mt-1 flex items-center gap-2">
            <input
              type="radio"
              name="pref-clock"
              data-testid="pref-clock-utc"
              :checked="clock === 'utc'"
              @change="emit('setPref', { clock: 'utc' })"
            >
            <span>UTC</span>
          </label>
          <p class="mt-2 text-xs text-slate-400">
            Los días de la timeline siguen siendo UTC.
          </p>
        </fieldset>

        <fieldset class="rounded bg-slate-900/60 p-3">
          <legend class="px-1 text-slate-400">Animación</legend>
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
        </fieldset>
      </div>
    </form>
  </dialog>
</template>
