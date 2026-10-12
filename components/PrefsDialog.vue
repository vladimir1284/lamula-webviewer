<script setup lang="ts">
// Diálogo de preferencias de display (D28). <dialog> nativo — showModal()
// da top-layer, focus-trap y Esc sin librería (PrimeVue sigue sin uso, D26).
// Stateless: cada control emite el patch al instante (efecto en vivo, sin
// Guardar/Cancelar); el estado vive en viewerMachine y persiste vía SET_PREF.
import { ref } from 'vue'
import type { UserPrefsSlice } from '../machines/viewer'

// El idioma NO viaja en `lamula:prefs`: lo posee la URL (prefijo `/en`) con la
// cookie `lamula_i18n` como memoria, igual que el resto del estado de UI (D23).
// Duplicarlo en localStorage daría dos fuentes de verdad que se desincronizan.
// `setLocale` navega, así que el <dialog> se cierra al cambiar — querido: el
// usuario ve el chrome ya traducido detrás.
const { t, locale, locales, setLocale } = useI18n()

defineProps<{
  coverage: boolean
  units: 'imperial' | 'si'
  clock: 'utc' | 'local'
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
    class="w-80 rounded-lg border border-slate-500 bg-slate-800 p-0 text-slate-100 backdrop:bg-slate-950/60"
  >
    <form method="dialog">
      <div class="flex items-center justify-between border-b border-slate-700 px-4 py-2">
        <h2 id="prefs-title" class="text-sm font-bold">{{ t('prefs.title') }}</h2>
        <button
          data-testid="prefs-close"
          :aria-label="t('common.close')"
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
          <span>{{ t('prefs.coverage') }}</span>
        </label>

        <fieldset class="rounded bg-slate-900/60 p-3">
          <legend class="px-1 text-slate-400">{{ t('locale.legend') }}</legend>
          <label
            v-for="l in locales"
            :key="l.code"
            class="mt-1 flex items-center gap-2 first:mt-0"
          >
            <input
              type="radio"
              name="pref-locale"
              :data-testid="`pref-locale-${l.code}`"
              :checked="locale === l.code"
              @change="setLocale(l.code)"
            >
            <span>{{ l.name }}</span>
          </label>
        </fieldset>

        <fieldset class="rounded bg-slate-900/60 p-3">
          <legend class="px-1 text-slate-400">{{ t('prefs.units.legend') }}</legend>
          <label class="flex items-center gap-2">
            <input
              type="radio"
              name="pref-units"
              data-testid="pref-units-imperial"
              :checked="units === 'imperial'"
              @change="emit('setPref', { units: 'imperial' })"
            >
            <span>{{ t('prefs.units.imperial') }}</span>
          </label>
          <label class="mt-1 flex items-center gap-2">
            <input
              type="radio"
              name="pref-units"
              data-testid="pref-units-si"
              :checked="units === 'si'"
              @change="emit('setPref', { units: 'si' })"
            >
            <span>{{ t('prefs.units.si') }}</span>
          </label>
        </fieldset>

        <fieldset class="rounded bg-slate-900/60 p-3">
          <legend class="px-1 text-slate-400">{{ t('prefs.clock.legend') }}</legend>
          <label class="flex items-center gap-2">
            <input
              type="radio"
              name="pref-clock"
              data-testid="pref-clock-local"
              :checked="clock === 'local'"
              @change="emit('setPref', { clock: 'local' })"
            >
            <span>{{ t('prefs.clock.local') }}</span>
          </label>
          <label class="mt-1 flex items-center gap-2">
            <input
              type="radio"
              name="pref-clock"
              data-testid="pref-clock-utc"
              :checked="clock === 'utc'"
              @change="emit('setPref', { clock: 'utc' })"
            >
            <span>{{ t('prefs.clock.utc') }}</span>
          </label>
          <p class="mt-2 text-xs text-slate-400">
            {{ t('prefs.clock.note') }}
          </p>
        </fieldset>
      </div>
    </form>
  </dialog>
</template>
