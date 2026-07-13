// Barba de viento estándar (convención WMO, hemisferio norte): el asta
// apunta HACIA la dirección de la que viene el viento; en la punta,
// banderines de 50 kt, barbas completas de 10 y media barba de 5, con la
// velocidad redondeada a 5 kt. Todo geometría pura en coordenadas locales
// (x este, y norte, origen en la estación) — el componente SVG solo
// escala/pinta (decisión 25: cero librería de charts).

export interface BarbSpec {
  /** velocidad redondeada a múltiplo de 5 kt */
  roundedKt: number
  pennants: number
  fulls: number
  half: boolean
  /** < 2.5 kt: círculo de calma, sin asta */
  calm: boolean
}

export function barbSpec(speedKt: number): BarbSpec {
  const roundedKt = Math.round(speedKt / 5) * 5
  if (roundedKt < 5) {
    return { roundedKt: 0, pennants: 0, fulls: 0, half: false, calm: true }
  }
  const pennants = Math.floor(roundedKt / 50)
  const rest = roundedKt - pennants * 50
  return {
    roundedKt,
    pennants,
    fulls: Math.floor(rest / 10),
    half: rest % 10 === 5,
    calm: false,
  }
}

export interface BarbSegments {
  /** [x1, y1, x2, y2] — asta + barbas */
  lines: [number, number, number, number][]
  /** [x1, y1, x2, y2, x3, y3] — banderines (rellenos) */
  triangles: [number, number, number, number, number, number][]
  calm: boolean
}

// Proporciones estándar relativas al largo del asta.
const FULL_BARB = 0.4
const SPACING = 0.14
const FEATHER_ANGLE = (70 * Math.PI) / 180 // desde el asta, hacia fuera

/**
 * Segmentos de la barba en coordenadas locales y-norte (quien pinta en
 * pantalla y-abajo debe invertir y). Asta desde el origen (estación)
 * hasta `lenPx` en la dirección `dirDeg` ("desde"); plumas del lado
 * horario (hemisferio norte).
 */
export function barbSegments(spec: BarbSpec, dirDeg: number, lenPx: number): BarbSegments {
  if (spec.calm) return { lines: [], triangles: [], calm: true }

  const rad = (dirDeg * Math.PI) / 180
  // unitario del asta (hacia la dirección "desde")
  const ux = Math.sin(rad)
  const uy = Math.cos(rad)
  // unitario de las plumas: asta rotada FEATHER_ANGLE en sentido horario
  const fx = Math.sin(rad + FEATHER_ANGLE)
  const fy = Math.cos(rad + FEATHER_ANGLE)

  const at = (d: number): [number, number] => [ux * lenPx * d, uy * lenPx * d]
  const lines: BarbSegments['lines'] = [[0, 0, ux * lenPx, uy * lenPx]]
  const triangles: BarbSegments['triangles'] = []

  let pos = 1 // fracción del asta, desde la punta hacia la estación
  for (let i = 0; i < spec.pennants; i++) {
    const [bx, by] = at(pos)
    const [cx, cy] = at(pos - SPACING)
    triangles.push([bx, by, bx + fx * lenPx * FULL_BARB, by + fy * lenPx * FULL_BARB, cx, cy])
    pos -= SPACING * 1.5
  }
  for (let i = 0; i < spec.fulls; i++) {
    const [bx, by] = at(pos)
    lines.push([bx, by, bx + fx * lenPx * FULL_BARB, by + fy * lenPx * FULL_BARB])
    pos -= SPACING
  }
  if (spec.half) {
    // una media barba sola no va en la punta (se confundiría con 10 kt)
    if (spec.pennants === 0 && spec.fulls === 0) pos -= SPACING
    const [bx, by] = at(pos)
    lines.push([
      bx,
      by,
      bx + fx * lenPx * (FULL_BARB / 2),
      by + fy * lenPx * (FULL_BARB / 2),
    ])
  }
  return { lines, triangles, calm: false }
}
