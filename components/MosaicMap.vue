<script setup lang="ts">
// Mapa del mosaico multi-radar (D43/P4). Hermano reducido de RadarMap.vue:
// mismo patrón de fondo OSM + raster WebGL desde un COG de R2. Desde D49
// monta también satélite (zIndex 3), viento (15) y rayos (19) con las
// MISMAS clases de capa que RadarMap.vue — lo que sigue fuera a propósito
// es VWP/meso/trayectorias, anotaciones y export (ver
// machines/mosaic-viewer.ts). SOLO modo estático — el pool
// de animación (utils/map/frame-pool.ts) asume una única proyección
// compartida por toda la ventana de frames, y la geometría del mosaico es
// POR FILA (añadir un radar recalcula la malla, docs/decisiones.md D43):
// animar una ventana que cruza un recálculo de dominio reproyectaría mal
// los frames viejos. Queda para una iteración futura (requiere detectar el
// caso común — proj4 estable en la ventana — y degradar con aviso si no).
//
// Capa propia (zIndex 10, igual que la máscara de cobertura de un solo
// radar en RadarMap.vue): máscara de opacidad que oscurece todo el mapa
// salvo los círculos de los radares que aportaron al slot mostrado (D46) —
// mismo criterio que RadarMap: sin dato ⇒ oscuro. Marcador+label (zIndex 11)
// solo para los contribuyentes; los ausentes no llevan marca.
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
import type { MosaicRasterMeta, Phenomenon, WindGridFile } from '#shared/contract'
import type { RasterProductDef } from '#shared/products'
import type { CursorSample } from '../utils/map/cursor'
import { sampleFromLevel } from '../utils/map/cursor'
import { createBaseMapSources } from '../utils/map/base-layers'
import { getCogBlob } from '../utils/map/cog-cache'
import type { CoverageSite } from '../utils/map/coverage-rings-layer'
import { buildCoverageCenterFeatures, coverageCenterStyle } from '../utils/map/coverage-rings-layer'
import { buildMaskCircles, CoverageMaskLayer } from '../utils/map/coverage-mask-layer'
import { registerDomainProjection } from '../utils/map/projection'
import { rasterStyle } from '../utils/map/raster-style'
import { buildMosaicCellFeatures, mosaicCellStyle } from '../utils/map/mosaic-cells-layer'
import { createSatelliteLayer, setSatelliteTime, setSatelliteVariant, type SatVariant } from '../utils/map/satellite-layer'
import { WindParticleLayer } from '../utils/map/wind-layer'
import { LightningLayer } from '../utils/map/lightning-layer'
import type { NormalizedStrike } from '../utils/overlay/lightning-join'

const props = withDefaults(defineProps<{
  raster: MosaicRasterMeta | null
  productDef: RasterProductDef | null
  opacity: number
  baseMap?: BaseMapId
  sites: CoverageSite[]
  radiusM: number
  contributing: string[]
  showCoverage?: boolean
  /** celdas multi-radar del slot mostrado (P5/D45), sin deduplicar entre sitios */
  cells?: Phenomenon[]
  selectedCell?: string | null
  /** capa GOES de fondo (D49) — WMS global, no depende del dominio */
  satEnabled?: boolean
  satVariant?: SatVariant
  satOpacity?: number
  /** campo u/v YA UNIDO de los sitios del dominio (D49); null = capa limpia */
  windGrid?: WindGridFile | null
  /** descargas de la ventana del slot, unidas entre sitios; null = capa limpia */
  lightningStrikes?: NormalizedStrike[] | null
}>(), {
  baseMap: 'osm',
  showCoverage: true,
  cells: () => [],
  selectedCell: null,
  satEnabled: false,
  satVariant: 'ir',
  satOpacity: 0.6,
  windGrid: null,
  lightningStrikes: null,
})

const emit = defineEmits<{
  cursor: [sample: CursorSample | null]
  rasterError: [message: string]
  selectCell: [cellId: string | null]
}>()

const container = ref<HTMLDivElement>()
let resizeObserver: ResizeObserver | undefined
let map: Map | undefined
let baseLayer: TileLayer<TileSource> | undefined
let labelsLayer: TileLayer<TileSource> | undefined
let coverageMaskLayer: CoverageMaskLayer | undefined
let coverageCenterLayer: VectorLayer<VectorSource> | undefined
let cellsLayer: VectorLayer<VectorSource> | undefined
let satelliteLayer: ReturnType<typeof createSatelliteLayer> | undefined
let windLayer: WindParticleLayer | undefined
let lightningLayer: LightningLayer | undefined
let rasterLayer: WebGLTileLayer | undefined
let rasterRequestId = 0
const coverageCenterSource = new VectorSource()
const cellsSource = new VectorSource()

const rasterLoaded = ref('none')

function domainCenter(): [number, number] {
  if (props.sites.length === 0) return [0, 0]
  const lon = props.sites.reduce((sum, s) => sum + s.lon, 0) / props.sites.length
  const lat = props.sites.reduce((sum, s) => sum + s.lat, 0) / props.sites.length
  return [lon, lat]
}

