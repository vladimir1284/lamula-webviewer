<script setup lang="ts">
// Leyenda dibujada desde la MISMA paleta que colorea el raster (decisión 4:
// la paleta es fuente única para raster y leyenda).
import { computed } from 'vue'
import type { Palette } from '#shared/products'
import type { UnitsPref } from '../utils/units'
import { convertRasterValue, rasterUnitLabel } from '../utils/units'

const props = withDefaults(
  defineProps<{ palette: Palette, units?: UnitsPref }>(),
  { units: 'imperial' },
)

// solo el TEXTO del tick se convierte (D28): la geometría x(value) sigue
// posicionando con el valor crudo en unidades de paleta
const unitLabel = computed(() => rasterUnitLabel(props.palette.unit, props.units))
const tickLabel = (tick: number) =>
  props.units === 'si'
    ? convertRasterValue(tick, props.palette.unit, 'si').value.toFixed(0)
    : String(tick)

const W = 320
const BAR_X = 8
const BAR_W = W - BAR_X * 2
const BAR_Y = 4
const BAR_H = 14

const domain = computed(() => {
  const stops = props.palette.stops
  const min = stops[0]?.[0] ?? 0
  const last = stops[stops.length - 1]?.[0] ?? 1
  // en modo steps el último color ocupa un tramo final del ~7 %
  const max = props.palette.mode === 'steps' ? last + (last - min) * 0.07 : last
  return { min, max: max === min ? min + 1 : max }
})

function x(value: number): number {
  const { min, max } = domain.value
  return BAR_X + ((value - min) / (max - min)) * BAR_W
}

const stepRects = computed(() =>
  props.palette.mode !== 'steps'
    ? []
    : props.palette.stops.map(([value, color], i) => {
        const next = props.palette.stops[i + 1]?.[0]
        const x0 = x(value)
        const x1 = next === undefined ? BAR_X + BAR_W : x(next)
        return { x: x0, width: x1 - x0, color }
      }),
)

const gradientStops = computed(() =>
  props.palette.mode !== 'interpolated'
    ? []
    : props.palette.stops.map(([value, color]) => ({
        offset: `${(((value - domain.value.min) / (domain.value.max - domain.value.min)) * 100).toFixed(2)}%`,
        color,
      })),
)
</script>

<template>
  <figure data-testid="legend">
    <svg
      :viewBox="`0 0 ${W} 46`"
      class="w-full"
      role="img"
      :aria-label="`Leyenda (${unitLabel})`"
    >
      <defs v-if="palette.mode === 'interpolated'">
        <linearGradient id="legend-ramp" x1="0" y1="0" x2="1" y2="0">
          <stop
            v-for="(s, i) in gradientStops"
            :key="i"
            :offset="s.offset"
            :stop-color="s.color"
          />
        </linearGradient>
      </defs>

      <rect
        v-if="palette.mode === 'interpolated'"
        :x="BAR_X"
        :y="BAR_Y"
        :width="BAR_W"
        :height="BAR_H"
        fill="url(#legend-ramp)"
      />
      <rect
        v-for="(r, i) in stepRects"
        :key="i"
        :x="r.x"
        :y="BAR_Y"
        :width="r.width"
        :height="BAR_H"
        :fill="r.color"
      />

      <g v-for="tick in palette.ticks" :key="tick">
        <line
          :x1="x(tick)"
          :x2="x(tick)"
          :y1="BAR_Y"
          :y2="BAR_Y + BAR_H + 4"
          stroke="currentColor"
          stroke-width="1"
        />
        <text
          :x="x(tick)"
          :y="BAR_Y + BAR_H + 16"
          text-anchor="middle"
          font-size="10"
          fill="currentColor"
        >{{ tickLabel(tick) }}</text>
      </g>
      <text :x="W - BAR_X" y="44" text-anchor="end" font-size="10" fill="currentColor" opacity="0.7">
        {{ unitLabel }}
      </text>
    </svg>

    <figcaption v-if="palette.rangeFoldedColor" class="mt-1 flex items-center gap-1.5 text-xs opacity-80">
      <span
        class="inline-block h-3 w-3 rounded-sm"
        :style="{ backgroundColor: palette.rangeFoldedColor }"
      />
      RF — range folded
    </figcaption>
  </figure>
</template>
