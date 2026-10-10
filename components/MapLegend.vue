<script setup lang="ts">
// Leyenda dibujada desde la MISMA paleta que colorea el raster (decisión 4:
// la paleta es fuente única para raster y leyenda). La geometría vive en
// `utils/export/legend-geometry.ts` para que el chrome del export (F7) dibuje
// exactamente la misma leyenda en Canvas2D sin duplicar la matemática.
import { computed } from 'vue'
import type { Palette } from '#shared/products'
import type { UnitsPref } from '../utils/units'
import { legendGeometry } from '../utils/export/legend-geometry'

const props = withDefaults(
  defineProps<{ palette: Palette, units?: UnitsPref }>(),
  { units: 'imperial' },
)

const g = computed(() => legendGeometry(props.palette, props.units))
const gradientStops = computed(() =>
  g.value.gradient.map(s => ({ offset: `${(s.offset * 100).toFixed(2)}%`, color: s.color })),
)
</script>

<template>
  <figure data-testid="legend">
    <svg
      :viewBox="`0 0 ${g.width} ${g.height}`"
      class="w-full"
      role="img"
      :aria-label="`Leyenda (${g.unitLabel})`"
    >
      <defs v-if="g.mode === 'interpolated'">
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
        v-if="g.mode === 'interpolated'"
        :x="g.barX"
        :y="g.barY"
        :width="g.barW"
        :height="g.barH"
        fill="url(#legend-ramp)"
      />
      <rect
        v-for="(r, i) in g.rects"
        :key="i"
        :x="r.x"
        :y="g.barY"
        :width="r.width"
        :height="g.barH"
        :fill="r.color"
      />

      <g v-for="(tick, i) in g.ticks" :key="i">
        <line
          :x1="tick.x"
          :x2="tick.x"
          :y1="g.tickLineY1"
          :y2="g.tickLineY2"
          stroke="currentColor"
          stroke-width="1"
        />
        <text
          v-if="tick.showLabel"
          :x="tick.x"
          :y="g.tickLabelY"
          text-anchor="middle"
          :font-size="g.tickFontSize"
          fill="currentColor"
        >{{ tick.label }}</text>
      </g>
      <text
        :x="g.unitX"
        :y="g.unitY"
        text-anchor="end"
        :font-size="g.unitFontSize"
        fill="currentColor"
        opacity="0.7"
      >
        {{ g.unitLabel }}
      </text>
    </svg>

    <figcaption v-if="g.rangeFoldedColor" class="mt-1 flex items-center gap-1.5 text-xs opacity-80">
      <span
        class="inline-block h-3 w-3 rounded-sm"
        :style="{ backgroundColor: g.rangeFoldedColor }"
      />
      RF — range folded
    </figcaption>
  </figure>
</template>
