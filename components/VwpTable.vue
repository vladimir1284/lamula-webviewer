<script setup lang="ts">
// Tabla numérica del volumen VWP casado, extraída de VwpPanel (D35/D36 —
// ahora vive en el sub-tab "Datos" del tab VWP de DataModal). u/v derivados
// en cliente (decisión 9 — el contrato trae dir/speed/rms por altura, sin
// componente vertical).
import { computed } from 'vue'
import type { VwpLevel } from '#shared/contract'
import type { UnitsPref } from '../utils/units'
import { convertHeightFt, convertSpeedKt, heightUnit, speedUnit } from '../utils/units'
import { uvFromDirSpeed } from '../utils/wind/uv'

const props = withDefaults(defineProps<{
  /** cache de perfiles por vol_time (contexto de overlayMachine) */
  profiles: Record<string, VwpLevel[]>
  /** vol_time casado con el frame mostrado, o null */
  joined: string | null
  units?: UnitsPref
}>(), { units: 'imperial' })

// la tabla en imperial debe ser byte-idéntica al render histórico (los
// specs comparan String(valor crudo)); solo SI convierte y formatea
const heightLabel = (ft: number) =>
  props.units === 'si' ? String(Math.round(convertHeightFt(ft, 'si'))) : String(ft)
const speedLabel = (kt: number) =>
  props.units === 'si' ? convertSpeedKt(kt, 'si').toFixed(0) : String(kt)
const rmsLabel = (kt: number | null) =>
  kt === null ? '—' : props.units === 'si' ? convertSpeedKt(kt, 'si').toFixed(1) : String(kt)
const uvLabel = (kt: number) => convertSpeedKt(kt, props.units).toFixed(1)

/** filas descendentes (altura arriba primero) */
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
  <p
    v-if="joined === null"
    data-testid="vwp-no-join"
    class="rounded bg-slate-800 p-3 text-sm text-slate-400"
  >
    Sin perfil cerca de este instante — el grid muestra el resto del día.
  </p>
  <table v-else data-testid="vwp-table" class="w-full border-collapse">
    <thead>
      <tr class="border-b border-slate-700 text-left text-xs text-slate-400">
        <th class="py-1 pr-2 text-right">Alt ({{ heightUnit(units, 'ft') }})</th>
        <th class="py-1 pr-2 text-right">Dir</th>
        <th class="py-1 pr-2 text-right">Vel ({{ speedUnit(units) }})</th>
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
        <td class="py-0.5 pr-2 text-right">{{ heightLabel(row.height_ft) }}</td>
        <td class="py-0.5 pr-2 text-right">{{ row.wind_dir_deg }}°</td>
        <td class="py-0.5 pr-2 text-right">{{ speedLabel(row.wind_speed_kt) }}</td>
        <td class="py-0.5 pr-2 text-right">{{ rmsLabel(row.rms_kt) }}</td>
        <td class="py-0.5 pr-2 text-right">{{ uvLabel(row.u) }}</td>
        <td class="py-0.5 text-right">{{ uvLabel(row.v) }}</td>
      </tr>
    </tbody>
  </table>
</template>
