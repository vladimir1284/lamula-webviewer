<script setup lang="ts">
const emit = defineEmits<{
  open: []
  later: []
  never: []
}>()
</script>

<template>
  <div
    data-testid="feedback-nudge"
    class="pointer-events-auto absolute bottom-28 right-4 z-30 w-72 rounded-xl border border-slate-700 bg-slate-900/95 p-4 text-slate-100 shadow-xl backdrop-blur md:right-8"
  >
    <div class="flex items-start justify-between gap-2">
      <h3 class="text-xs font-bold text-teal-400 uppercase tracking-wider">
        ¿Qué te parece el visor?
      </h3>
      <button
        type="button"
        class="text-slate-500 hover:text-slate-300"
        @click="emit('later')"
      >
        ✕
      </button>
    </div>

    <p class="mt-1 text-xs text-slate-300">
      Tu opinión como meteorólogo o especialista nos ayuda a mejorar el servicio.
    </p>

    <div class="mt-3 flex items-center gap-2">
      <button
        type="button"
        data-testid="nudge-action-open"
        class="rounded bg-teal-600 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-teal-500"
        @click="emit('open')"
      >
        Dejar opinión
      </button>

      <button
        type="button"
        data-testid="nudge-action-later"
        class="rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
        @click="emit('later')"
      >
        Más tarde
      </button>

      <button
        type="button"
        data-testid="nudge-action-never"
        class="text-xs text-slate-500 hover:underline"
        @click="emit('never')"
      >
        No, gracias
      </button>
    </div>
  </div>
</template>
