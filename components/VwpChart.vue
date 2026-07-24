<script setup lang="ts">
// Grid altura × tiempo de barbas WMO del VWP (F4), extraído de VwpPanel
// (D35 — ahora vive en el tab "Gráfico" de VwpModal). ≤12 perfiles del día
// hasta el frame, columna del volumen casado resaltada. SVG propio (D25).
// Color de barba por calidad: rms_kt alto → ámbar, null → gris.
// Un poco más espacioso que la versión del aside (D35): el ancho ya escala
// con window.length vía xOf, así que en el modal (más ancho que los 384px
// del aside viejo) las columnas quedan más separadas solo por tener más
// espacio real; W/H y el tamaño de barba también suben un poco.
import { computed } from 'vue'
import type { VwpLevel } from '#shared/contract'
import { linearScale } from '../utils/charts/scale'
import type { ClockPref } from '../utils/time-display'
import { formatHhmm } from '../utils/time-display'
import type { UnitsPref } from '../utils/units'
import { convertHeightFt, convertSpeedKt, heightUnit, speedUnit } from '../utils/units'

const props = withDefaults(defineProps<{
  /** cache de perfiles por vol_time (contexto de overlayMachine) */
  profiles: Record<string, VwpLevel[]>
  /** columnas del grid: vol_times del día hasta el frame, ascendentes */
  window: string[]
  /** vol_time casado con el frame mostrado (columna resaltada), o null */
  joined: string | null
  units?: UnitsPref
  clock?: ClockPref
}>(), { units: 'imperial', clock: 'utc' })

const W = 480
const H = 460
const PAD = { left: 44, right: 8, top: 10, bottom: 26 }
/** rms a partir del cual la medición se marca dudosa (ámbar) */
const RMS_WARN_KT = 6

const columns = computed(() =>
  props.window.map(t => ({ volTime: t, levels: props.profiles[t] ?? [] })),
)

// alturas ya convertidas a la unidad mostrada ANTES de escalar: así los
// ticks del eje salen redondos también en SI (metros)
const toDisplayH = (ft: number) => convertHeightFt(ft, props.units)

const heightScale = computed(() => {
  const heights = columns.value.flatMap(c => c.levels.map(l => toDisplayH(l.height_ft)))
  if (heights.length === 0) return null
  return linearScale([Math.min(...heights), Math.max(...heights)], [H - PAD.bottom, PAD.top])
})

const xOf = (i: number) =>
  PAD.left + ((i + 0.5) / Math.max(1, props.window.length)) * (W - PAD.left - PAD.right)

const barbs = computed(() => {
  const y = heightScale.value
  if (!y) return []
  return columns.value.flatMap((col, i) =>
    col.levels.map(l => ({
      key: `${col.volTime}|${l.height_ft}`,
      x: xOf(i),
      y: y.map(toDisplayH(l.height_ft)),
      dir: l.wind_dir_deg,
      speed: l.wind_speed_kt,
      color: l.rms_kt === null
        ? '#64748b'
        : l.rms_kt > RMS_WARN_KT ? '#f59e0b' : '#e2e8f0',
    })),
  )
})

const yTicks = computed(() => {
  const y = heightScale.value
  if (!y) return []
  return y.ticks(6).map(t => ({ y: y.map(t), label: `${(t / 1000).toFixed(t < 10000 ? 1 : 0)}k` }))
})

const hhmm = (iso: string) => formatHhmm(iso, props.clock)
const rmsLabel = (kt: number) =>
  props.units === 'si' ? convertSpeedKt(kt, 'si').toFixed(1) : String(kt)
</script>

<template>
  <figure data-testid="vwp-grid" class="rounded bg-slate-800 p-2">
    <svg :viewBox="`0 0 ${W} ${H}`" class="w-full">
      <!-- columna del volumen casado con el frame -->
      <rect
        v-if="joined !== null && window.includes(joined)"
        data-testid="vwp-current-column"
        :x="xOf(window.indexOf(joined)) - (W - PAD.left - PAD.right) / Math.max(1, window.length) / 2"
        :y="PAD.top - 4"
        :width="(W - PAD.left - PAD.right) / Math.max(1, window.length)"
        :height="H - PAD.top - PAD.bottom + 8"
        fill="rgba(250,204,21,0.08)"
      />
      <g v-for="tick in yTicks" :key="tick.label">
        <line
          :x1="PAD.left" :x2="W - PAD.right" :y1="tick.y" :y2="tick.y"
          stroke="rgba(148,163,184,0.15)"
        />
        <text
          :x="PAD.left - 4" :y="tick.y + 3"
          text-anchor="end" font-size="9" fill="#94a3b8"
        >{{ tick.label }}</text>
      </g>
      <text
        v-for="(t, i) in window"
        :key="t"
        :x="xOf(i)" :y="H - 8"
        text-anchor="middle" font-size="8" fill="#94a3b8"
        :font-weight="t === joined ? 'bold' : 'normal'"
      >{{ hhmm(t) }}</text>
      <WindBarb
        v-for="b in barbs"
        :key="b.key"
        :transform="`translate(${b.x}, ${b.y})`"
        :dir-deg="b.dir"
        :speed-kt="b.speed"
        :size="16"
        :color="b.color"
      />
    </svg>
    <figcaption class="mt-1 text-xs text-slate-400">
      Altura ({{ heightUnit(units, 'ft') }}) × hora {{ clock === 'utc' ? 'Z' : 'local' }} —
      barbas WMO (kt); ámbar = RMS &gt; {{ rmsLabel(RMS_WARN_KT) }} {{ speedUnit(units) }}, gris = sin RMS
    </figcaption>
  </figure>
</template>
