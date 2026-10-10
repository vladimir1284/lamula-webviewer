<script setup lang="ts">
// Exportar la vista del mapa como PNG (F7.1). <dialog> nativo, mismo patrón
// que PrefsDialog (D26: PrimeVue sigue sin uso).
//
// El diálogo no sabe nada de OpenLayers: recibe el handle de captura que
// RadarMap expone con defineExpose y se lo pasa a `captureMap`.
import { computed, ref, watch } from 'vue'
import type { Palette } from '#shared/products'
import type { BaseMapId } from '#shared/basemaps'
import { attributionsFor } from '#shared/attributions'
import type { ClockPref } from '../utils/time-display'
import type { UnitsPref } from '../utils/units'
import type { ChromeMode, ChromeSpec } from '../utils/export/chrome'
import type { BrandImage, MapCaptureHandle } from '../utils/export/types'
import type { AnimationFormat } from '../utils/export/animate'
import { captureMap } from '../utils/export/capture'
import { exportAnimation } from '../utils/export/animate'
import { phaseTasks, sequenceTasks } from '../utils/export/frame-driver'
import { pickVideoMime } from '../utils/export/video'
import { exportFilename } from '../utils/export/filename'
import { fileToAvatarDataUrl, loadBrandImage } from '../utils/export/images'
import { canCopyImages, canvasToBlob, copyCanvasToClipboard, downloadBlob } from '../utils/export/sink'
import { loadExportPrefs, saveExportPrefs } from '../composables/useExportPrefs'

const props = defineProps<{
  handle: MapCaptureHandle | null
  site: string
  siteName?: string | null
  /** nombre legible del producto */
  productName: string
  /** mnemónico (N0B…) o código, para el nombre del fichero */
  productSlug: string | number
  palette: Palette | null
  volTime: string | null
  clock: ClockPref
  units: UnitsPref
  base: BaseMapId
  satEnabled: boolean
  /** vol_times de la ventana de animación, en el orden del pool (F7.3) */
  frameTimes?: string[] | null
}>()

const TITLE = 'LAMULA WebViewer'
/** mismo origen ⇒ no contamina el canvas; el SVG mide en mm, de ahí el fallback */
const LOGO_SRC = '/logo.svg'
const LOGO_SIZE = { width: 172, height: 167 }

const dialog = ref<HTMLDialogElement>()
const prefs = ref(loadExportPrefs())
const preview = ref<HTMLCanvasElement>()
const busy = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const outSize = ref<{ w: number, h: number } | null>(null)

const canCopy = canCopyImages()

let rendered: HTMLCanvasElement | null = null

// Imágenes de marca ya decodificadas (F7.2): el dibujo del chrome es
// síncrono, así que la carga ocurre antes de capturar, nunca dentro.
const logo = ref<BrandImage | null>(null)
const avatarImage = ref<BrandImage | null>(null)
let loadedAvatarSrc: string | null = null

async function ensureBrand() {
  if (!logo.value) {
    try {
      logo.value = await loadBrandImage(LOGO_SRC, LOGO_SIZE)
    }
    catch {
      logo.value = null // sin logo se exporta igual; no es motivo de error visible
    }
  }
  const wanted = prefs.value.avatarDataUrl
  if (wanted === loadedAvatarSrc) return
  loadedAvatarSrc = wanted
  avatarImage.value = null
  if (!wanted) return
  try {
    avatarImage.value = await loadBrandImage(wanted)
  }
  catch {
    avatarImage.value = null
  }
}

const spec = computed<ChromeSpec>(() => ({
  mode: prefs.value.chrome,
  title: TITLE,
  site: props.site,
  siteName: props.siteName ?? null,
  product: props.productName,
  timeIso: props.volTime,
  clock: props.clock,
  units: props.units,
  palette: props.palette,
  attributions: attributionsFor(props.base, props.satEnabled),
  parts: prefs.value.parts,
  avatar: avatarImage.value,
}))

const filename = computed(() => exportFilename({
  site: props.site,
  product: props.productSlug,
  volTime: props.volTime,
  ext: 'png',
}))

