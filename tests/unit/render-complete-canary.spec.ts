// Canario: utils/map/frame-pool.ts detecta "frame listo" leyendo
// layer.getRenderer().renderComplete — propiedad semi-pública del renderer
// WebGL de ol (no forma parte de la API pública documentada). Si un upgrade
// de `ol` la renombra o la quita, este test debe fallar ANTES que el pool
// silencioso deje de avanzar el buffer. Plan B documentado en
// docs/maquinas-estado.md si esto se rompe: rendercomplete secuencial del mapa.
import { describe, expect, it } from 'vitest'
import Map from 'ol/Map'
import WebGLTileLayer from 'ol/layer/WebGLTile'
import GeoTIFF from 'ol/source/GeoTIFF'

describe('canario: ol WebGLTileLayer renderer expone renderComplete', () => {
  it('la propiedad existe (boolean) en el renderer recién creado', () => {
    const layer = new WebGLTileLayer({
      source: new GeoTIFF({ sources: [{ url: 'https://example.test/fake.tif' }] }),
    })
    const map = new Map({ layers: [layer] })
    const renderer = layer.getRenderer()
    expect(renderer).toBeDefined()
    expect(typeof (renderer as unknown as { renderComplete: unknown }).renderComplete).toBe('boolean')
    map.dispose()
  })
})
