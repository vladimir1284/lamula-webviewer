<script setup lang="ts">
// Menú de capas único y flotante (D36): reemplaza el resto del aside
// izquierdo (todo salvo identidad/estado del raster, que vive en
// RadarProductChip.vue) — mapa base, opacidad, suavizado, satélite,
// fenómenos, viento, rayos, día, y los 3 accesos a datos (Celdas/Tendencia/
// VWP) que antes eran el rail derecho + el botón del aside. Un solo árbol
// DOM: el contenido no se duplica entre escritorio/mobile, solo cambia de
// posición vía clases responsive de Tailwind (md:) — sin composable de
// media query (SSR + matchMedia meten flash de hidratación; CSS puro no).
import { ref } from 'vue'
import type { BaseMapId } from '#shared/basemaps'
import { BASE_MAP_IDS, BASE_MAP_LABELS } from '#shared/basemaps'
import type { WindLevel } from '#shared/contract'
import { WIND_LEVEL_LABELS, WIND_LEVELS } from '#shared/contract'
import type { OverlayLayerId, PanelId } from '../machines/overlay'

defineProps<{
  base: BaseMapId
  /** false cuando el producto activo no tiene paleta en el catálogo (D36):
      oculta opacidad/suavizado, que no aplican sin paleta — igual que el
      antiguo v-if="productDef" del aside */
  hasPalette: boolean
  opacity: number
  smooth: boolean
  smoothRadius: 1 | 2 | 4 | 8
  animationEngaged: boolean
  sat: boolean
  satVariant: 'ir' | 'vis'
  satOpacity: number
  satTimeLabel: string | null
  layers: OverlayLayerId[]
  windLevel: WindLevel
  windInfo: string | null
  lightningInfo: string | null
  overlayJoinInfo: string | null
  availableDays: string[]
  day: string
}>()

const emit = defineEmits<{
  'select-base': [event: Event]
  'opacity-input': [event: Event]
  'toggle-smooth': [event: Event]
  'select-smooth-radius': [event: Event]
  'toggle-satellite': []
  'select-sat-variant': [event: Event]
  'sat-opacity-input': [event: Event]
  'toggle-layer': [layer: OverlayLayerId]
  'select-wind-level': [event: Event]
  'select-day': [day: string]
  'open-panel': [panel: PanelId]
}>()

const open = ref(false)

function openPanel(panel: PanelId) {
  open.value = false
  emit('open-panel', panel)
}
</script>

