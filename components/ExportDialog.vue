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
import type { MapCaptureHandle } from '../utils/export/types'
import { captureMap } from '../utils/export/capture'
import { exportFilename } from '../utils/export/filename'
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
}>()

const TITLE = 'LAMULA WebViewer'

const dialog = ref<HTMLDialogElement>()
const prefs = ref(loadExportPrefs())
const preview = ref<HTMLCanvasElement>()
const busy = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const outSize = ref<{ w: number, h: number } | null>(null)

const canCopy = canCopyImages()

let rendered: HTMLCanvasElement | null = null

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
    const result = await captureMap(props.handle, {
      pixelRatio: prefs.value.scale,
      chrome: spec.value,
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

defineExpose({
  open: () => {
    dialog.value?.showModal()
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
