<script setup lang="ts">
// Mapa del viewer: base OSM (Web Mercator), capa de cobertura del radar y
// capa(s) raster GeoTIFF (COG de R2) reproyectada en GPU desde la AEQD del
// radar (decisiones 2, 4, 6). Usar SIEMPRE dentro de <ClientOnly>:
// OpenLayers no corre en SSR, y el sufijo .client no sirve aquí — su
// wrapper (createClientOnly) monta con los template refs aún nulos.
//
// Modo dual (F3 paso 6): `frames` null/vacío ⇒ modo estático (una sola
// capa, flujo de F2 intacto — de esto dependen los goldens); `frames` con
// contenido ⇒ modo animación sobre un pool de capas (utils/map/frame-pool.ts).
import Feature from 'ol/Feature'
import Map from 'ol/Map'
import View from 'ol/View'
import { circular } from 'ol/geom/Polygon'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import WebGLTileLayer from 'ol/layer/WebGLTile'
import { fromLonLat } from 'ol/proj'
import GeoTIFF from 'ol/source/GeoTIFF'
import OSM from 'ol/source/OSM'
import VectorSource from 'ol/source/Vector'
import Stroke from 'ol/style/Stroke'
import Style from 'ol/style/Style'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'ol/ol.css'
import type { Radar, RasterMeta } from '#shared/contract'
import type { RasterProductDef } from '#shared/products'
import type { CursorSample } from '../utils/map/cursor'
import { sampleFromLevel } from '../utils/map/cursor'
import { FramePool } from '../utils/map/frame-pool'
import { registerRadarProjection } from '../utils/map/projection'
import { rasterStyle } from '../utils/map/raster-style'

const props = withDefaults(defineProps<{
  radar: Radar
  raster: RasterMeta | null
  /** modo animación: serie completa del día cargado; null/vacío = modo estático */
  frames?: RasterMeta[] | null
  activeFrame?: number
  productDef: RasterProductDef | null
  opacity: number
  /** apagar la base OSM (goldens visuales: fondo determinista) */
  showBase?: boolean
}>(), { showBase: true, frames: null, activeFrame: 0 })

const emit = defineEmits<{
  cursor: [sample: CursorSample | null]
  rasterError: [message: string]
  frameReady: [index: number]
  frameError: [index: number, message: string]
  moveEnd: []
}>()

const container = ref<HTMLDivElement>()

let map: Map | undefined
let baseLayer: TileLayer<OSM> | undefined
let rasterLayer: WebGLTileLayer | undefined // modo estático
let pool: FramePool | undefined // modo animación
const coverageSource = new VectorSource()

const animationMode = () => Array.isArray(props.frames) && props.frames.length > 0

// 'true' cuando el raster vigente terminó de renderizar (rendercomplete de
// OL espera a los tiles) — los goldens de Playwright esperan este attr.
// En modo animación refleja si el frame ACTIVO está listo.
const rasterLoaded = ref('none')

/** radio de cobertura en metros: mitad del ancho de la malla AEQD */
function coverageRadiusM(): number {
  const meta = animationMode() ? props.frames![props.activeFrame] : props.raster
  return meta ? (meta.width / 2) * meta.cell_m : 460_000
}

function updateCoverage() {
  coverageSource.clear()
  const circle = circular([props.radar.lon, props.radar.lat], coverageRadiusM(), 128)
  coverageSource.addFeature(new Feature(circle.transform('EPSG:4326', 'EPSG:3857')))
}

// ── Modo estático (F2, intacto) ─────────────────────────────────────────

function updateRasterLayer() {
  if (rasterLayer) {
    map?.removeLayer(rasterLayer)
    rasterLayer.dispose()
    rasterLayer = undefined
  }
  emit('cursor', null)
  rasterLoaded.value = 'none'

  const { raster, productDef, radar } = props
  if (!map || !raster?.cog_url || !productDef) return
  rasterLoaded.value = 'false'

  const projCode = registerRadarProjection(radar.site_id, radar.proj4)
  const source = new GeoTIFF({
    sources: [{ url: raster.cog_url }],
    normalize: false,
    interpolate: false,
    projection: projCode,
    // sin fade de tiles: render determinista (goldens) y frames nítidos
    transition: 0,
  })
  source.on('change', () => {
    if (source.getState() === 'error') {
      emit('rasterError', `No se pudo cargar el COG (${raster.r2_key})`)
    }
  })

  rasterLayer = new WebGLTileLayer({
    source,
    style: rasterStyle(productDef.palette, raster.value_scale, raster.value_offset, raster.max_level),
    opacity: props.opacity,
    zIndex: 5,
  })
  map.addLayer(rasterLayer)
  map.once('rendercomplete', () => {
    rasterLoaded.value = 'true'
  })
}

