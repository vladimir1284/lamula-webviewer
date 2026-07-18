<script setup lang="ts">
// Barra de tiempo flotante estilo nowCOAST (maqueta de referencia): sin
// panel contenedor, transparente sobre el mapa — por eso los botones son
// círculos semi-opacos y las etiquetas llevan halo blanco (únicas técnicas
// que garantizan legibilidad sobre cualquier color de fondo). Reemplaza
// TimelineStrip+AnimationControls como un único bloque (refrescar/menú —
// track — anterior/play/siguiente), con el selector de velocidad flotando
// aparte por encima. Paleta de 3 colores nada más (ver maqueta): azul
// primario, gris pizarra (controles inactivos) y gris medio (track futuro).
import { computed, ref } from 'vue'
import { naiveUtcToEpochMs } from '#shared/contract'
import type { ClockPref } from '../utils/time-display'
import { formatFull } from '../utils/time-display'
import type { Gap } from '../utils/timeline/gaps'

const PRIMARY_BLUE = '#1565A8'
const SLATE = 'rgba(78,91,102,0.92)'
const MID_GRAY = '#8B9095'
const TICK_NAVY = '#0C447C'
const HALO = '0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff'

const props = withDefaults(defineProps<{
  times: string[]
  current: string | null
  gaps: Gap[]
  canPrev: boolean
  canNext: boolean
  clock?: ClockPref
  playing: boolean
  speed?: number
  speeds?: number[]
}>(), { clock: 'utc', speed: 1, speeds: () => [0.5, 1, 2] })

const emit = defineEmits<{
  select: [iso: string]
  step: [dir: 1 | -1]
  toggle: []
  refresh: []
  menu: []
  speed: [value: number]
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

// ── Drag-scrub del handle ─────────────────────────────────────────────────
// `scrubIso` es puramente visual (handle/tooltip siguen el puntero cada
// pointermove); el `select` real hacia el padre se throttlea a ~10/s para
// no saturar SELECT_TIME/el render del mapa. El valor final del drag
// SIEMPRE se emite en pointerup, aunque el throttle lo hubiera saltado.
const trackEl = ref<HTMLElement | null>(null)
const dragging = ref(false)
const scrubIso = ref<string | null>(null)
const EMIT_THROTTLE_MS = 100

let lastEmitAt = 0

const displayIso = computed(() => scrubIso.value ?? props.current)
const handlePct = computed(() => displayIso.value ? pct(displayIso.value) : 0)
const displayIndex = computed(() => displayIso.value ? props.times.indexOf(displayIso.value) : -1)

function nearestTime(clientX: number): string | null {
  if (!trackEl.value || props.times.length === 0 || !range.value) return null
  const rect = trackEl.value.getBoundingClientRect()
  const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
  const targetMs = range.value.start + ratio * (range.value.end - range.value.start)
  let best = props.times[0]
  let bestDiff = Infinity
  for (const time of props.times) {
    const diff = Math.abs(naiveUtcToEpochMs(time) - targetMs)
    if (diff < bestDiff) {
      bestDiff = diff
      best = time
    }
  }
  return best
}

function onPointerDown(event: PointerEvent) {
  if (props.times.length === 0) return
  dragging.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  onPointerMove(event)
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  const iso = nearestTime(event.clientX)
  if (!iso) return
  scrubIso.value = iso
  const now = performance.now()
  if (now - lastEmitAt >= EMIT_THROTTLE_MS) {
    lastEmitAt = now
    emit('select', iso)
  }
}

function onPointerUp() {
  if (!dragging.value) return
  dragging.value = false
  if (scrubIso.value) emit('select', scrubIso.value)
  scrubIso.value = null
}

// Flechas: ya cubiertas por el listener global de la página (dispara aunque
// el foco esté en este handle, no está en EDITABLE_TAGS) — no duplicar acá
// o el paso avanzaría dos veces por pulsación.

function amPm(str: string): string {
  return str.replace(/\b(AM|PM)\b/, m => m.toLowerCase()).replace(/,/g, '')
}

function dayKey(iso: string): string {
  const tz = props.clock === 'utc' ? 'UTC' : undefined
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: tz,
  }).format(naiveUtcToEpochMs(iso))
}

/** '5:40 am' siempre; si es el primer tick del día se le antepone un renglón
    con la fecha '7/17' arriba — evita repetir fecha en cada etiqueta (sin
    año/zona, la zona ya la da el tooltip) */