function paintPreview(canvas: HTMLCanvasElement) {
  const target = preview.value
  if (!target) return
  const maxW = 560
  const scale = Math.min(1, maxW / canvas.width)
  target.width = Math.max(1, Math.round(canvas.width * scale))
  target.height = Math.max(1, Math.round(canvas.height * scale))
  const ctx = target.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, target.width, target.height)
  ctx.drawImage(canvas, 0, 0, target.width, target.height)
}

async function render() {
  if (!props.handle) return
  busy.value = true
  error.value = null
  notice.value = null
  try {
    await ensureBrand()
    const result = await captureMap(props.handle, {
      pixelRatio: prefs.value.scale,
      chrome: spec.value,
      watermark: logo.value,
      onTaint: 'skip',
    })
    rendered = result.canvas
    outSize.value = { w: result.canvas.width, h: result.canvas.height }
    if (result.skipped.length > 0) {
      notice.value = `Se omitieron ${result.skipped.length} capa(s) que el navegador no deja leer.`
    }
    paintPreview(result.canvas)
  }
  catch (e) {
    rendered = null
    outSize.value = null
    error.value = e instanceof Error ? e.message : 'No se pudo capturar el mapa'
  }
  finally {
    busy.value = false
  }
}

function setChrome(mode: ChromeMode) {
  prefs.value = { ...prefs.value, chrome: mode }
}

function setPart(key: keyof typeof prefs.value.parts, value: boolean) {
  prefs.value = { ...prefs.value, parts: { ...prefs.value.parts, [key]: value } }
}

function setScale(scale: 1 | 2) {
  prefs.value = { ...prefs.value, scale }
}

async function pickAvatar(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  error.value = null
  try {
    // normalizado a 128×128 antes de tocar localStorage: una foto de cámara
    // no cabe en la cuota, y el avatar nunca sale del navegador
    const avatarDataUrl = await fileToAvatarDataUrl(file)
    prefs.value = {
      ...prefs.value,
      avatarDataUrl,
      parts: { ...prefs.value.parts, avatar: true },
    }
  }
  catch {
    error.value = 'No se pudo leer la imagen elegida.'
  }
  finally {
    input.value = '' // re-elegir el mismo fichero tiene que volver a disparar change
  }
}

function clearAvatar() {
  prefs.value = {
    ...prefs.value,
    avatarDataUrl: null,
    parts: { ...prefs.value.parts, avatar: false },
  }
}

watch(prefs, (p) => {
  saveExportPrefs(p)
  if (dialog.value?.open) void render()
}, { deep: true })

async function download() {
  if (!rendered) return
  try {
    downloadBlob(await canvasToBlob(rendered), filename.value)
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo generar el PNG'
  }
}

// NO async: `clipboard.write` tiene que correr dentro del gesto del usuario
// (requisito de Safari). Ver utils/export/sink.ts.
function copy() {
  if (!rendered) return
  error.value = null
  copyCanvasToClipboard(rendered)
    .then(() => { notice.value = 'Imagen copiada al portapapeles.' })
    .catch(() => { error.value = 'El navegador no dejó copiar la imagen.' })
}

// ── Animación (F7.3) ─────────────────────────────────────────────────────
// Dos formas sobre el mismo mapa: la secuencia de frames del radar, o el
// bucle de 5 s de los rayos sobre una sola observación. La secuencia exige
// que el pool de animación exista — es decir, que el usuario haya dado a play
// al menos una vez; en modo estático no hay frames que recorrer.
type AnimKind = 'sequence' | 'phase'

/** El GIF se reduce: a 2560×1440 la cuantización cuesta ~25× y el fichero se dispara. */
const GIF_MAX_WIDTH = 960
const VIDEO_MAX_WIDTH = 1280
/** ms por frame de la secuencia del radar */
const SEQUENCE_DELAY_MS = 400
/** frames del bucle de rayos: 20 sobre 5 s = 4 fps, suficiente para el fade */
const PHASE_FRAMES = 20

const videoMime = pickVideoMime()
// la preferencia la pone el usuario; la disponibilidad manda sobre ella. Sin
// pool de animación no hay secuencia que recorrer, y forzar el ref dejaría la
// elección pegada en 'phase' cuando el pool aparece después.
const animKindPref = ref<AnimKind>('sequence')
const animFormat = ref<AnimationFormat>('gif')
const animBusy = ref(false)
const animDone = ref(0)
const animTotal = ref(0)
const animNotice = ref<string | null>(null)
const poolFrames = ref(0)
let animCancelled = false