function updateCoverage() {
  const contributingSet = new Set(props.contributing)
  coverageMaskLayer?.setCircles(buildMaskCircles(props.sites, props.radiusM, contributingSet))
  coverageCenterSource.clear()
  const contributingSites = props.sites.filter(site => contributingSet.has(site.site_id))
  coverageCenterSource.addFeatures(buildCoverageCenterFeatures(contributingSites, contributingSet))
}

function updateCells() {
  cellsSource.clear()
  const siteOrder = props.sites.map(s => s.site_id)
  cellsSource.addFeatures(buildMosaicCellFeatures(props.cells, siteOrder, props.selectedCell))
}

// ── Capas de overlay compartidas con el viewer de un solo radar (D49) ────
// Mismos zIndex que RadarMap.vue: satélite bajo el raster (3 < 5), viento
// 15, rayos 19 (sobre labels 18, bajo celdas 20). Sin animación en esta
// vista, así que ninguna se pausa: `setPaused(false)` siempre.
function updateSatellite() {
  if (!satelliteLayer) return
  satelliteLayer.setVisible(props.satEnabled)
  if (props.satEnabled) {
    setSatelliteTime(satelliteLayer, props.raster ? `${props.raster.slot_time}Z` : null)
  }
}

function updateWind() {
  if (!windLayer) return
  windLayer.setPaused(false)
  windLayer.setGrid(props.windGrid)
}

function updateLightning() {
  if (!lightningLayer) return
  lightningLayer.setPaused(false)
  lightningLayer.setStrikes(props.lightningStrikes)
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
  satelliteLayer = createSatelliteLayer(props.satVariant, props.satOpacity)
  satelliteLayer.setZIndex(3)
  satelliteLayer.setVisible(props.satEnabled)
  labelsLayer = new TileLayer({ source: labels ?? undefined, zIndex: 18, visible: labels !== null })
  map = new Map({
    target: container.value,
    controls: defaultControls({ zoom: false }),
    layers: [
      baseLayer,
      satelliteLayer,
      (coverageMaskLayer = new CoverageMaskLayer({ zIndex: 10, visible: props.showCoverage })),
      (windLayer = new WindParticleLayer({ zIndex: 15, seed: 1 })),
      (coverageCenterLayer = new VectorLayer({
        source: coverageCenterSource,
        zIndex: 11,
        visible: props.showCoverage,
        style: f => coverageCenterStyle(f as never),
      })),
      labelsLayer,
      (lightningLayer = new LightningLayer({ zIndex: 19 })),
      (cellsLayer = new VectorLayer({
        source: cellsSource,
        zIndex: 20,
        // mismo criterio que la capa de fenómenos del viewer de un solo
        // radar (RadarMap.vue): con decenas de celdas de varios sitios, el
        // declutter sacrifica labels solapados antes que markers
        declutter: true,
        style: f => mosaicCellStyle(f as never),
      })),
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

  map.on('singleclick', (evt) => {
    const cellId = map!.forEachFeatureAtPixel(
      evt.pixel,
      f => (f.get('f4') === 'cell' ? (f.get('cellId') as string | null) ?? undefined : undefined),
      { layerFilter: l => l === cellsLayer, hitTolerance: 6 },
    )
    if (cellId) emit('selectCell', cellId)
  })

  updateCoverage()
  updateCells()
  updateSatellite()
  updateWind()
  updateLightning()
  updateRasterLayer()

  resizeObserver = new ResizeObserver(() => map?.updateSize())
  resizeObserver.observe(container.value!)
})

watch(() => props.sites, () => {
  if (!map) return
  map.getView().animate({ center: fromLonLat(domainCenter()), duration: 300 })
  updateCoverage()
  updateCells()
})
watch(() => props.cells, updateCells)
watch(() => props.selectedCell, updateCells)

watch(() => [props.raster?.r2_key, props.productDef?.code], () => updateRasterLayer())
watch(() => props.opacity, (opacity) => rasterLayer?.setOpacity(opacity))
watch(() => props.baseMap, updateBaseMap)
watch(() => props.showCoverage, (show) => {
  coverageMaskLayer?.setVisible(show)
  coverageCenterLayer?.setVisible(show)
})
watch(() => props.contributing, updateCoverage)
watch(() => props.radiusM, updateCoverage)
watch(() => [props.satEnabled, props.raster?.slot_time], updateSatellite)
watch(() => props.satOpacity, o => satelliteLayer?.setOpacity(o))
watch(() => props.satVariant, (v) => {
  if (satelliteLayer) setSatelliteVariant(satelliteLayer, v)
})
watch(() => props.windGrid, updateWind)
watch(() => props.lightningStrikes, updateLightning)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  windLayer?.dispose()
  windLayer = undefined
  lightningLayer?.dispose()
  lightningLayer = undefined
  satelliteLayer?.dispose()
  satelliteLayer = undefined
  map?.setTarget(undefined)
})

defineExpose({ rasterLoaded })
</script>

<template>
  <div ref="container" class="h-full w-full" :data-raster-loaded="rasterLoaded" />
</template>
