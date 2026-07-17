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
import Polygon, { circular } from 'ol/geom/Polygon'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import WebGLTileLayer from 'ol/layer/WebGLTile'
import { fromLonLat } from 'ol/proj'
import GeoTIFF from 'ol/source/GeoTIFF'
import OSM from 'ol/source/OSM'
import VectorSource from 'ol/source/Vector'
import Fill from 'ol/style/Fill'
import Style from 'ol/style/Style'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'ol/ol.css'
import type { Phenomenon, Radar, RasterMeta } from '#shared/contract'
import type { RasterProductDef } from '#shared/products'
import type { CursorSample } from '../utils/map/cursor'
import { sampleFromLevel } from '../utils/map/cursor'
import { FramePool } from '../utils/map/frame-pool'
import { buildPhenomenaFeatures, overlayStyle } from '../utils/map/phenomena-layer'
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
  /** overlay de alcance del radar (donut mask) — pref de usuario (D28) */
  showCoverage?: boolean
  /** overlay de fenómenos del frame mostrado, ya filtrado por capas activas (F4) */
  phenomena?: Phenomenon[] | null
  selectedCell?: string | null
}>(), { showBase: true, showCoverage: true, frames: null, activeFrame: 0, phenomena: null, selectedCell: null })

const emit = defineEmits<{
  cursor: [sample: CursorSample | null]
  rasterError: [message: string]
  frameReady: [index: number]
  frameError: [index: number, message: string]
  moveEnd: []
  selectCell: [cellId: string]
}>()

const container = ref<HTMLDivElement>()

let map: Map | undefined
let baseLayer: TileLayer<OSM> | undefined
let coverageLayer: VectorLayer<VectorSource> | undefined
let rasterLayer: WebGLTileLayer | undefined // modo estático
let rasterLoadAbort: AbortController | undefined
let pool: FramePool | undefined // modo animación
const coverageSource = new VectorSource()
const phenomenaSource = new VectorSource()
let phenomenaLayer: VectorLayer<VectorSource> | undefined

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
  const center = fromLonLat([props.radar.lon, props.radar.lat])
  const circle = circular([props.radar.lon, props.radar.lat], coverageRadiusM(), 128)
  circle.transform('EPSG:4326', 'EPSG:3857')
  const circleCoords = circle.getCoordinates()
  
  // Aumentamos half a 2e7 (20 millones de metros, aprox el mundo entero) 
  // para evitar que se vean los bordes del cuadrado al hacer zoom out.
  const half = 2e7
  const worldExtent = [
    [center[0] - half, center[1] - half],
    [center[0] + half, center[1] - half],
    [center[0] + half, center[1] + half],
    [center[0] - half, center[1] + half],
    [center[0] - half, center[1] - half],
  ]
  const mask = new Polygon([worldExtent, circleCoords[0]])
  coverageSource.addFeature(new Feature(mask))
}

// ── Overlay de fenómenos (F4) ────────────────────────────────────────────
// Capa vectorial independiente del modo estático/pool: en animación las
// features del volumen casado se actualizan por props sin tocar el raster.

function updatePhenomena() {
  phenomenaSource.clear()
  if (!map || !props.phenomena || props.phenomena.length === 0) return
  const projCode = registerRadarProjection(props.radar.site_id, props.radar.proj4)
  phenomenaSource.addFeatures(
    buildPhenomenaFeatures(props.phenomena, props.selectedCell ?? null, projCode),
  )
}

// ── Modo estático (F2, intacto) ─────────────────────────────────────────

function updateRasterLayer() {
  rasterLoadAbort?.abort()
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
  const abort = new AbortController()
  rasterLoadAbort = abort

  // COG <2MB (single-site/product): un solo fetch como blob en vez de dejar
  // que geotiff.js emita range requests por tile/overview bajo `url`.
  fetch(raster.cog_url, { signal: abort.signal })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.blob()
    })
    .then((blob) => {
      if (abort.signal.aborted || !map) return
      const source = new GeoTIFF({
        sources: [{ blob }],
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
    })
    .catch(() => {
      if (abort.signal.aborted) return
      emit('rasterError', `No se pudo cargar el COG (${raster.r2_key})`)
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
      (coverageLayer = new VectorLayer({
        source: coverageSource,
        zIndex: 10,
        visible: props.showCoverage,
        style: new Style({
          fill: new Fill({ color: 'rgba(15, 23, 42, 0.1)' }),
        }),
      })),
      (phenomenaLayer = new VectorLayer({
        source: phenomenaSource,
        zIndex: 20,
        // labels de cell_id con 100+ celdas: declutter sacrifica labels
        // solapados antes que markers
        declutter: true,
        style: overlayStyle,
      })),
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
  // click en el marker de una celda → seleccionar (las líneas de track y
  // los anillos meso no son objetivo de click)
  map.on('singleclick', (evt) => {
    const cellId = map!.forEachFeatureAtPixel(
      evt.pixel,
      f => (f.get('f4') === 'cell' ? (f.get('cellId') as string | null) ?? undefined : undefined),
      { layerFilter: l => l === phenomenaLayer, hitTolerance: 6 },
    )
    if (cellId) emit('selectCell', cellId)
  })

  updateCoverage()
  updatePhenomena()
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

watch(() => [props.phenomena, props.selectedCell], updatePhenomena)

watch(() => props.opacity, (o) => {
  rasterLayer?.setOpacity(o)
  pool?.setOpacity(o)
})
watch(() => props.showBase, v => baseLayer?.setVisible(v))
watch(() => props.showCoverage, v => coverageLayer?.setVisible(v))

onBeforeUnmount(() => {
  rasterLoadAbort?.abort()
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
