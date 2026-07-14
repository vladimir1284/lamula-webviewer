<script setup lang="ts">
// Strip proporcional al tiempo del día cargado: un tick por vol_time,
// huecos marcados (decisión: datos faltantes se marcan, no se ocultan),
// stepping local (utils/timeline/gaps.ts calcula los huecos; el stepping
// en sí vive en viewerMachine — este componente solo emite intención).
import { computed } from 'vue'
import { naiveUtcToEpochMs } from '#shared/contract'
import type { Gap } from '../utils/timeline/gaps'

const props = defineProps<{
  times: string[]
  current: string | null
  gaps: Gap[]
  canPrev: boolean
  canNext: boolean
}>()

const emit = defineEmits<{
  select: [iso: string]
  step: [dir: 1 | -1]
}>()

const range = computed(() => {
  const first = props.times[0]
  const last = props.times.at(-1)
  if (!first || !last) return null
  const start = naiveUtcToEpochMs(first)
  const end = naiveUtcToEpochMs(last)
  return { start, end: end === start ? start + 1 : end }
})

function pct(iso: string): number {
  if (!range.value) return 0
  const { start, end } = range.value
  return ((naiveUtcToEpochMs(iso) - start) / (end - start)) * 100
}

const gapBands = computed(() =>
  props.gaps.map(g => ({
    left: pct(g.after),
    width: pct(g.before) - pct(g.after),
    key: `${g.after}-${g.before}`,
  })),
)
</script>

<template>
  <div data-testid="timeline" class="flex items-center gap-2">
    <button
      type="button"
      data-testid="timeline-prev"
      :disabled="!canPrev"
      class="rounded px-2 py-1 text-xs disabled:opacity-30"
      :class="canPrev ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800'"
      aria-label="Volumen anterior"
      @click="emit('step', -1)"
    >
      ←
    </button>

    <div class="relative h-6 flex-1 rounded bg-slate-800">
      <div
        v-for="band in gapBands"
        :key="band.key"
        data-testid="timeline-gap"
        class="absolute inset-y-0 bg-[repeating-linear-gradient(45deg,rgba(245,158,11,0.35)_0_4px,transparent_4px_8px)]"
        :style="{ left: `${band.left}%`, width: `${band.width}%` }"
      />
      <button
        v-for="time in times"
        :key="time"
        type="button"
        data-testid="timeline-tick"
        :data-time="time"
        :aria-current="time === current"
        class="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors"
        :class="time === current
          ? 'bg-slate-100'
          : 'bg-slate-500 hover:bg-slate-300'"
        :style="{ left: `${pct(time)}%` }"
        :title="`${time}Z`"
        @click="emit('select', time)"
      />
    </div>

    <button
      type="button"
      data-testid="timeline-next"
      :disabled="!canNext"
      class="rounded px-2 py-1 text-xs disabled:opacity-30"
      :class="canNext ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800'"
      aria-label="Volumen siguiente"
      @click="emit('step', 1)"
    >
      →
    </button>
  </div>
</template>
