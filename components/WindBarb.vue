<script setup lang="ts">
// Átomo SVG de una barba de viento WMO: pinta barbSegments (matemática
// pura en utils/wind/barb.ts, y-norte → aquí se invierte y para pantalla).
import { computed } from 'vue'
import { barbSegments, barbSpec } from '../utils/wind/barb'

const props = withDefaults(defineProps<{
  dirDeg: number
  speedKt: number
  /** largo del asta en px del viewBox local */
  size?: number
  color?: string
}>(), { size: 22, color: '#e2e8f0' })

const model = computed(() => barbSegments(barbSpec(props.speedKt), props.dirDeg, props.size))
// y-norte (matemática) → y-abajo (SVG)
const flip = (y: number) => -y
</script>

<template>
  <g data-testid="wind-barb">
    <circle
      v-if="model.calm"
      :r="size * 0.18"
      fill="none"
      :stroke="color"
      stroke-width="1.2"
      data-testid="barb-calm"
    />
    <template v-else>
      <line
        v-for="(l, i) in model.lines"
        :key="`l${i}`"
        :x1="l[0]" :y1="flip(l[1])" :x2="l[2]" :y2="flip(l[3])"
        :stroke="color"
        stroke-width="1.2"
        data-testid="barb-line"
      />
      <polygon
        v-for="(t, i) in model.triangles"
        :key="`t${i}`"
        :points="`${t[0]},${flip(t[1])} ${t[2]},${flip(t[3])} ${t[4]},${flip(t[5])}`"
        :fill="color"
        data-testid="barb-pennant"
      />
    </template>
  </g>
</template>
