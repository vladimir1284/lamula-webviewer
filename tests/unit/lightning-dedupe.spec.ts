// dedupeStrikes (D49): la unión de cubos de varios sitios del mismo dominio
// de mosaico trae la misma descarga repetida.
import { describe, expect, it } from 'vitest'
import { dedupeStrikes } from '../../utils/overlay/lightning-join'

const s = (lon: number, lat: number, progress: number) => ({ lon, lat, progress })

describe('dedupeStrikes', () => {
  it('descarta duplicados exactos y conserva el orden', () => {
    const out = dedupeStrikes([s(-80, 25, 0.1), s(-80, 25, 0.1), s(-81, 26, 0.5)])
    expect(out).toEqual([s(-80, 25, 0.1), s(-81, 26, 0.5)])
  })

  it('misma posición en instantes distintos NO es duplicado', () => {
    const out = dedupeStrikes([s(-80, 25, 0.1), s(-80, 25, 0.2)])
    expect(out).toHaveLength(2)
  })

  it('mismo instante en posiciones distintas NO es duplicado', () => {
    const out = dedupeStrikes([s(-80, 25, 0.1), s(-80.5, 25, 0.1)])
    expect(out).toHaveLength(2)
  })

  it('lista vacía devuelve lista vacía', () => {
    expect(dedupeStrikes([])).toEqual([])
  })
})
