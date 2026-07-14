// Componentes u/v desde dirección/velocidad meteorológicas (decisión 9:
// el contrato VWP trae dir/speed; u/v se derivan en cliente, no hay w).
// `dirDeg` es la dirección DESDE la que sopla el viento (convención
// meteorológica, 0° = norte, horaria): un viento del norte (0°) empuja
// hacia el sur → u=0, v=-speed.

export interface WindUV {
  /** componente hacia el este (kt) */
  u: number
  /** componente hacia el norte (kt) */
  v: number
}

export function uvFromDirSpeed(dirDeg: number, speedKt: number): WindUV {
  const rad = (dirDeg * Math.PI) / 180
  return {
    u: -speedKt * Math.sin(rad),
    v: -speedKt * Math.cos(rad),
  }
}
