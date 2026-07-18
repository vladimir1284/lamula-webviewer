// Sistema de partículas advectadas por el campo de viento — puro y
// determinista (RNG inyectable): entrada grid + viewport, salida segmentos
// en lon/lat. Quien pinta (utils/map/wind-layer.ts) proyecta a píxeles.
import type { WindGridFile } from '#shared/contract'
import { gridBounds, sampleWind } from './grid'

/** RNG determinista para tests y respawns reproducibles. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a += 0x6D2B79F5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Viewport {
  west: number
  east: number
  south: number
  north: number
}

export interface WindSegment {
  lon0: number
  lat0: number
  lon1: number
  lat1: number
  /** |viento| en m/s (para modular color/alpha si se quiere) */
  speed: number
}

export interface ParticleOptions {
  count: number
  /**
   * Aceleración temporal: cada segundo de pantalla muestra `timeAccel`
   * segundos de advección real — 10 m/s son invisibles a escala sinóptica
   * sin esto (earth.nullschool hace lo mismo).
   */
  timeAccel?: number
  /** vida en ticks antes de resembrar (evita que el campo se "peine") */
  maxAge?: number
  rng?: () => number
}

const EARTH_R = 6_371_000
const DEG = 180 / Math.PI

interface Particle {
  lon: number
  lat: number
  age: number
}

export class WindParticles {
  private readonly particles: Particle[] = []
  private readonly timeAccel: number
  private readonly maxAge: number
  private readonly rng: () => number
  /** dominio de siembra: intersección viewport ∩ grilla */
  private readonly domain: Viewport

  constructor(
    private readonly grid: WindGridFile,
    viewport: Viewport,
    opts: ParticleOptions,
  ) {
    this.timeAccel = opts.timeAccel ?? 3000
    this.maxAge = opts.maxAge ?? 80
    this.rng = opts.rng ?? Math.random
    const b = gridBounds(grid)
    this.domain = {
      west: Math.max(viewport.west, b.west),
      east: Math.min(viewport.east, b.east),
      south: Math.max(viewport.south, b.south),
      north: Math.min(viewport.north, b.north),
    }
    for (let i = 0; i < opts.count; i++) {
      this.particles.push(this.spawn())
    }
  }

  private spawn(): Particle {
    const { west, east, south, north } = this.domain
    return {
      lon: west + this.rng() * Math.max(east - west, 0),
      lat: south + this.rng() * Math.max(north - south, 0),
      // edad inicial aleatoria: los respawns no laten todos a la vez
      age: Math.floor(this.rng() * this.maxAge),
    }
  }

  /** Avanza dt segundos de pantalla; devuelve un segmento por partícula viva. */
  tick(dtS: number): WindSegment[] {
    const segments: WindSegment[] = []
    const dt = dtS * this.timeAccel
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]!
      const uv = p.age <= this.maxAge ? sampleWind(this.grid, p.lon, p.lat) : null
      if (uv === null) {
        this.particles[i] = { ...this.spawn(), age: 0 }
        continue // el tick del respawn no pinta (evita trazos falsos)
      }
      // dominios de radar quedan lejos de los polos: cos(φ) acotado abajo
      const cos = Math.max(Math.cos(p.lat / DEG), 0.05)
      const lon1 = p.lon + ((uv.u * dt) / (EARTH_R * cos)) * DEG
      const lat1 = p.lat + ((uv.v * dt) / EARTH_R) * DEG
      segments.push({
        lon0: p.lon,
        lat0: p.lat,
        lon1,
        lat1,
        speed: Math.hypot(uv.u, uv.v),
      })
      p.lon = lon1
      p.lat = lat1
      p.age++
    }
    return segments
  }
}
