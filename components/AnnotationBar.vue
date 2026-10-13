<script setup lang="ts">
// Barra flotante del modo anotación (F7.2). Visible solo con el modo
// encendido; el estado vive en annotationMachine (decisión 18), aquí solo
// entran props y salen eventos.
//
// Centrada abajo sobre el timebar: la esquina superior izquierda es del chip
// de radar/producto y la derecha del menú de capas (D36).
import type { AnnotationKind } from '../utils/export/annotations'
import { ANNOTATION_COLORS } from '../utils/export/annotations'

defineProps<{
  tool: AnnotationKind
  color: string
  text: string
  /** anotaciones del sitio mostrado — habilita deshacer/borrar */
  count: number
}>()

defineEmits<{
  'set-tool': [tool: AnnotationKind]
  'set-color': [color: string]
  'set-text': [text: string]
  'undo': []
  'clear': []
  'close': []
}>()

const { t } = useI18n()

const TOOLS: { kind: AnnotationKind, label: string, glyph: string }[] = [
  { kind: 'arrow', label: t('export.annotations.tools.arrow'), glyph: '↗' },
  { kind: 'circle', label: t('export.annotations.tools.circle'), glyph: '◯' },
  { kind: 'freehand', label: t('export.annotations.tools.freehand'), glyph: '✎' },
  { kind: 'text', label: t('export.annotations.tools.text'), glyph: 'T' },
]
</script>

<template>
  <div
    data-testid="annotation-bar"
    class="pointer-events-auto absolute bottom-28 left-1/2 z-20 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-lg border border-slate-500 bg-slate-900/90 px-3 py-2 shadow-lg backdrop-blur"
  >
    <div class="flex gap-1">
      <button
        v-for="item in TOOLS"
        :key="item.kind"
        type="button"
        :data-testid="`annotation-tool-${item.kind}`"
        :aria-pressed="tool === item.kind"
        :title="item.label"
        class="size-9 rounded border text-base"
        :class="tool === item.kind
          ? 'border-teal-400 bg-slate-700 text-teal-300'
          : 'border-slate-500 bg-slate-800 hover:bg-slate-700'"
        @click="$emit('set-tool', item.kind)"
      >
        {{ item.glyph }}
      </button>
    </div>

    <div class="flex gap-1">
      <button
        v-for="c in ANNOTATION_COLORS"
        :key="c"
        type="button"
        :data-testid="`annotation-color-${c.slice(1)}`"
        :aria-pressed="color === c"
        :title="t('export.annotations.color', { hex: c })"
        class="size-6 rounded-full border-2"
        :class="color === c ? 'border-teal-300' : 'border-slate-500'"
        :style="{ backgroundColor: c }"
        @click="$emit('set-color', c)"
      />
    </div>

    <input
      v-if="tool === 'text'"
      :value="text"
      data-testid="annotation-text"
      type="text"
      maxlength="120"
      :placeholder="t('export.annotations.textPlaceholder')"
      class="w-44 rounded border border-slate-500 bg-slate-800 px-2 py-1 text-sm"
      @input="$emit('set-text', ($event.target as HTMLInputElement).value)"
    >
    <p v-if="tool === 'text' && !text" class="text-xs text-amber-300">
      {{ t('export.annotations.textHint') }}
    </p>

    <div class="flex gap-1">
      <button
        type="button"
        data-testid="annotation-undo"
        class="rounded border border-slate-500 bg-slate-800 px-2 py-1.5 text-xs hover:bg-slate-700 disabled:opacity-40"
        :disabled="count === 0"
        @click="$emit('undo')"
      >
        {{ t('export.annotations.undo') }}
      </button>
      <button
        type="button"
        data-testid="annotation-clear"
        class="rounded border border-slate-500 bg-slate-800 px-2 py-1.5 text-xs hover:bg-slate-700 disabled:opacity-40"
        :disabled="count === 0"
        @click="$emit('clear')"
      >
        {{ t('export.annotations.clear') }}
      </button>
      <button
        type="button"
        data-testid="annotation-close"
        class="rounded border border-teal-500 bg-teal-600/20 px-2 py-1.5 text-xs text-teal-200 hover:bg-teal-600/40"
        @click="$emit('close')"
      >
        {{ t('export.annotations.done') }}
      </button>
    </div>
  </div>
</template>
