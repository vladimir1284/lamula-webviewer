<script setup lang="ts">
defineProps<{
  playing: boolean
  /** la región timeline tiene frames cargados (fuera de 'idle') */
  ready: boolean
  currentVolTime: string | null
  bufferReady: number
  bufferTotal: number
}>()

defineEmits<{ toggle: [] }>()
</script>

<template>
  <div v-if="ready" class="flex items-center gap-2 text-sm">
    <button
      type="button"
      data-testid="anim-play"
      class="rounded bg-slate-700 px-3 py-1 hover:bg-slate-600"
      @click="$emit('toggle')"
    >
      {{ playing ? '⏸' : '▶' }}
    </button>
    <span data-testid="anim-frame-label" class="font-mono text-slate-300">
      {{ currentVolTime ? `${currentVolTime}Z` : '—' }}
    </span>
    <span
      v-if="bufferReady < bufferTotal"
      data-testid="anim-buffer"
      class="text-xs text-slate-400"
    >
      buffer {{ bufferReady }}/{{ bufferTotal }}
    </span>
  </div>
</template>