function formatTickLabel(iso: string): string {
  const tz = props.clock === 'utc' ? 'UTC' : undefined
  return amPm(new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  }).format(naiveUtcToEpochMs(iso)))
}

function formatTickDate(iso: string): string {
  const tz = props.clock === 'utc' ? 'UTC' : undefined
  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    timeZone: tz,
  }).format(naiveUtcToEpochMs(iso))
}

/** 'Fri 7/17 8:56 am UTC' en el tooltip del handle — timestamp exacto del frame, no interpolado */
function formatScrubTooltip(iso: string): string {
  const tz = props.clock === 'utc' ? 'UTC' : undefined
  return amPm(new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
    timeZone: tz,
  }).format(naiveUtcToEpochMs(iso)))
}

// 5-6 etiquetas equiespaciadas (no una por vol_time — serían demasiadas e
// ilegibles); recalculadas solas al cambiar `times` (otro día cargado).
const tickLabels = computed(() => {
  const n = props.times.length
  if (n === 0) return []
  const count = Math.min(6, n)
  const seen = new Set<number>()
  const seenDays = new Set<string>()
  const labels: { time: string, pct: number, date: string | null, text: string, edge: 'start' | 'end' | 'mid' }[] = []
  for (let i = 0; i < count; i++) {
    const idx = count === 1 ? 0 : Math.round((i * (n - 1)) / (count - 1))
    if (seen.has(idx)) continue
    seen.add(idx)
    const time = props.times[idx]
    const edge = idx === 0 ? 'start' : idx === n - 1 ? 'end' : 'mid'
    const day = dayKey(time)
    const showDate = !seenDays.has(day)
    seenDays.add(day)
    labels.push({ time, pct: pct(time), date: showDate ? formatTickDate(time) : null, text: formatTickLabel(time), edge })
  }
  return labels
})
</script>

