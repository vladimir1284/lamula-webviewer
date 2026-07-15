<script setup lang="ts">
// Tabla de celdas del volumen casado, ordenada por dBZ máx desc (D22 —
// sin VIL en el feed; el GAB de NST pagina de a 6 celdas, así que dbz_max
// puede faltar: esas filas van al final con "—"). Flags: Nueva (attrs.new),
// MESO/TVS por join meso.attrs.storm_id === cell_id.
import { computed } from 'vue'
import type { Phenomenon } from '#shared/contract'
import { mesoAttrs, stormCellAttrs } from '#shared/contract'
import type { UnitsPref } from '../utils/units'
import { formatHeightKft, formatSpeedKt, heightUnit, speedUnit } from '../utils/units'

const props = withDefaults(defineProps<{
  /** filas completas del volumen casado (todas las kinds), o null */
  phenomena: Phenomenon[] | null
  /** null = nada dentro de tolerancia (mensaje distinto a volumen sin celdas) */
  joined: string | null
  selectedCell: string | null
  units?: UnitsPref
}>(), { units: 'imperial' })

const emit = defineEmits<{
  select: [cellId: string | null]
}>()

interface CellRow {
  cellId: string
  dbzMax: number | null
  heightKft: number | null
  movementDeg: number | null
  movementKt: number | null
  isNew: boolean
  hasMeso: boolean
  hasTvs: boolean
}

const rows = computed<CellRow[]>(() => {
  if (!props.phenomena) return []
  const mesoByStorm = new Map<string, { tvs: boolean }>()
  for (const p of props.phenomena) {
    if (p.kind !== 'meso') continue
    const a = mesoAttrs(p.attrs)
    if (a.storm_id) {
      const prev = mesoByStorm.get(a.storm_id)
      mesoByStorm.set(a.storm_id, { tvs: (prev?.tvs ?? false) || a.tvs === true })
    }
  }
  return props.phenomena
    .filter(p => p.kind === 'storm_cell' && p.cell_id !== null)
    .map((p) => {
      const a = stormCellAttrs(p.attrs)
      const meso = mesoByStorm.get(p.cell_id!)
      return {
        cellId: p.cell_id!,
        dbzMax: a.dbz_max ?? null,
        heightKft: a.dbz_max_height_kft ?? null,
        movementDeg: a.movement_deg ?? null,
        movementKt: a.movement_kt ?? null,
        isNew: a.new === true,
        hasMeso: meso !== undefined,
        hasTvs: meso?.tvs === true,
      }
    })
    .sort((a, b) => (b.dbzMax ?? -Infinity) - (a.dbzMax ?? -Infinity))
})

function onRow(cellId: string) {
  emit('select', cellId === props.selectedCell ? null : cellId)
}

const fmt = (v: number | null, digits = 0) => (v === null ? '—' : v.toFixed(digits))
</script>

<template>
  <div class="text-sm">
    <h2 class="mb-2 font-semibold">Celdas de tormenta</h2>
    <p
      v-if="joined === null"
      data-testid="cells-no-join"
      class="rounded bg-slate-800 p-3 text-slate-400"
    >
      Sin datos de celdas cerca de este instante.
    </p>
    <p
      v-else-if="rows.length === 0"
      data-testid="cells-empty"
      class="rounded bg-slate-800 p-3 text-slate-400"
    >
      Sin celdas detectadas en este volumen.
    </p>
    <table v-else data-testid="cell-table" class="w-full border-collapse">
      <thead>
        <tr class="border-b border-slate-700 text-left text-xs text-slate-400">
          <th class="py-1 pr-2">ID</th>
          <th class="py-1 pr-2 text-right">dBZ máx</th>
          <th class="py-1 pr-2 text-right">Alt ({{ heightUnit(units, 'kft') }})</th>
          <th class="py-1 pr-2 text-right">Mov</th>
          <th class="py-1">Flags</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.cellId"
          :data-testid="`cell-row-${row.cellId}`"
          class="cursor-pointer border-b border-slate-800"
          :class="row.cellId === selectedCell ? 'bg-yellow-400/10 text-yellow-200' : 'hover:bg-slate-800'"
          @click="onRow(row.cellId)"
        >
          <td class="py-1 pr-2 font-mono">{{ row.cellId }}</td>
          <td class="py-1 pr-2 text-right font-mono">{{ fmt(row.dbzMax) }}</td>
          <td class="py-1 pr-2 text-right font-mono">{{ formatHeightKft(row.heightKft, units) }}</td>
          <td class="py-1 pr-2 text-right font-mono">
            {{ row.movementDeg === null ? '—' : `${row.movementDeg}°/${formatSpeedKt(row.movementKt, units)}${speedUnit(units)}` }}
          </td>
          <td class="py-1 text-xs">
            <span v-if="row.isNew" class="mr-1 rounded bg-sky-900 px-1 text-sky-200">Nueva</span>
            <span v-if="row.hasMeso" class="mr-1 rounded bg-amber-900 px-1 text-amber-200">MESO</span>
            <span v-if="row.hasTvs" class="rounded bg-red-900 px-1 text-red-200">TVS</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
