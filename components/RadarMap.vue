<script setup lang="ts">
// Mapa del viewer: base OSM (Web Mercator), capa de cobertura del radar y
// capa raster GeoTIFF (COG de R2) reproyectada en GPU desde la AEQD del
// radar (decisiones 2, 4, 6). Usar SIEMPRE dentro de <ClientOnly>:
// OpenLayers no corre en SSR, y el sufijo .client no sirve aquí — su
// wrapper (createClientOnly) monta con los template refs aún nulos.
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
import { registerRadarProjection } from '../utils/map/projection'
import { rasterStyle } from '../utils/map/raster-style'

const props = withDefaults(defineProps<{
  radar: Radar
  raster: RasterMeta | null
  productDef: RasterProductDef | null
  opacity: number
  /** apagar la base OSM (goldens visuales: fondo determinista) */
  showBase?: boolean
}>(), { showBase: true })

const emit = defineEmits<{
  cursor: [sample: CursorSample | null]
  rasterError: [message: string]
}>()

const container = ref<HTMLDivElement>()

let map: Map | undefined
let baseLayer: TileLayer<OSM> | undefined
let rasterLayer: WebGLTileLayer | undefined
const coverageSource = new VectorSource()

// 'true' cuando el raster vigente terminó de renderizar (rendercomplete de
// OL espera a los tiles) — los goldens de Playwright esperan este attr.
const rasterLoaded = ref('none')

/** radio de cobertura en metros: mitad del ancho de la malla AEQD */
function coverageRadiusM(): number {
  return props.raster ? (props.raster.width / 2) * props.raster.cell_m : 460_000
}

function updateCoverage() {
  coverageSource.clear()
  const circle = circular([props.radar.lon, props.radar.lat], coverageRadiusM(), 128)
  coverageSource.addFeature(new Feature(circle.transform('EPSG:4326', 'EPSG:3857')))
}

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
    // para la animación de F3
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
    if (evt.dragging || !rasterLayer || !props.raster) {
      emit('cursor', null)
      return
    }
    const data = rasterLayer.getData(evt.pixel)
    const level = data && !(data instanceof DataView) && data.length > 0
      ? Number(data[0])
      : Number.NaN
    emit('cursor', sampleFromLevel(level, props.raster.value_scale, props.raster.value_offset))
  })
  map.getViewport().addEventListener('pointerleave', () => emit('cursor', null))

  updateCoverage()
  updateRasterLayer()
})

watch(() => props.radar.site_id, () => {
  map?.getView().animate({ center: fromLonLat([props.radar.lon, props.radar.lat]), duration: 300 })
  updateCoverage()
})

watch(
  () => [props.raster?.r2_key, props.productDef?.code],
  () => {
    updateCoverage()
    updateRasterLayer()
  },
)

watch(() => props.opacity, o => rasterLayer?.setOpacity(o))
watch(() => props.showBase, v => baseLayer?.setVisible(v))

onBeforeUnmount(() => {
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
