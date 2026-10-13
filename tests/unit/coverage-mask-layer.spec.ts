// buildMaskCircles (D46): puro, sin OL Map/canvas — un círculo (vértices en
// EPSG:3857) por sitio CONTRIBUYENTE, nada para los ausentes (su área queda
// cubierta por la máscara, ver utils/map/coverage-mask-layer.ts).
import type { FrameState } from 'ol/Map'
import { describe, expect, it } from 'vitest'
import { buildMaskCircles, CoverageMaskLayer } from '../../utils/map/coverage-mask-layer'

const SITES = [
  { site_id: 'AMX', lat: 18.43, lon: -66.0 },
  { site_id: 'BYX', lat: 24.6, lon: -81.7 },
  { site_id: 'HDC', lat: 29.5, lon: -95.1 },
]

describe('buildMaskCircles', () => {
  it('un círculo por sitio contribuyente, ninguno para los ausentes', () => {
    const circles = buildMaskCircles(SITES, 230_000, new Set(['AMX', 'BYX']))
    expect(circles).toHaveLength(2)
  })

  it('con el set vacío, no hay círculos (todo el dominio queda oscuro)', () => {
    expect(buildMaskCircles(SITES, 230_000, new Set())).toHaveLength(0)
  })

  it('cada círculo trae vértices [x, y] cerrados (primero === último)', () => {
    const [circle] = buildMaskCircles(SITES.slice(0, 1), 230_000, new Set(['AMX']))
    expect(circle!.length).toBeGreaterThan(90)
    expect(circle![0]).toEqual(circle![circle!.length - 1])
    for (const [x, y] of circle!) {
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
    }
  })
})

describe('CoverageMaskLayer render', () => {
  // happy-dom no trae contexto 2D real (ver export-chrome.spec.ts) — se graba
  // la secuencia de moveTo/lineTo contra un contexto falso en vez de leer
  // píxeles. Regresión: `ol/transform`'s `apply()` muta su argumento in-place,
  // y render() corre en cada repintado del mapa, no solo cuando cambian los
  // círculos — sin clonar, el segundo render transforma coordenadas que ya
  // son píxeles del primero, moviendo el punch fuera de pantalla.
  it('dibuja los mismos vértices de píxel en renders repetidos', () => {
    const points: Array<[number, number][]> = []
    const fakeCtx = {
      fillStyle: '',
      globalCompositeOperation: 'source-over',
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => points.push([]),
      moveTo: (x: number, y: number) => points.at(-1)!.push([x, y]),
      lineTo: (x: number, y: number) => points.at(-1)!.push([x, y]),
      closePath: () => {},
      fill: () => {},
    }
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    // @ts-expect-error -- stub mínimo, no un CanvasRenderingContext2D real
    HTMLCanvasElement.prototype.getContext = () => fakeCtx

    try {
      // transform NO trivial (escala+traslada): con la identidad, mutar la
      // coordenada in-place da el mismo resultado que no mutarla y el test
      // no vería el bug — hace falta una transform real para que el segundo
      // `apply()` sobre un valor ya transformado produzca un punto distinto.
      const frameState = {
        size: [200, 200],
        coordinateToPixelTransform: [2, 0, 0, 2, 100, 100],
      } as unknown as FrameState

      const layer = new CoverageMaskLayer({ zIndex: 10 })
      const [circle] = buildMaskCircles([{ site_id: 'AMX', lat: 0, lon: 0 }], 50, new Set(['AMX']))
      layer.setCircles([circle!])

      layer.render(frameState)
      const first = points.at(-1)!.slice()
      layer.render(frameState)
      const second = points.at(-1)!.slice()

      expect(second).toEqual(first)
    }
    finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext
    }
  })
})
