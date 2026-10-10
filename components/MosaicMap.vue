<script setup lang="ts">
// Mapa del mosaico multi-radar (D43/P4). Hermano reducido de RadarMap.vue:
// mismo patrón de fondo OSM + raster WebGL desde un COG de R2, pero SIN
// fenómenos/VWP/viento/rayos/anotaciones/export (alcance recortado a
// propósito, ver machines/mosaic-viewer.ts) y SOLO modo estático — el pool
// de animación (utils/map/frame-pool.ts) asume una única proyección
// compartida por toda la ventana de frames, y la geometría del mosaico es
// POR FILA (añadir un radar recalcula la malla, docs/decisiones.md D43):
// animar una ventana que cruza un recálculo de dominio reproyectaría mal
// los frames viejos. Queda para una iteración futura (requiere detectar el
// caso común — proj4 estable en la ventana — y degradar con aviso si no).
//
// Capa propia (zIndex 10, igual que la máscara de cobertura de un solo
// radar): anillos de alcance por sitio miembro del dominio, sólidos para
// los que aportaron al slot mostrado y punteados/atenuados para los
// ausentes — el usuario siempre sabe qué radares componen lo que ve.
import Map from 'ol/Map'
import { defaults as defaultControls } from 'ol/control'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import WebGLTileLayer from 'ol/layer/WebGLTile'
import { fromLonLat, toLonLat } from 'ol/proj'
import GeoTIFF from 'ol/source/GeoTIFF'
import type TileSource from 'ol/source/Tile'
import VectorSource from 'ol/source/Vector'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'ol/ol.css'
import type { BaseMapId } from '#shared/basemaps'
import type { MosaicRasterMeta } from '#shared/contract'
import type { RasterProductDef } from '#shared/products'
import type { CursorSample } from '../utils/map/cursor'
import { sampleFromLevel } from '../utils/map/cursor'
import { createBaseMapSources } from '../utils/map/base-layers'
import { getCogBlob } from '../utils/map/cog-cache'
import type { CoverageSite } from '../utils/map/coverage-rings-layer'
import {
  buildCoverageCenterFeatures,
  buildCoverageFeatures,
  coverageCenterStyle,
  coverageRingStyle,
} from '../utils/map/coverage-rings-layer'
import { registerDomainProjection } from '../utils/map/projection'
import { rasterStyle } from '../utils/map/raster-style'

const props = withDefaults(defineProps<{
  raster: MosaicRasterMeta | null
  productDef: RasterProductDef | null
  opacity: number
  baseMap?: BaseMapId
  sites: CoverageSite[]
  radiusM: number
  contributing: string[]
  showCoverage?: boolean
}>(), {
  baseMap: 'osm',
  showCoverage: true,
})

const emit = defineEmits<{
  cursor: [sample: CursorSample | null]
  rasterError: [message: string]
}>()

const container = ref<HTMLDivElement>()
let resizeObserver: ResizeObserver | undefined
let map: Map | undefined
let baseLayer: TileLayer<TileSource> | undefined
let labelsLayer: TileLayer<TileSource> | undefined
let coverageLayer: VectorLayer<VectorSource> | undefined
let coverageCenterLayer: VectorLayer<VectorSource> | undefined
let rasterLayer: WebGLTileLayer | undefined
let rasterRequestId = 0
const coverageSource = new VectorSource()
const coverageCenterSource = new VectorSource()

const rasterLoaded = ref('none')

function domainCenter(): [number, number] {
  if (props.sites.length === 0) return [0, 0]
  const lon = props.sites.reduce((sum, s) => sum + s.lon, 0) / props.sites.length
  const lat = props.sites.reduce((sum, s) => sum + s.lat, 0) / props.sites.length
  return [lon, lat]
}

function updateCoverage() {
  coverageSource.clear()
  coverageCenterSource.clear()
  const contributingSet = new Set(props.contributing)
  coverageSource.addFeatures(buildCoverageFeatures(props.sites, props.radiusM, contributingSet))
  coverageCenterSource.addFeatures(buildCoverageCenterFeatures(props.sites, contributingSet))
}

function updateBaseMap() {
  if (!baseLayer || !labelsLayer) return
  const { base, labels } = createBaseMapSources(props.baseMap)
  baseLayer.setSource(base)
  baseLayer.setVisible(base !== null)
  labelsLayer.setSource(labels)
  labelsLayer.setVisible(labels !== null)
}