<template>
  <div>
    <button
      type="button"
      data-testid="layers-menu-toggle"
      class="pointer-events-auto absolute right-4 top-4 z-20 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-sm font-bold shadow-lg"
      @click="open = !open"
    >
      <span aria-hidden="true">☰</span> Capas
    </button>

    <div
      v-if="open"
      class="pointer-events-auto fixed inset-0 z-30"
      aria-hidden="true"
      @click="open = false"
    />

    <div
      v-if="open"
      data-testid="layers-menu"
      class="pointer-events-auto fixed inset-0 z-40 overflow-y-auto bg-slate-900 p-4 md:absolute md:inset-auto md:right-4 md:top-16 md:w-80 md:rounded-lg md:border md:border-slate-700 md:bg-slate-900/95 md:p-3 md:shadow-lg"
    >
      <div class="mb-3 flex items-center justify-between md:hidden">
        <h2 class="text-sm font-bold">Capas</h2>
        <button
          type="button"
          data-testid="layers-menu-close"
          aria-label="Cerrar"
          class="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          @click="open = false"
        >
          ✕
        </button>
      </div>

      <div class="space-y-4 text-sm">
        <label class="block">
          <span class="mb-1 block text-slate-400">Mapa base</span>
          <!-- sin opción 'off': apagar la base es cosa de e2e/goldens (?base=off),
               no una elección de usuario; con base=off el select muestra el default -->
          <select
            :value="base === 'off' ? 'osm' : base"
            data-testid="base-select"
            class="w-full rounded border border-slate-600 bg-slate-800 p-2"
            @change="emit('select-base', $event)"
          >
            <option v-for="id in BASE_MAP_IDS" :key="id" :value="id">
              {{ BASE_MAP_LABELS[id] }}
            </option>
          </select>
        </label>

        <template v-if="hasPalette">
          <label class="block">
            <span class="mb-1 block text-slate-400">Opacidad</span>
            <input
              :value="opacity"
              data-testid="opacity-slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              class="w-full"
              @input="emit('opacity-input', $event)"
            >
          </label>

          <label class="flex items-center gap-2" :class="{ 'opacity-50': animationEngaged }">
            <input
              type="checkbox"
              data-testid="smooth-toggle"
              :checked="smooth"
              :disabled="animationEngaged"
              @change="emit('toggle-smooth', $event)"
            >
            <span>Suavizar celdas del raster</span>
          </label>

          <label
            v-if="smooth"
            class="block"
            :class="{ 'opacity-50': animationEngaged }"
          >
            <span class="mb-1 block text-slate-400">Radio de suavizado</span>
            <select
              data-testid="smooth-radius-select"
              :value="smoothRadius"
              :disabled="animationEngaged"
              class="w-full rounded bg-slate-800 text-slate-100"
              @change="emit('select-smooth-radius', $event)"
            >
              <option value="1">1× (sin remuestreo)</option>
              <option value="2">2×</option>
              <option value="4">4×</option>
              <option value="8">8×</option>
            </select>
          </label>

          <p v-if="animationEngaged" class="text-xs text-slate-400">
            No disponible durante la animación.
          </p>
        </template>

        <fieldset class="rounded bg-slate-800 p-3">
          <legend class="px-1 text-slate-400">Satélite</legend>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="sat-toggle"
              :checked="sat"
              @change="emit('toggle-satellite')"
            >
            <span>Mostrar capa GOES</span>
          </label>
          <p v-if="satTimeLabel" data-testid="sat-time" class="mt-1 font-mono text-xs text-slate-400">
            {{ satTimeLabel }}
          </p>
          <template v-if="sat">
            <label class="mt-2 block">
              <span class="mb-1 block text-slate-400">Variante</span>
              <select
                :value="satVariant"
                data-testid="sat-variant-select"
                class="w-full rounded border border-slate-600 bg-slate-800 p-2"
                @change="emit('select-sat-variant', $event)"
              >
                <option value="ir">Infrarrojo</option>
                <option value="vis">Visible</option>
              </select>
            </label>
            <label class="mt-2 block">
              <span class="mb-1 block text-slate-400">Opacidad</span>
              <input
                :value="satOpacity"
                data-testid="sat-opacity-slider"
                type="range"
                min="0"
                max="1"
                step="0.05"
                class="w-full"
                @input="emit('sat-opacity-input', $event)"
              >
            </label>
            <p class="mt-1 text-xs text-slate-400">
              No se muestra durante la animación.
            </p>
          </template>
        </fieldset>

        <fieldset class="rounded bg-slate-800 p-3">
          <legend class="px-1 text-slate-400">Fenómenos</legend>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="layer-toggle-cells"
              :checked="layers.includes('cells')"
              @change="emit('toggle-layer', 'cells')"
            >
            <span>Celdas de tormenta</span>
          </label>
          <template v-if="layers.includes('cells')">
            <label class="mt-1 flex items-center gap-2 pl-4">
              <input
                type="checkbox"
                data-testid="layer-toggle-track-past"
                :checked="layers.includes('trackPast')"
                @change="emit('toggle-layer', 'trackPast')"
              >
              <span>Trayectoria pasada (todas)</span>
            </label>
            <label class="mt-1 flex items-center gap-2 pl-4">
              <input
                type="checkbox"
                data-testid="layer-toggle-track-future"
                :checked="layers.includes('trackFuture')"
                @change="emit('toggle-layer', 'trackFuture')"
              >
              <span>Trayectoria futura (todas)</span>
            </label>
          </template>
          <label class="mt-1 flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="layer-toggle-meso"
              :checked="layers.includes('meso')"
              @change="emit('toggle-layer', 'meso')"
            >
            <span>Mesociclones / TVS</span>
          </label>
          <p
            v-if="overlayJoinInfo"
            data-testid="overlay-info"
            class="mt-2 text-xs text-slate-400"
          >
            {{ overlayJoinInfo }}
          </p>
        </fieldset>

        <fieldset class="rounded bg-slate-800 p-3">
          <legend class="px-1 text-slate-400">Viento</legend>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="layer-toggle-wind"
              :checked="layers.includes('wind')"
              @change="emit('toggle-layer', 'wind')"
            >
            <span>Viento ({{ WIND_LEVEL_LABELS[windLevel] }})</span>
          </label>
          <label
            v-if="layers.includes('wind')"
            class="mt-2 block"
          >
            <span class="mb-1 block text-slate-400">Nivel de altura</span>
            <select
              :value="windLevel"
              data-testid="wind-level-select"
              class="w-full rounded border border-slate-600 bg-slate-800 p-2"
              @change="emit('select-wind-level', $event)"
            >
              <option v-for="level in WIND_LEVELS" :key="level" :value="level">
                {{ WIND_LEVEL_LABELS[level] }}
              </option>
            </select>
          </label>
          <p
            v-if="windInfo"
            data-testid="wind-info"
            class="mt-2 text-xs text-slate-400"
          >
            {{ windInfo }}
          </p>
          <p
            v-if="layers.includes('wind')"
            class="mt-1 text-xs text-slate-400"
          >
            No se muestra durante la animación.
          </p>
        </fieldset>

        <fieldset class="rounded bg-slate-800 p-3">
          <legend class="px-1 text-slate-400">Rayos</legend>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="layer-toggle-lightning"
              :checked="layers.includes('lightning')"
              @change="emit('toggle-layer', 'lightning')"
            >
            <span>Descargas eléctricas</span>
          </label>
          <p
            v-if="lightningInfo"
            data-testid="lightning-info"
            class="mt-2 text-xs text-slate-400"
          >
            {{ lightningInfo }}
          </p>
          <p
            v-if="layers.includes('lightning')"
            class="mt-1 text-xs text-slate-400"
          >
            No se muestra durante la animación.
          </p>
        </fieldset>

        <fieldset class="rounded bg-slate-800 p-3">
          <legend class="px-1 text-slate-400">Datos</legend>
          <div class="flex gap-2">
            <button
              type="button"
              data-testid="panel-open-cells"
              class="flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1.5 hover:bg-slate-700"
              @click="openPanel('cells')"
            >
              Celdas
            </button>
            <button
              type="button"
              data-testid="panel-open-trend"
              class="flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1.5 hover:bg-slate-700"
              @click="openPanel('trend')"
            >
              Tendencia
            </button>
            <button
              type="button"
              data-testid="vwp-open"
              class="flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1.5 hover:bg-slate-700"
              @click="openPanel('vwp')"
            >
              VWP
            </button>
          </div>
        </fieldset>

        <DayPicker
          v-if="availableDays.length > 0"
          :days="availableDays"
          :model-value="day"
          @update:model-value="emit('select-day', $event)"
        />
      </div>
    </div>
  </div>
</template>