const canSequence = computed(() => poolFrames.value > 1)
const animKind = computed<AnimKind>(() => (canSequence.value ? animKindPref.value : 'phase'))

function refreshPoolFrames() {
  poolFrames.value = props.handle?.frameCount() ?? 0
}

function chromeFor(timeIso: string | null): ChromeSpec {
  return { ...spec.value, timeIso }
}

async function generateAnimation() {
  const handle = props.handle
  if (!handle || animBusy.value) return
  animBusy.value = true
  animCancelled = false
  error.value = null
  animNotice.value = null
  animDone.value = 0

  const format = animFormat.value
  const tasks = animKind.value === 'sequence'
    ? sequenceTasks(poolFrames.value, SEQUENCE_DELAY_MS)
    : phaseTasks(PHASE_FRAMES, handle.activeFrame())
  animTotal.value = tasks.length

  try {
    await ensureBrand()
    const result = await exportAnimation(handle, {
      tasks,
      format,
      videoMime: videoMime ?? undefined,
      // 1× siempre: el tope de área de canvas de iOS y el coste de cuantizar
      // hacen que 2× no sea una opción para una secuencia
      capture: { pixelRatio: 1, watermark: logo.value, onTaint: 'skip' },
      chromeFor: task => chromeFor(props.frameTimes?.[task.index] ?? props.volTime),
      maxWidth: format === 'gif' ? GIF_MAX_WIDTH : VIDEO_MAX_WIDTH,
      onProgress: (done, total) => {
        animDone.value = done
        animTotal.value = total
      },
      isCancelled: () => animCancelled,
    })
    if (result.drive.cancelled) {
      animNotice.value = `Cancelado tras ${result.drive.frames} frames.`
    }
    downloadBlob(result.blob, exportFilename({
      site: props.site,
      product: props.productSlug,
      volTime: props.volTime,
      ext: result.ext,
    }))
    const kb = Math.round(result.blob.size / 1024)
    animNotice.value = `${result.drive.frames} frames · ${result.drive.width}×${result.drive.height} · ${kb} kB`
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo generar la animación'
  }
  finally {
    animBusy.value = false
    // el driver devolvió el mapa a su frame original; repintar la vista
    // previa para que no quede mostrando el último frame de la secuencia
    void render()
  }
}

function cancelAnimation() {
  animCancelled = true
}

defineExpose({
  open: () => {
    dialog.value?.showModal()
    refreshPoolFrames()
    void render()
  },
})
</script>