function updateRasterLayer() {
  rasterRequestId += 1
  const requestId = rasterRequestId
  if (rasterLayer) {
    map?.removeLayer(rasterLayer)
    rasterLayer.dispose()
    rasterLayer = undefined
  }
  emit('cursor', null)
  rasterLoaded.value = 'none'

  const { raster, productDef } = props
  if (!map || !raster?.cog_url || !productDef) return
  rasterLoaded.value = 'false'

  // geometría POR FILA (D43): se registra la proyección de ESTE raster, no
  // una compartida por el dominio — ver nota de registerDomainProjection.
  const projCode = registerDomainProjection(raster.proj4)

  getCogBlob(raster.r2_key, raster.cog_url)
    .then((blob) => {
      if (requestId !== rasterRequestId || !map) return

      const source = new GeoTIFF({
        sources: [{ blob }],
        normalize: false,
        interpolate: false,
        projection: projCode,
        transition: 0,
      })
      source.on('change', () => {
        if (source.getState() === 'error') {
          emit('rasterError', `No se pudo cargar el COG del mosaico (${raster.r2_key})`)
        }
      })
      const style = rasterStyle(productDef.palette, raster.value_scale, raster.value_offset, raster.max_level)

      if (requestId !== rasterRequestId || !map) return

      rasterLayer = new WebGLTileLayer({ source, style, opacity: props.opacity, zIndex: 5 })
      map.addLayer(rasterLayer)
      map.once('rendercomplete', () => { rasterLoaded.value = 'true' })
    })
    .catch(() => {
      if (requestId !== rasterRequestId) return
      emit('rasterError', `No se pudo cargar el COG del mosaico (${raster.r2_key})`)
    })
}

onMounted(() => {
  const { base, labels } = createBaseMapSources(props.baseMap)
  baseLayer = new TileLayer({ source: base ?? undefined, zIndex: 0, visible: base !== null })
  labelsLayer = new TileLayer({ source: labels ?? undefined, zIndex: 18, visible: labels !== null })
  map = new Map({
    target: container.value,
    controls: defaultControls({ zoom: false }),
    layers: [
      baseLayer,
      (coverageLayer = new VectorLayer({
        source: coverageSource,
        zIndex: 10,
        visible: props.showCoverage,
        style: f => coverageRingStyle(f as never),
      })),
      (coverageCenterLayer = new VectorLayer({
        source: coverageCenterSource,
        zIndex: 11,
        visible: props.showCoverage,
        style: f => coverageCenterStyle(f as never),
      })),
      labelsLayer,
    ],
    view: new View({ center: fromLonLat(domainCenter()), zoom: 6 }),
  })

  map.on('pointermove', (evt) => {
    if (evt.dragging) {
      emit('cursor', null)
      return
    }
    const [lon, lat] = toLonLat(evt.coordinate)
    if (!rasterLayer || !props.raster) {
      emit('cursor', { lon, lat, level: null, value: null, rangeFolded: false })
      return
    }
    const data = rasterLayer.getData(evt.pixel)
    const level = data && !(data instanceof DataView) && data.length > 0 ? Number(data[0]) : Number.NaN
    const sample = sampleFromLevel(level, props.raster.value_scale, props.raster.value_offset, false)
    emit('cursor', { lon, lat, level: sample?.level ?? null, value: sample?.value ?? null, rangeFolded: sample?.rangeFolded ?? false })
  })
  const viewport = map.getViewport()
  viewport.addEventListener('pointerleave', () => emit('cursor', null))

  updateCoverage()
  updateRasterLayer()

  resizeObserver = new ResizeObserver(() => map?.updateSize())
  resizeObserver.observe(container.value!)
})

watch(() => props.sites, () => {
  if (!map) return
  map.getView().animate({ center: fromLonLat(domainCenter()), duration: 300 })
  updateCoverage()
})

watch(() => [props.raster?.r2_key, props.productDef?.code], () => updateRasterLayer())
watch(() => props.opacity, (opacity) => rasterLayer?.setOpacity(opacity))
watch(() => props.baseMap, updateBaseMap)
watch(() => props.showCoverage, (show) => {
  coverageLayer?.setVisible(show)
  coverageCenterLayer?.setVisible(show)
})
watch(() => props.contributing, updateCoverage)
watch(() => props.radiusM, updateCoverage)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  map?.setTarget(undefined)
})

defineExpose({ rasterLoaded })
</script>

<template>
  <div ref="container" class="h-full w-full" :data-raster-loaded="rasterLoaded" />
</template>