<template>
  <div data-testid="timeline" class="flex flex-col gap-0.2" style="overflow: visible;">
    <!-- fila de controles: todos botones h-11 + el track (línea fina) como
         único elemento sin esa altura — items-center los centra a TODOS
         contra el mismo eje, en vez de contra la columna track+etiquetas+
         buffer (que antes vivía acá y corría el centro visual del track
         hacia arriba respecto a los botones redondos). -->
    <div class="flex items-center" style="overflow: visible;">
      <div class="flex items-center gap-1">
        <button
          type="button"
          data-testid="timeline-refresh"
          aria-label="Refrescar"
          class="grid h-11 w-11 flex-none place-items-center rounded-full text-lg text-white shadow"
          :style="{ background: SLATE }"
          @click="emit('refresh')"
        >
          ⟳
        </button>
        <button
          type="button"
          data-testid="timeline-menu"
          aria-label="Menú"
          class="grid h-11 w-11 flex-none place-items-center rounded-full text-lg text-white shadow"
          :style="{ background: SLATE }"
          @click="emit('menu')"
        >
          ☰
        </button>
      </div>

      <!-- wrapper del track: el selector de velocidad flota alineado a SU
           borde izquierdo (no al de refrescar/menú) — decisión explícita de
           la maqueta. overflow visible: el tooltip se sale del track hacia
           arriba y el selector de velocidad flota ~64px por encima. ml-3:
           separación fija respecto al grupo refrescar/menú (gap-1 entre
           ellos, más juntos). -->
      <div class="relative min-w-0 flex-1 ml-3" style="overflow: visible;">
        <div
          v-if="playing"
          class="absolute flex items-center gap-2"
          style="bottom: 100%; margin-bottom: 64px; left: 0;"
        >
          <button
            v-for="s in speeds"
            :key="s"
            type="button"
            :data-testid="`anim-speed-${s}`"
            class="grid h-11 w-11 place-items-center rounded-full text-sm font-bold text-white shadow"
            :style="{ background: s === speed ? PRIMARY_BLUE : SLATE }"
            :aria-pressed="s === speed"
            @click="emit('speed', s)"
          >
            {{ s }}x
          </button>
        </div>

        <div
          ref="trackEl"
          data-testid="timeline-slider"
          class="relative h-3.5 touch-none select-none rounded-full"
          :style="{ background: MID_GRAY }"
          role="slider"
          tabindex="0"
          :aria-valuemin="0"
          :aria-valuemax="Math.max(times.length - 1, 0)"
          :aria-valuenow="displayIndex >= 0 ? displayIndex : undefined"
          :aria-valuetext="displayIso ? formatFull(displayIso, clock) : undefined"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <div
            class="pointer-events-none absolute inset-y-0 left-0 rounded-l-full"
            :style="{ width: `${handlePct}%`, background: PRIMARY_BLUE, borderRadius: handlePct >= 100 ? '9999px' : undefined }"
          />
          <div
            v-for="band in gapBands"
            :key="band.key"
            data-testid="timeline-gap"
            class="pointer-events-none absolute inset-y-0 bg-[repeating-linear-gradient(45deg,rgba(245,158,11,0.45)_0_4px,transparent_4px_8px)]"
            :style="{ left: `${band.left}%`, width: `${band.width}%` }"
          />
          <!-- objetivos de click invisibles, uno por vol_time: la maqueta no
               los muestra (drag/click-en-track ya alcanza el más cercano),
               pero un click exacto sobre un tick puntual es más preciso que
               fiarse del snap por posición — y e2e/pruebas los necesitan -->
          <button
            v-for="time in times"
            :key="time"
            type="button"
            data-testid="timeline-tick"
            :data-time="time"
            :aria-current="time === current"
            class="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0"
            :style="{ left: `${pct(time)}%` }"
            :aria-label="formatFull(time, clock)"
            @click.stop="emit('select', time)"
          />
          <div
            v-if="displayIso"
            data-testid="timeline-handle"
            class="pointer-events-none absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full"
            :style="{ left: `${handlePct}%`, background: PRIMARY_BLUE }"
          />
          <div
            v-if="dragging && displayIso"
            data-testid="timeline-tooltip"
            class="pointer-events-none absolute bottom-full -translate-x-1/2 whitespace-nowrap rounded-md px-3.5 py-2 text-[15px] font-bold text-white"
            :style="{ left: `${handlePct}%`, background: PRIMARY_BLUE, marginBottom: '6px' }"
          >
            {{ formatScrubTooltip(displayIso) }}
            <div
              class="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[5px] border-x-transparent"
              :style="{ borderTopColor: PRIMARY_BLUE }"
            />
          </div>
        </div>
      </div>

      <!-- ml-5: más separación del track que la del grupo refrescar/menú
           (gap-1 entre prev/play/next, más juntos entre sí) -->
      <div class="flex items-center gap-1 ml-5">
        <button
          type="button"
          data-testid="timeline-prev"
          :disabled="!canPrev"
          aria-label="Volumen anterior"
          class="grid h-11 w-11 flex-none place-items-center rounded-full text-lg text-white shadow disabled:opacity-30"
          :style="{ background: SLATE }"
          @click="emit('step', -1)"
        >
          ‹
        </button>
        <button
          type="button"
          data-testid="anim-play"
          :aria-label="playing ? 'Pausar' : 'Reproducir'"
          class="grid h-11 w-11 flex-none place-items-center rounded-full shadow"
          :style="{ background: SLATE }"
          @click="emit('toggle')"
        >
          <svg v-if="playing" viewBox="0 0 24 24" width="18" height="18" fill="white" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
          <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="white" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
        </button>
        <button
          type="button"
          data-testid="timeline-next"
          :disabled="!canNext"
          aria-label="Volumen siguiente"
          class="grid h-11 w-11 flex-none place-items-center rounded-full text-lg text-white shadow disabled:opacity-30"
          :style="{ background: SLATE }"
          @click="emit('step', 1)"
        >
          ›
        </button>
      </div>
    </div>

    <!-- etiquetas + buffer bajo el track: fila propia (no comparte cross-axis
         con los botones, ver arriba) con padding igual al ancho de los
         botones+gaps que flanquean el track arriba, para no meterse debajo
         de refrescar/menú/prev/play/next. -->
    <div :style="{ paddingLeft: 'calc(2 * 2.75rem + 0.25rem + 0.75rem)', paddingRight: 'calc(3 * 2.75rem + 2 * 0.25rem + 1.25rem)' }">
      <div class="relative h-8">
        <span
          v-for="label in tickLabels"
          :key="label.time"
          class="absolute flex flex-col whitespace-nowrap text-sm font-bold leading-tight"
          :class="label.edge === 'start' ? '' : label.edge === 'end' ? '-translate-x-full items-end' : '-translate-x-1/2 items-center'"
          :style="{ left: `${label.pct}%`, color: TICK_NAVY, textShadow: HALO }"
        >
          <span>{{ label.text }}</span>
          <span :class="{ invisible: !label.date }">{{ label.date ?? ' ' }}</span>
        </span>
      </div>
    </div>
  </div>
</template>
