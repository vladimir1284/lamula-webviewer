<script setup lang="ts">
// Panel VWP (F4): grid altura × tiempo de barbas WMO (≤12 perfiles del
// día hasta el frame, columna del volumen casado resaltada) + tabla del
// volumen casado con u/v derivados en cliente (decisión 9 — el contrato
// trae dir/speed/rms por altura, sin componente vertical). SVG propio
// (D25). Color de barba por calidad: rms_kt alto → ámbar, null → gris.
import { computed } from 'vue'
import type { VwpLevel } from '#shared/contract'
import { linearScale } from '../utils/charts/scale'
import { uvFromDirSpeed } from '../utils/wind/uv'

const props = defineProps<{
  /** cache de perfiles por vol_time (contexto de overlayMachine) */
  profiles: Record<string, VwpLevel[]>
  /** columnas del grid: vol_times del día hasta el frame, ascendentes */
  window: string[]
  /** vol_time casado con el frame mostrado (columna resaltada), o null */
  joined: string | null
  error?: string | null
  empty?: boolean
}>()

const W = 340
const H = 430
const PAD = { left: 44, right: 8, top: 10, bottom: 26 }
/** rms a partir del cual la medición se marca dudosa (ámbar) */
const RMS_WARN_KT = 6

const columns = computed(() =>
  props.window.map(t => ({ volTime: t, levels: props.profiles[t] ?? [] })),
)

const heightScale = computed(() => {
  const heights = columns.value.flatMap(c => c.levels.map(l => l.height_ft))
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
      y: y.map(l.height_ft),
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

const hhmm = (iso: string) => iso.slice(11, 16)

/** tabla del volumen casado: filas descendentes (altura arriba primero) */
const tableRows = computed(() => {
  if (props.joined === null) return []
  const levels = props.profiles[props.joined] ?? []
  return [...levels]
    .sort((a, b) => b.height_ft - a.height_ft)
    .map((l) => {
      const { u, v } = uvFromDirSpeed(l.wind_dir_deg, l.wind_speed_kt)
      return { ...l, u, v }
    })
})
</script>

<template>
  <div class="text-sm">
    <h2 class="mb-2 font-semibold">Perfil de viento (VWP)</h2>
    <p v-if="error" data-testid="vwp-error" class="rounded bg-amber-900/40 p-3 text-amber-200">
      Error consultando el VWP: {{ error }}
    </p>
    <p
      v-else-if="empty || window.length === 0"
      data-testid="vwp-empty"
      class="rounded bg-slate-800 p-3 text-slate-400"
    >
      Sin perfil de viento hasta este instante del día.
    </p>
    <template v-else>
      <figure data-testid="vwp-grid" class="mb-3 rounded bg-slate-800 p-2">
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
            :size="14"
            :color="b.color"
          />
        </svg>
        <figcaption class="mt-1 text-xs text-slate-400">
          Altura (ft) × hora Z — barbas WMO; ámbar = RMS &gt; {{ RMS_WARN_KT }} kt, gris = sin RMS
        </figcaption>
      </figure>

      <p
        v-if="joined === null"
        data-testid="vwp-no-join"
        class="rounded bg-slate-800 p-3 text-slate-400"
      >
        Sin perfil cerca de este instante — el grid muestra el resto del día.
      </p>
      <table v-else data-testid="vwp-table" class="w-full border-collapse">
        <thead>
          <tr class="border-b border-slate-700 text-left text-xs text-slate-400">
            <th class="py-1 pr-2 text-right">Alt (ft)</th>
            <th class="py-1 pr-2 text-right">Dir</th>
            <th class="py-1 pr-2 text-right">Vel (kt)</th>
            <th class="py-1 pr-2 text-right">RMS</th>
            <th class="py-1 pr-2 text-right">u</th>
            <th class="py-1 text-right">v</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in tableRows"
            :key="row.height_ft"
            class="border-b border-slate-800 font-mono text-xs"
          >
            <td class="py-0.5 pr-2 text-right">{{ row.height_ft }}</td>
            <td class="py-0.5 pr-2 text-right">{{ row.wind_dir_deg }}°</td>
            <td class="py-0.5 pr-2 text-right">{{ row.wind_speed_kt }}</td>
            <td class="py-0.5 pr-2 text-right">{{ row.rms_kt ?? '—' }}</td>
            <td class="py-0.5 pr-2 text-right">{{ row.u.toFixed(1) }}</td>
            <td class="py-0.5 text-right">{{ row.v.toFixed(1) }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>