<template>
  <dialog
    ref="dialog"
    data-testid="export-dialog"
    aria-labelledby="export-title"
    class="w-[min(640px,92vw)] rounded-lg border border-slate-600 bg-slate-800 p-0 text-slate-100 backdrop:bg-slate-950/60"
  >
    <div class="flex items-center justify-between border-b border-slate-700 px-4 py-2">
      <h2 id="export-title" class="text-sm font-bold">Exportar imagen</h2>
      <button
        type="button"
        data-testid="export-close"
        aria-label="Cerrar"
        class="rounded px-2 py-1 text-slate-400 hover:bg-slate-700 hover:text-slate-100"
        @click="dialog?.close()"
      >
        ✕
      </button>
    </div>

    <div class="space-y-4 p-4 text-sm">
      <div class="rounded border border-slate-700 bg-slate-900 p-2">
        <canvas
          ref="preview"
          data-testid="export-preview"
          class="mx-auto block max-w-full"
        />
        <p v-if="busy" class="pt-2 text-center text-xs text-slate-400">Capturando…</p>
        <p v-else-if="outSize" class="pt-2 text-center text-xs text-slate-500">
          {{ outSize.w }} × {{ outSize.h }} px
        </p>
      </div>

      <fieldset class="rounded bg-slate-900/60 p-3">
        <legend class="px-1 text-slate-400">Datos sobre la imagen</legend>
        <div class="flex gap-2">
          <button
            v-for="mode in (['bar', 'overlay', 'none'] as ChromeMode[])"
            :key="mode"
            type="button"
            :data-testid="`export-chrome-${mode}`"
            :aria-pressed="prefs.chrome === mode"
            class="flex-1 rounded border px-2 py-1.5"
            :class="prefs.chrome === mode
              ? 'border-teal-400 bg-slate-700 text-teal-300'
              : 'border-slate-600 bg-slate-900 hover:bg-slate-700'"
            @click="setChrome(mode)"
          >
            {{ mode === 'bar' ? 'Franja' : mode === 'overlay' ? 'Superpuesto' : 'Sin datos' }}
          </button>
        </div>

        <div v-if="prefs.chrome !== 'none'" class="mt-3 grid grid-cols-2 gap-2">
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="export-part-title"
              :checked="prefs.parts.title"
              @change="setPart('title', ($event.target as HTMLInputElement).checked)"
            >
            <span>Marca</span>
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="export-part-meta"
              :checked="prefs.parts.meta"
              @change="setPart('meta', ($event.target as HTMLInputElement).checked)"
            >
            <span>Sitio, producto y hora</span>
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="export-part-legend"
              :checked="prefs.parts.legend"
              @change="setPart('legend', ($event.target as HTMLInputElement).checked)"
            >
            <span>Paleta de colores</span>
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="export-part-attribution"
              :checked="prefs.parts.attribution"
              @change="setPart('attribution', ($event.target as HTMLInputElement).checked)"
            >
            <span>Atribución</span>
          </label>
        </div>
      </fieldset>

      <fieldset class="rounded bg-slate-900/60 p-3">
        <legend class="px-1 text-slate-400">Marca</legend>
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            data-testid="export-part-watermark"
            :checked="prefs.parts.watermark"
            @change="setPart('watermark', ($event.target as HTMLInputElement).checked)"
          >
          <span>Logo como marca de agua</span>
        </label>

        <div class="mt-3 flex items-center gap-3">
          <img
            v-if="prefs.avatarDataUrl"
            :src="prefs.avatarDataUrl"
            alt=""
            data-testid="export-avatar-preview"
            class="size-10 rounded-full object-cover"
          >
          <div class="min-w-0 flex-1">
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                data-testid="export-part-avatar"
                :checked="prefs.parts.avatar"
                :disabled="!prefs.avatarDataUrl || prefs.chrome === 'none'"
                @change="setPart('avatar', ($event.target as HTMLInputElement).checked)"
              >
              <span :class="!prefs.avatarDataUrl || prefs.chrome === 'none' ? 'text-slate-500' : ''">
                Incluir mi foto
              </span>
            </label>
            <p class="pt-1 text-xs text-slate-500">
              Se guarda solo en este navegador y nunca se envía.
            </p>
          </div>
          <input
            type="file"
            accept="image/*"
            data-testid="export-avatar-file"
            class="w-36 shrink-0 text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-slate-200"
            @change="pickAvatar"
          >
          <button
            v-if="prefs.avatarDataUrl"
            type="button"
            data-testid="export-avatar-clear"
            class="shrink-0 rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-700"
            @click="clearAvatar"
          >
            Quitar
          </button>
        </div>
      </fieldset>

      <fieldset class="rounded bg-slate-900/60 p-3">
        <legend class="px-1 text-slate-400">Resolución</legend>
        <div class="flex gap-2">
          <button
            v-for="s in ([1, 2] as const)"
            :key="s"
            type="button"
            :data-testid="`export-scale-${s}`"
            :aria-pressed="prefs.scale === s"
            class="flex-1 rounded border px-2 py-1.5"
            :class="prefs.scale === s
              ? 'border-teal-400 bg-slate-700 text-teal-300'
              : 'border-slate-600 bg-slate-900 hover:bg-slate-700'"
            @click="setScale(s)"
          >
            {{ s }}×
          </button>
        </div>
      </fieldset>

      <fieldset class="rounded bg-slate-900/60 p-3">
        <legend class="px-1 text-slate-400">Animación</legend>
        <div class="flex gap-2">
          <button
            type="button"
            data-testid="export-anim-sequence"
            :aria-pressed="animKind === 'sequence'"
            :disabled="!canSequence || animBusy"
            class="flex-1 rounded border px-2 py-1.5 disabled:opacity-40"
            :class="animKind === 'sequence'
              ? 'border-teal-400 bg-slate-700 text-teal-300'
              : 'border-slate-600 bg-slate-900 hover:bg-slate-700'"
            @click="animKindPref = 'sequence'"
          >
            Secuencia del radar
          </button>
          <button
            type="button"
            data-testid="export-anim-phase"
            :aria-pressed="animKind === 'phase'"
            :disabled="animBusy"
            class="flex-1 rounded border px-2 py-1.5 disabled:opacity-40"
            :class="animKind === 'phase'
              ? 'border-teal-400 bg-slate-700 text-teal-300'
              : 'border-slate-600 bg-slate-900 hover:bg-slate-700'"
            @click="animKindPref = 'phase'"
          >
            Bucle de rayos
          </button>
        </div>

        <p v-if="!canSequence" class="pt-2 text-xs text-slate-500">
          Para exportar la secuencia, reproduce primero la animación: los frames se
          exportan del mismo pool que usa el reproductor.
        </p>

        <div class="mt-3 flex gap-2">
          <button
            type="button"
            data-testid="export-anim-format-gif"
            :aria-pressed="animFormat === 'gif'"
            :disabled="animBusy"
            class="flex-1 rounded border px-2 py-1.5 disabled:opacity-40"
            :class="animFormat === 'gif'
              ? 'border-teal-400 bg-slate-700 text-teal-300'
              : 'border-slate-600 bg-slate-900 hover:bg-slate-700'"
            @click="animFormat = 'gif'"
          >
            GIF
          </button>
          <button
            v-if="videoMime"
            type="button"
            data-testid="export-anim-format-video"
            :aria-pressed="animFormat === 'video'"
            :disabled="animBusy"
            class="flex-1 rounded border px-2 py-1.5 disabled:opacity-40"
            :class="animFormat === 'video'
              ? 'border-teal-400 bg-slate-700 text-teal-300'
              : 'border-slate-600 bg-slate-900 hover:bg-slate-700'"
            @click="animFormat = 'video'"
          >
            Vídeo
          </button>
        </div>

        <div class="mt-3 flex items-center gap-2">
          <button
            type="button"
            data-testid="export-anim-run"
            class="flex-1 rounded border border-teal-500 bg-teal-600/20 px-2 py-2 font-semibold text-teal-200 hover:bg-teal-600/40 disabled:opacity-40"
            :disabled="animBusy || busy || !handle"
            @click="generateAnimation"
          >
            {{ animBusy ? `Capturando ${animDone}/${animTotal}…` : 'Generar y descargar' }}
          </button>
          <button
            v-if="animBusy"
            type="button"
            data-testid="export-anim-cancel"
            class="shrink-0 rounded border border-slate-600 px-2 py-2 hover:bg-slate-700"
            @click="cancelAnimation"
          >
            Cancelar
          </button>
        </div>
        <p v-if="animNotice" data-testid="export-anim-notice" class="pt-2 text-xs text-slate-400">
          {{ animNotice }}
        </p>
      </fieldset>

      <p v-if="error" data-testid="export-error" class="rounded bg-amber-900/40 px-3 py-2 text-xs text-amber-200">
        {{ error }}
      </p>
      <p v-else-if="notice" data-testid="export-notice" class="text-xs text-slate-400">
        {{ notice }}
      </p>

      <div class="flex gap-2">
        <button
          type="button"
          data-testid="export-download"
          class="flex-1 rounded border border-teal-500 bg-teal-600/20 px-2 py-2 font-semibold text-teal-200 hover:bg-teal-600/40 disabled:opacity-40"
          :disabled="busy || !outSize"
          @click="download"
        >
          Descargar PNG
        </button>
        <button
          v-if="canCopy"
          type="button"
          data-testid="export-copy"
          class="flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-2 hover:bg-slate-700 disabled:opacity-40"
          :disabled="busy || !outSize"
          @click="copy"
        >
          Copiar
        </button>
      </div>
      <p class="truncate text-xs text-slate-500">{{ filename }}</p>
    </div>
  </dialog>
</template>
