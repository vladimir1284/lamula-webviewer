<script setup lang="ts">
// Ventana de retención de 72h explícita (decisión 11): 3-4 botones de día
// UTC en vez de un calendario — dayWindow72h ya resuelve qué días existen.
defineProps<{
  days: string[]
  modelValue: string
}>()

defineEmits<{
  'update:modelValue': [day: string]
}>()
</script>

<template>
  <div data-testid="day-picker" class="flex flex-wrap gap-1" role="group" aria-label="Día (UTC)">
    <button
      v-for="day in days"
      :key="day"
      type="button"
      :data-testid="`day-option-${day}`"
      :aria-pressed="day === modelValue"
      class="rounded px-2 py-1 text-xs font-mono transition-colors"
      :class="day === modelValue
        ? 'bg-slate-100 text-slate-900'
        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'"
      @click="$emit('update:modelValue', day)"
    >
      {{ day }} UTC
    </button>
  </div>
</template>
