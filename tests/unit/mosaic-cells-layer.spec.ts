// buildMosaicCellFeatures/mosaicCellStyle (P5/D45): puro salvo OL — una
// feature por celda, SIN deduplicar entre sitios, coloreada por sitio de
// origen (no por severidad/selección como phenomena-layer.ts).
import type { Phenomenon } from '#shared/contract'
import { describe, expect, it } from 'vitest'
import { buildMosaicCellFeatures, mosaicCellStyle } from '../../utils/map/mosaic-cells-layer'

const ORDER = ['AMX', 'BYX']

function cell(site: string, cellId: string, dbzMax = 50): Phenomenon {
  return {
    site_id: site,
    product_code: 153,
    vol_time: '2026-07-11T03:15:00',
    kind: 'storm_cell',
    cell_id: cellId,
    lat: 25,
    lon: -80,
    azimuth_deg: null,
    range_km: null,
    attrs: { dbz_max: dbzMax },
  }
}

describe('buildMosaicCellFeatures', () => {
  it('una feature por celda, con cellId compuesto site:cellId', () => {
    const features = buildMosaicCellFeatures([cell('AMX', 'A0'), cell('BYX', 'C3')], ORDER, null)
    expect(features).toHaveLength(2)
    expect(features.map(f => f.get('cellId'))).toEqual(['AMX:A0', 'BYX:C3'])
  })

  it('dos sitios reportando el mismo cell_id NO se deduplican', () => {
    const features = buildMosaicCellFeatures([cell('AMX', 'A0'), cell('BYX', 'A0')], ORDER, null)
    expect(features).toHaveLength(2)
    expect(features.map(f => f.get('cellId'))).toEqual(['AMX:A0', 'BYX:A0'])
  })

  it('descarta filas sin cell_id o que no sean storm_cell', () => {
    const noCellId: Phenomenon = { ...cell('AMX', 'A0'), cell_id: null }
    const meso: Phenomenon = { ...cell('AMX', 'A0'), kind: 'meso' }
    expect(buildMosaicCellFeatures([noCellId, meso], ORDER, null)).toHaveLength(0)
  })

  it('marca selected según el cellId compuesto', () => {
    const features = buildMosaicCellFeatures([cell('AMX', 'A0'), cell('BYX', 'A0')], ORDER, 'BYX:A0')
    expect(features.map(f => f.get('selected'))).toEqual([false, true])
  })

  it('colorea por posición del sitio en el orden del dominio', () => {
    const features = buildMosaicCellFeatures([cell('AMX', 'A0'), cell('BYX', 'A0')], ORDER, null)
    expect(features[0]!.get('color')).not.toBe(features[1]!.get('color'))
  })
})

describe('mosaicCellStyle', () => {
  it('no lanza y reutiliza el estilo cacheado para la misma clave', () => {
    const [feature] = buildMosaicCellFeatures([cell('AMX', 'A0')], ORDER, null)
    const a = mosaicCellStyle(feature! as never)
    const b = mosaicCellStyle(feature! as never)
    expect(a).toBe(b)
  })

  it('seleccionado y sin seleccionar producen estilos distintos', () => {
    const [sel] = buildMosaicCellFeatures([cell('AMX', 'A0')], ORDER, 'AMX:A0')
    const [unsel] = buildMosaicCellFeatures([cell('AMX', 'A0')], ORDER, null)
    expect(mosaicCellStyle(sel! as never)).not.toBe(mosaicCellStyle(unsel! as never))
  })
})
