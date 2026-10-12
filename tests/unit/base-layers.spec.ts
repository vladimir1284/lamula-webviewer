import { describe, expect, it } from 'vitest'
import XYZ from 'ol/source/XYZ'
import { createBaseMapSources } from '~/utils/map/base-layers'

describe('createBaseMapSources', () => {
  it('retorna null para base "off"', () => {
    const sources = createBaseMapSources('off')
    expect(sources.base).toBeNull()
    expect(sources.labels).toBeNull()
  })

  it('retorna fuente OSM para base "osm"', () => {
    const sources = createBaseMapSources('osm')
    expect(sources.base).not.toBeNull()
    expect(sources.labels).toBeNull()
  })

  it('incluye api_key en URLs de fuentes CARTO cuando se proporciona apiKey explícita', () => {
    const apiKey = 'test_carto_key_123'
    const sources = createBaseMapSources('carto-voyager', apiKey)
    expect(sources.base).toBeInstanceOf(XYZ)
    expect(sources.labels).toBeInstanceOf(XYZ)

    const baseUrl = (sources.base as XYZ).getUrls()?.[0]
    const labelsUrl = (sources.labels as XYZ).getUrls()?.[0]

    expect(baseUrl).toContain('?api_key=test_carto_key_123')
    expect(labelsUrl).toContain('?api_key=test_carto_key_123')
  })

  it('construye URLs sin api_key cuando apiKey no está presente', () => {
    const sources = createBaseMapSources('carto-positron')
    expect(sources.base).toBeInstanceOf(XYZ)
    const baseUrl = (sources.base as XYZ).getUrls()?.[0]
    expect(baseUrl).not.toContain('?api_key=')
  })
})
