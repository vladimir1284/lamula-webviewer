// Registro dinámico de la AEQD del radar (decisión 6): la definición de
// radars.proj4 grabada de la D1 real se registra tal cual y el origen
// (0,0) de la malla debe caer en el (lat, lon) del radar.
import { get as getProjection, transform } from 'ol/proj'
import { describe, expect, it } from 'vitest'
import { radars } from '../helpers/derive'
import { radarProjCode, registerRadarProjection } from '../../utils/map/projection'

describe('registerRadarProjection', () => {
  it.each(radars)('$site_id: registra la AEQD y (0,0) → centro del radar', (radar) => {
    const code = registerRadarProjection(radar.site_id, radar.proj4)
    expect(code).toBe(radarProjCode(radar.site_id))
    expect(getProjection(code)).not.toBeNull()

    const [lon, lat] = transform([0, 0], code, 'EPSG:4326')
    expect(lon).toBeCloseTo(radar.lon, 6)
    expect(lat).toBeCloseTo(radar.lat, 6)
  })

  it('es idempotente', () => {
    const radar = radars[0]!
    const first = registerRadarProjection(radar.site_id, radar.proj4)
    const second = registerRadarProjection(radar.site_id, radar.proj4)
    expect(second).toBe(first)
  })
})
