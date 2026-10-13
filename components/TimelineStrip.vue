<script setup lang="ts">
// Barra de tiempo flotante estilo nowCOAST (maqueta de referencia): sin
// panel contenedor, transparente sobre el mapa — por eso los botones son
// círculos semi-opacos y las etiquetas llevan halo blanco (únicas técnicas
// que garantizan legibilidad sobre cualquier color de fondo). Reproducción
// (prev/play/next) — track — ☰ (D36: reordenado, play primero y agrandado;
// la velocidad vive solo en TimelineMenu, dejó de duplicarse acá como popup
// flotante). Paleta de 3 colores nada más (ver maqueta): azul primario,
// gris pizarra (controles inactivos) y gris medio (track futuro).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { naiveUtcToEpochMs } from '#shared/contract'
import type { ClockPref } from '../utils/time-display'
import { formatFull } from '../utils/time-display'
import type { Gap } from '../utils/timeline/gaps'
import { pickTickLabels } from '../utils/timeline/labels'

const { t } = useI18n()

const PRIMARY_BLUE = '#1565A8'
const SLATE = 'rgba(78,91,102,0.92)'
const MID_GRAY = '#8B9095'
// Anillo del handle. El azul de marca sobre la pista gris da 1.89:1 y WCAG
// 1.4.11 pide 3.0 para el elemento que comunica el valor; el blanco da 3.22
// contra la pista y 17.85 contra el fondo de la página. Se añade un anillo en
// vez de retocar el azul o aclarar la pista: no cambia la identidad visual.
const HANDLE_RING = '#ffffff'
const TICK_NAVY = '#0C447C'
// Media anchura de la pastilla "en vivo" (~92 px con `whitespace-nowrap`). La
// pastilla sigue al handle con `-translate-x-1/2`, así que sin acotar el `left`
// se sale del track por los dos extremos — con el handle en vivo (100%) queda
// medio cuerpo fuera.
const PILL_HALF_PX = 46
const HALO = '0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff'

const props = withDefaults(defineProps<{
  times: string[]
  current: string | null
  gaps: Gap[]
  canPrev: boolean
  canNext: boolean
  clock?: ClockPref
  playing: boolean
  liveRefresh: boolean
  /** oculta el botón play/pause (D43/P4: la vista de mosaico aún no anima —
   * geometría por fila, ver utils/map/frame-pool.ts) — default true, ningún
   * llamador existente lo pasa */
  showPlay?: boolean
}>(), { clock: 'utc', showPlay: true })

