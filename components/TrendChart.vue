<script setup lang="ts">
// Tendencia de la celda seleccionada: dBZ máx y altura vs vol_time, SVG
// propio (D25 — cero librería de charts). Huecos donde falte la clave
// (GAB pagina de a 6): la línea se corta, no se interpola.
import { computed } from 'vue'
import type { Phenomenon } from '#shared/contract'
import { stormCellAttrs } from '#shared/contract'
import { linearScale } from '../utils/charts/scale'

const props = defineProps<{
  /** serie cross-volumen de /api/phenomena/series, o null */
  series: Phenomenon[] | null
  cellId: string | null
  error?: string | null
}>()

const W = 340
const H = 110
const PAD = { left: 34, right: 8, top: 8, bottom: 18 }

interface ChartModel {
  title: string
  unit: string
  /** segmentos de polyline (la línea se corta en los huecos) */
  segments: string[]
  points: { x: number, y: number, missing: false }[]
  yTicks: { y: number, label: string }[]
  xLabels: { x: number, label: string }[]
}

const cells = computed(() =>
  (props.series ?? []).filter(p => p.kind === 'storm_cell'),
)

function buildChart(title: string, unit: string, pick: (a: ReturnType<typeof stormCellAttrs>) => number | undefined): ChartModel | null {
  const serie = cells.value
  if (serie.length === 0) return null
  const values = serie.map(p => pick(stormCellAttrs(p.attrs)) ?? null)
  const defined = values.filter((v): v is number => v !== null)
  if (defined.length === 0) return null

  const x = linearScale([0, Math.max(1, serie.length - 1)], [PAD.left, W - PAD.right])
  const y = linearScale(
    [Math.min(...defined), Math.max(...defined)],
    [H - PAD.bottom, PAD.top],
  )

  const segments: string[] = []
  let current: string[] = []
  const points: ChartModel['points'] = []
  values.forEach((v, i) => {
    if (v === null) {
      if (current.length > 1) segments.push(current.join(' '))
      current = []
      return
    }
    const px = x.map(i)
    const py = y.map(v)
    points.push({ x: px, y: py, missing: false })
    current.push(`${px.toFixed(1)},${py.toFixed(1)}`)
  })
  if (current.length > 1) segments.push(current.join(' '))

  const hhmm = (iso: string) => iso.slice(11, 16)
  return {
    title,
    unit,
    segments,
    points,
    yTicks: y.ticks(3).map(t => ({ y: y.map(t), label: String(t) })),
    xLabels: [
      { x: x.map(0), label: hhmm(serie[0]!.vol_time) },
      { x: x.map(serie.length - 1), label: hhmm(serie.at(-1)!.vol_time) },
    ],
  }
}

const charts = computed(() => {
  const list = [
    buildChart('dBZ máx', 'dBZ', a => a.dbz_max),
    buildChart('Altura del máx', 'kft', a => a.dbz_max_height_kft),
  ]
  return list.filter((c): c is ChartModel => c !== null)
})
</script>

<template>
  <div class="text-sm">
    <h2 class="mb-2 font-semibold">
      Tendencia <span v-if="cellId" class="font-mono text-yellow-200">{{ cellId }}</span>
    </h2>
    <p v-if="error" data-testid="trend-error" class="rounded bg-amber-900/40 p-3 text-amber-200">
      Error consultando la serie: {{ error }}
    </p>
    <p
      v-else-if="!cellId"
      data-testid="trend-no-cell"
      class="rounded bg-slate-800 p-3 text-slate-400"
    >
      Selecciona una celda en el mapa o en la tabla.
    </p>
    <p
      v-else-if="charts.length === 0"
      data-testid="trend-empty"
      class="rounded bg-slate-800 p-3 text-slate-400"
    >
      La serie de esta celda no trae dBZ máx (GAB pagina de a 6 celdas).
    </p>
    <template v-else>
      <figure
        v-for="chart in charts"
        :key="chart.title"
        data-testid="trend-chart"
        class="mb-3 rounded bg-slate-800 p-2"
      >
        <figcaption class="mb-1 text-xs text-slate-400">
          {{ chart.title }} ({{ chart.unit }})
        </figcaption>
        <svg :viewBox="`0 0 ${W} ${H}`" class="w-full">
          <g v-for="tick in chart.yTicks" :key="tick.label">
            <line
              :x1="PAD.left" :x2="W - PAD.right" :y1="tick.y" :y2="tick.y"
              stroke="rgba(148,163,184,0.2)"
            />
            <text
              :x="PAD.left - 4" :y="tick.y + 3"
              text-anchor="end" font-size="9" fill="#94a3b8"
            >{{ tick.label }}</text>
          </g>
          <polyline
            v-for="(seg, i) in chart.segments"
            :key="i"
            :points="seg"
            fill="none"
            stroke="#facc15"
            stroke-width="1.5"
          />
          <circle
            v-for="(p, i) in chart.points"
            :key="i"
            :cx="p.x" :cy="p.y" r="2.5"
            fill="#facc15"
            data-testid="trend-point"
          />
          <text
            v-for="label in chart.xLabels"
            :key="label.label + label.x"
            :x="label.x" :y="H - 5"
            text-anchor="middle" font-size="9" fill="#94a3b8"
          >{{ label.label }}Z</text>
        </svg>
      </figure>
    </template>
  </div>
</template>
