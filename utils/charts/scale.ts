// Escala lineal + ticks "bonitos" para los charts SVG propios (decisión
// 25: cero librería de charts). Suficiente para TrendChart y ejes VWP.

export interface LinearScale {
  map(v: number): number
  ticks(count?: number): number[]
  domain: [number, number]
  range: [number, number]
}

export function linearScale(domain: [number, number], range: [number, number]): LinearScale {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0

  return {
    domain,
    range,
    map(v: number): number {
      // dominio degenerado (serie de 1 punto o constante) → centro del rango
      if (span === 0) return (r0 + r1) / 2
      return r0 + ((v - d0) / span) * (r1 - r0)
    },
    ticks(count = 5): number[] {
      if (span === 0) return [d0]
      const step = tickStep(span, count)
      const start = Math.ceil(d0 / step) * step
      const out: number[] = []
      // epsilon relativo: acumular multiplicando evita el drift de sumar floats
      for (let i = 0; start + i * step <= d1 + step * 1e-9; i++) {
        out.push(roundTo(start + i * step, step))
      }
      return out
    },
  }
}

/** Paso 1/2/5×10^k más cercano a span/count. */
function tickStep(span: number, count: number): number {
  const raw = span / Math.max(1, count)
  const pow = 10 ** Math.floor(Math.log10(raw))
  const frac = raw / pow
  const nice = frac >= 7 ? 10 : frac >= 3 ? 5 : frac >= 1.5 ? 2 : 1
  return nice * pow
}

function roundTo(v: number, step: number): number {
  // limpia el ruido de coma flotante a la precisión del paso
  const decimals = Math.max(0, -Math.floor(Math.log10(step)))
  return Number(v.toFixed(decimals + 1))
}