const emit = defineEmits<{
  select: [iso: string]
  step: [dir: 1 | -1]
  toggle: []
  'set-live-refresh': [value: boolean]
  menu: []
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

// separa el primer/último tick de la punta redondeada del track (h-3.5 = 14px,
// radio 7px) — si no, el tick queda montado sobre la curva: |( en vez de (|
const TICK_EDGE_INSET_PX = 7

function markLeft(time: string, idx: number): string {
  if (idx === 0) return `${TICK_EDGE_INSET_PX}px`
  if (idx === props.times.length - 1) return `calc(100% - ${TICK_EDGE_INSET_PX}px)`
  return `${pct(time)}%`
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
// Ancho medido del track. Lo consume `tickLabels` para decidir cuántas
// etiquetas caben: con 6 fijas (D36) se solapaban 48 px a 360 px de viewport y
// 11 px incluso a 768 px — medido, no estimado. `0` significa "sin medir"
// (SSR), y `tickLabelCount` devuelve ahí el máximo, que es lo que renderizaba
// antes: el HTML del servidor coincide con el del cliente y no parpadea.
const trackWidth = ref(0)
// Sangrado de la fila de etiquetas para que coincida con los extremos del
// track. Antes era un `calc()` a mano que sumaba los anchos de los botones
// (`2*2.25rem+3.5rem+…`): se desincronizaba en cuanto un botón cambiaba de
// tamaño, que es exactamente lo que pasa ahora en móvil (prev/next a 44 px).
// Medido no hace falta mantenerlo en sync con nada.
const labelPadLeft = ref<number | null>(null)
const labelPadRight = ref<number | null>(null)
const rootEl = ref<HTMLElement | null>(null)
let observer: ResizeObserver | null = null

function measure() {
  const track = trackEl.value
  const root = rootEl.value
  if (!track || !root) return
  const t = track.getBoundingClientRect()
  const r = root.getBoundingClientRect()
  trackWidth.value = t.width
  labelPadLeft.value = Math.max(0, Math.round(t.left - r.left))
  labelPadRight.value = Math.max(0, Math.round(r.right - t.right))
}

onMounted(() => {
  measure()
  // ResizeObserver y no un listener de `resize`: el track también cambia de
  // ancho sin que cambie el viewport (el panel de datos, rotar el móvil).
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(() => measure())
  if (trackEl.value) observer.observe(trackEl.value)
  if (rootEl.value) observer.observe(rootEl.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

const dragging = ref(false)
const scrubIso = ref<string | null>(null)
const EMIT_THROTTLE_MS = 100
// tras soltar (drag o click simple), el tooltip queda visible este tiempo
// extra en vez de desaparecer con el pointerup — si no, un click sin arrastre
// lo mostraba y ocultaba en el mismo tick de Vue (parpadeo)
const TOOLTIP_HOLD_MS = 3000

let lastEmitAt = 0
let tooltipHideTimer: ReturnType<typeof setTimeout> | null = null
const tooltipHeld = ref(false)

const displayIso = computed(() => scrubIso.value ?? props.current)
const handlePct = computed(() => displayIso.value ? pct(displayIso.value) : 0)
const displayIndex = computed(() => displayIso.value ? props.times.indexOf(displayIso.value) : -1)

// Media anchura del tooltip del scrub ('Fri 7/10 11:16 pm GMT-4' ≈ 200 px).
const TOOLTIP_HALF_PX = 100

/**
 * El tooltip sigue al handle centrado, así que en los extremos del track se
 * salía por el costado — en un móvil de 360 px eso es medio tooltip fuera de
 * pantalla justo mientras el dedo arrastra, que es cuando hace falta leerlo.
 * Se ancla al borde igual que las etiquetas de tick, y la flecha se queda
 * clavada al handle con un desplazamiento en px (así no hace falta conocer el
 * ancho real del tooltip, que depende del texto y del idioma).
 */
const handleX = computed(() => (handlePct.value / 100) * trackWidth.value)

const tooltipEdge = computed<'start' | 'mid' | 'end'>(() => {
  const w = trackWidth.value
  if (w <= 0) return 'mid'
  if (handleX.value < TOOLTIP_HALF_PX) return 'start'
  if (handleX.value > w - TOOLTIP_HALF_PX) return 'end'
  return 'mid'
})

const tooltipStyle = computed(() => {
  if (tooltipEdge.value === 'start') return { left: '0px' }
  if (tooltipEdge.value === 'end') return { right: '0px' }
  return { left: `${handlePct.value}%` }
})

const tooltipArrowStyle = computed(() => {
  if (tooltipEdge.value === 'start') return { left: `${handleX.value}px` }
  if (tooltipEdge.value === 'end') return { right: `${trackWidth.value - handleX.value}px` }
  return { left: '50%' }
})

// Teclado del slider (accesibilidad). `role="slider"` promete flechas y
// Home/End, y hasta ahora solo las flechas funcionaban — y por accidente: las
// servía el listener global de `window` de la página. Al declararlas acá y
// cortar la propagación, el dueño de la tecla pasa a ser quien tiene el foco,
// que es lo que ya hacía falta para que el mapa (también focusable) pudiera
// panear con flechas sin saltar de frame a la vez.
function onSliderKeydown(event: KeyboardEvent) {
  const first = props.times[0]
  const last = props.times.at(-1)
  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      emit('step', -1)
      break
    case 'ArrowRight':
    case 'ArrowUp':
      emit('step', 1)
      break
    case 'Home':
      if (first) emit('select', first)
      break
    case 'End':
      if (last) emit('select', last)
      break
    default:
      return
  }
  event.preventDefault()
  event.stopPropagation()
}

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
  if (tooltipHideTimer) {
    clearTimeout(tooltipHideTimer)
    tooltipHideTimer = null
  }
  tooltipHeld.value = false
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
  tooltipHeld.value = true
  tooltipHideTimer = setTimeout(() => {
    tooltipHeld.value = false
    scrubIso.value = null
    tooltipHideTimer = null
  }, TOOLTIP_HOLD_MS)
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

// Etiquetas equiespaciadas (no una por vol_time — serían demasiadas e
// ilegibles); cuántas caben lo decide el ancho medido del track, ver
// `utils/timeline/labels.ts`. Se recalculan solas al cambiar `times` (otro día
// cargado) y al cambiar el ancho (rotar el móvil).
const tickLabels = computed(() => {
  const n = props.times.length
  if (n === 0) return []
  const seenDays = new Set<string>()
  const labels: { time: string, pct: number, date: string | null, text: string, edge: 'start' | 'end' | 'mid' }[] = []
  for (const idx of pickTickLabels(props.times.map(pct), trackWidth.value)) {
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
  <div ref="rootEl" data-testid="timeline" class="flex flex-col gap-0.2" style="overflow: visible;">
    <!-- fila de controles (D36): reproducción a la izquierda (play grande +
         prev/next pegados, orden de reproductor de medios), track al medio,
         ☰ solo a la derecha — "en vivo" ya no es un botón más del grupo
         izquierdo: es una pastilla que flota SOBRE el track, en la posición
         del handle (ver más abajo), y el selector de velocidad flotante se
         eliminó (quedaba redundante con el fieldset "Velocidad" de
         TimelineMenu, que ya cubre lo mismo con menos protagonismo visual).
         items-center centra todo contra el mismo eje que el track. -->
    <!--
      El corte de layout es `sm:` (640 px), no `md:`: un móvil en horizontal
      mide 640×360 y con la pila vertical el timebar se comía 146 px de 360
      (41 % de la pantalla) teniendo 608 px de ancho de sobra. El corte de
      TAMAÑO de los botones sigue en `md:`, aparte: entre 640 y 768 px el
      usuario sigue tocando con el dedo, así que prev/next se quedan en 44 px.
      Las etiquetas se alinean con el track por medición, no por el `calc()`
      de anchos de botón, justo para que los dos cortes puedan no coincidir.
    -->
    <div class="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-0" style="overflow: visible;">
      <!-- Controles de reproducción + Botón Menú en móvil -->
      <div class="flex items-center justify-between sm:justify-start">
        <div class="flex items-center gap-1">
          <button
            type="button"
            data-testid="timeline-prev"
            :disabled="!canPrev"
            :aria-label="t('timeline.prevVolume')"
            class="grid h-11 w-11 flex-none place-items-center rounded-full text-base text-white shadow disabled:opacity-30 md:h-9 md:w-9"
            :style="{ background: SLATE }"
            @click="emit('step', -1)"
          >
            ‹
          </button>
          <button
            v-if="showPlay"
            type="button"
            data-testid="anim-play"
            :aria-label="playing ? t('timeline.pause') : t('timeline.play')"
            class="grid h-14 w-14 flex-none place-items-center rounded-full shadow"
            :style="{ background: SLATE }"
            @click="emit('toggle')"
          >
            <svg v-if="playing" viewBox="0 0 24 24" width="22" height="22" fill="white" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
            <svg v-else viewBox="0 0 24 24" width="22" height="22" fill="white" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          </button>
          <button
            type="button"
            data-testid="timeline-next"
            :disabled="!canNext"
            :aria-label="t('timeline.nextVolume')"
            class="grid h-11 w-11 flex-none place-items-center rounded-full text-base text-white shadow disabled:opacity-30 md:h-9 md:w-9"
            :style="{ background: SLATE }"
            @click="emit('step', 1)"
          >
            ›
          </button>
        </div>

        <div class="flex items-center gap-2 sm:hidden">
          <!--
            Gemela móvil de la pastilla flotante de abajo. Flotando sobre el
            track (D36) a 360 px se salía 18 px del viewport, tapaba 34×26 px
            del botón ☰ y partía "EN VIVO" en dos renglones — medido. Acá vive
            en la fila de controles, donde ya hay 56 px de alto: sin solape,
            sin desbordes y con área táctil de verdad. Mismo patrón de nodo
            duplicado + `data-testid` propio que ya usaban los dos botones ☰:
            ningún `v-if` sobre ancho medido, así que no parpadea al hidratar.
          -->
          <label
            data-testid="live-refresh-toggle-mobile"
            class="flex h-11 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full px-3 text-[11px] font-bold text-white shadow"
            :style="{ background: liveRefresh ? PRIMARY_BLUE : SLATE }"
            :title="liveRefresh ? t('timeline.liveOn') : t('timeline.liveOff')"
          >
            <input
              type="checkbox"
              class="sr-only"
              :checked="liveRefresh"
              :aria-label="t('timeline.live')"
              @change="emit('set-live-refresh', ($event.target as HTMLInputElement).checked)"
            >
            <span aria-hidden="true">{{ liveRefresh ? '●' : '○' }}</span>
            <span>{{ t('timeline.liveLabel') }}</span>
          </label>
          <button
            type="button"
            data-testid="timeline-menu-mobile"
            :aria-label="t('timeline.menu')"
            class="grid h-11 w-11 flex-none place-items-center rounded-full text-lg text-white shadow"
            :style="{ background: SLATE }"
            @click="emit('menu')"
          >
            ☰
          </button>
        </div>
      </div>

      <!-- wrapper del track: 100% en móvil, flex-1 ml-3 en desktop -->
      <div class="relative my-1 min-w-0 flex-1 sm:my-0 sm:ml-3" style="overflow: visible;">
        <label
          data-testid="live-refresh-toggle"
          class="absolute hidden -translate-x-1/2 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold text-white shadow z-10 sm:flex"
          style="bottom: 100%; margin-bottom: 6px;"
          :style="{ left: `clamp(${PILL_HALF_PX}px, ${handlePct}%, calc(100% - ${PILL_HALF_PX}px))`, background: liveRefresh ? PRIMARY_BLUE : SLATE }"
          :title="liveRefresh ? t('timeline.liveOn') : t('timeline.liveOff')"
        >
          <input
            type="checkbox"
            class="sr-only"
            :checked="liveRefresh"
            :aria-label="t('timeline.live')"
            @change="emit('set-live-refresh', ($event.target as HTMLInputElement).checked)"
          >
          <span aria-hidden="true">{{ liveRefresh ? '●' : '○' }}</span>
          <span>{{ t('timeline.liveLabel') }}</span>
        </label>

        <div
          ref="trackEl"
          data-testid="timeline-slider"
          class="relative h-4 touch-none select-none rounded-full"
          :style="{ background: MID_GRAY }"
          role="slider"
          tabindex="0"
          :aria-valuemin="0"
          :aria-valuemax="Math.max(times.length - 1, 0)"
          :aria-valuenow="displayIndex >= 0 ? displayIndex : undefined"
          :aria-valuetext="displayIso ? formatFull(displayIso, clock) : undefined"
          @keydown="onSliderKeydown"
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
          <!-- marca blanca por vol_time (D37) -->
          <div
            v-for="(time, idx) in times"
            :key="`mark-${time}`"
            class="pointer-events-none absolute top-1/2 h-1.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80"
            :style="{ left: markLeft(time, idx) }"
          />
          <!-- objetivos de click invisibles, uno por vol_time -->
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
            :style="{ left: `${handlePct}%`, background: PRIMARY_BLUE, boxShadow: `0 0 0 2px ${HANDLE_RING}` }"
          />
          <div
            v-if="(dragging || tooltipHeld) && displayIso"
            data-testid="timeline-tooltip"
            class="pointer-events-none absolute bottom-full whitespace-nowrap rounded-full px-3.5 py-2 text-[15px] font-bold text-white"
            :class="tooltipEdge === 'mid' ? '-translate-x-1/2' : ''"
            :style="{ ...tooltipStyle, background: PRIMARY_BLUE, marginBottom: '6px' }"
          >
            {{ formatScrubTooltip(displayIso) }}
            <!-- anclada por `right` en el borde derecho: ahí el -50% de siempre
                 dejaría la punta 5 px corrida, hace falta el +50%. -->
            <div
              class="absolute top-full h-0 w-0 border-x-[5px] border-t-[5px] border-x-transparent"
              :class="tooltipEdge === 'end' ? 'translate-x-1/2' : '-translate-x-1/2'"
              :style="{ ...tooltipArrowStyle, borderTopColor: PRIMARY_BLUE }"
            />
          </div>
        </div>
      </div>

      <!-- Menú en desktop -->
      <div class="hidden items-center sm:flex sm:ml-5">
        <button
          type="button"
          data-testid="timeline-menu"
          :aria-label="t('timeline.menu')"
          class="grid h-11 w-11 flex-none place-items-center rounded-full text-lg text-white shadow"
          :style="{ background: SLATE }"
          @click="emit('menu')"
        >
          ☰
        </button>
      </div>
    </div>

    <!-- etiquetas bajo el track: sin padding en móvil, con padding en desktop -->
    <div
      class="sm:pl-[calc(2*2.25rem+3.5rem+2*0.25rem+0.75rem)] sm:pr-[calc(2.75rem+1.25rem)]"
      :style="labelPadLeft === null ? undefined : { paddingLeft: `${labelPadLeft}px`, paddingRight: `${labelPadRight}px` }"
    >
      <div class="relative h-8">
        <span
          v-for="label in tickLabels"
          :key="label.time"
          class="absolute flex flex-col whitespace-nowrap text-sm font-bold leading-tight"
          :class="label.edge === 'start' ? '' : label.edge === 'end' ? '-translate-x-full items-end' : '-translate-x-1/2 items-center'"
          :style="{ left: `${label.pct}%`, color: TICK_NAVY, textShadow: HALO }"
        >
          <span>{{ label.text }}</span>
          <span :class="{ invisible: !label.date }">{{ label.date ?? '\u00A0' }}</span>
        </span>
      </div>
    </div>
  </div>
</template>