// ── Modo animación (F3 paso 6) ───────────────────────────────────────────

function teardownPool() {
  pool?.dispose()
  pool = undefined
}

function initOrUpdatePool() {
  if (!map || !props.productDef || !animationMode()) return
  const frames = props.frames!
  const projCode = registerRadarProjection(props.radar.site_id, props.radar.proj4)
  const style = rasterStyle(
    props.productDef.palette,
    frames[0]!.value_scale,
    frames[0]!.value_offset,
    frames[0]!.max_level,
  )
  if (!pool) {
    pool = new FramePool(map, projCode, style, {
      onFrameReady: (i) => {
        emit('frameReady', i)
        if (i === props.activeFrame) rasterLoaded.value = 'true'
      },
      onFrameError: (i, message) => {
        emit('frameError', i, message)
        emit('rasterError', message)
      },
    }, props.opacity)
  }
  rasterLoaded.value = 'false'
  pool.setFrames(frames)
  pool.activate(props.activeFrame)
}

onMounted(() => {
  baseLayer = new TileLayer({ source: new OSM(), zIndex: 0, visible: props.showBase })
  map = new Map({
    target: container.value,
    layers: [
      baseLayer,
      new VectorLayer({
        source: coverageSource,
        zIndex: 10,
        style: new Style({ stroke: new Stroke({ color: 'rgba(148,163,184,0.9)', width: 1.5 }) }),
      }),
    ],
    view: new View({
      center: fromLonLat([props.radar.lon, props.radar.lat]),
      zoom: 8,
    }),
  })

  map.on('pointermove', (evt) => {
    if (evt.dragging) {
      emit('cursor', null)
      return
    }
    const activeLayer = animationMode() ? pool?.getActiveLayer() : rasterLayer
    const activeMeta = animationMode() ? props.frames?.[props.activeFrame] : props.raster
    if (!activeLayer || !activeMeta) {
      emit('cursor', null)
      return
    }
    const data = activeLayer.getData(evt.pixel)
    const level = data && !(data instanceof DataView) && data.length > 0
      ? Number(data[0])
      : Number.NaN
    emit('cursor', sampleFromLevel(level, activeMeta.value_scale, activeMeta.value_offset))
  })
  map.getViewport().addEventListener('pointerleave', () => emit('cursor', null))
  map.on('moveend', () => {
    if (animationMode()) pool?.invalidateInactive()
    emit('moveEnd')
  })

  updateCoverage()
  if (animationMode()) initOrUpdatePool()
  else updateRasterLayer()
})

watch(() => props.radar.site_id, () => {
  map?.getView().animate({ center: fromLonLat([props.radar.lon, props.radar.lat]), duration: 300 })
  updateCoverage()
})

// cambio de site/product/día: reconstruye el modo que corresponda
watch(
  () => [props.raster?.r2_key, props.productDef?.code, props.frames],
  () => {
    updateCoverage()
    if (animationMode()) {
      if (rasterLayer) {
        map?.removeLayer(rasterLayer)
        rasterLayer.dispose()
        rasterLayer = undefined
      }
      initOrUpdatePool()
    }
    else {
      teardownPool()
      updateRasterLayer()
    }
  },
)

// scrubbing / avance de la animación: swap dentro del mismo pool, sin
// refetch si ya estaba listo (texturas ya en GPU)
watch(() => props.activeFrame, (i) => {
  if (!animationMode() || !pool) return
  pool.activate(i)
  rasterLoaded.value = pool.isReady(i) ? 'true' : 'false'
})

watch(() => props.opacity, (o) => {
  rasterLayer?.setOpacity(o)
  pool?.setOpacity(o)
})
watch(() => props.showBase, v => baseLayer?.setVisible(v))

onBeforeUnmount(() => {
  teardownPool()
  map?.setTarget(undefined)
  map = undefined
})
</script>

<template>
  <div
    ref="container"
    data-testid="radar-map"
    :data-raster-loaded="rasterLoaded"
    class="h-full w-full"
  />
</template>
