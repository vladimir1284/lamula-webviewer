// Catálogo estático de Volume Coverage Patterns (VCP) del WSR-88D, keyed por
// raster.vcp. Igual criterio que shared/products (D5): catálogo enriquecido
// vive en este repo, no en la base — D1 solo entrega el código entero.
// Contenido adaptado de NOAA JetStream (https://www.noaa.gov/jetstream/vcp_max)
// más documentación pública del Radar Operations Center (SAILS/MRLE/MPDA);
// un VCP fuera de este catálogo no rompe la UI, ver vcpInfo().
export interface VcpInfo {
  code: number
  name: string
  group: string
  elevations: number
  scanMinutes: string
  description: string
}

export const VCP_SOURCE_URL = 'https://www.noaa.gov/jetstream/vcp_max'

export const VCP_CATALOG: Readonly<Record<number, VcpInfo>> = Object.freeze({
  11: {
    code: 11,
    name: 'Convección profunda (legado)',
    group: 'Precipitación',
    elevations: 14,
    scanMinutes: '~5',
    description:
      'Patrón legado de precipitación para clima severo y convección profunda. Muestrea 14 ángulos '
      + 'de elevación (0.5° a 19.5°) por volumen, lo que da mejor resolución vertical que VCP 21 — se '
      + 'prefiere cuando hay precipitación convectiva dentro de unas 60 mn del radar.',
  },
  12: {
    code: 12,
    name: 'Convección profunda',
    group: 'Precipitación',
    elevations: 14,
    scanMinutes: '~4.5',
    description:
      'Sucesor de VCP 11: mismos 14 ángulos de elevación pero con superposición en los ángulos bajos '
      + 'y rotación más rápida de la antena — mejor interrogación de clima severo. Compatible con SAILS '
      + 'y MESO-SAILS, que repiten el ángulo 0.5° varias veces dentro del mismo volumen para actualizar '
      + 'la capa baja con más frecuencia.',
  },
  21: {
    code: 21,
    name: 'Precipitación general (legado)',
    group: 'Precipitación',
    elevations: 9,
    scanMinutes: '~6',
    description:
      'Patrón de precipitación por defecto histórico, pensado para precipitación estratiforme donde '
      + 'la estructura vertical de la tormenta importa menos que en convección. Muestrea 9 ángulos de '
      + 'elevación (0.5° a 19.5°).',
  },
  31: {
    code: 31,
    name: 'Aire despejado — pulso largo',
    group: 'Aire despejado',
    elevations: 5,
    scanMinutes: '~10',
    description:
      'Uno de los dos VCP originales de aire despejado (sin precipitación significativa). Muestrea 5 '
      + 'ángulos bajos (0.5° a 4.5°) con dwell times largos; el pulso largo da mejor relación señal/ruido '
      + 'y detecta reflectividad más débil que VCP 32.',
  },
  32: {
    code: 32,
    name: 'Aire despejado — pulso corto',
    group: 'Aire despejado',
    elevations: 5,
    scanMinutes: '~10',
    description:
      'Mismos 5 ángulos de elevación que VCP 31, pero con pulso corto: peor relación señal/ruido a '
      + 'cambio de un rango de velocidad Doppler no ambigua mayor.',
  },
  35: {
    code: 35,
    name: 'Aire despejado — vigilancia general',
    group: 'Aire despejado',
    elevations: 9,
    scanMinutes: '~7',
    description:
      'VCP de aire despejado añadido para reemplazar patrones legados; es el que usan por defecto la '
      + 'mayoría de los radares WSR-88D cuando no hay precipitación cerca. Muestrea 9 ángulos de elevación.',
  },
  112: {
    code: 112,
    name: 'Precipitación de gran escala (SAILS/MRLE)',
    group: 'Precipitación',
    elevations: 14,
    scanMinutes: '~5.5',
    description:
      'Pensado para sistemas de gran escala y alta velocidad (huracanes, líneas de tormentas largas). '
      + 'Muestrea 14 ángulos (0.5° a 19.5°) usando el algoritmo MPDA en los tres más bajos para resolver '
      + 'velocidad sin range folding, con la opción de repetir los ángulos bajos vía SAILS o MRLE dentro '
      + 'del mismo volumen.',
  },
  121: {
    code: 121,
    name: 'Dealiasing múltiple (huracanes)',
    group: 'Precipitación',
    elevations: 9,
    scanMinutes: '~5.75',
    description:
      'Variante de VCP 21 diseñada para huracanes/tormentas tropicales y precipitación extendida. Usa '
      + 'el algoritmo MPDA, que combina varias formas de onda en los ángulos bajos, para recuperar datos '
      + 'de velocidad que de otro modo se perderían por range folding.',
  },
  211: {
    code: 211,
    name: 'Convección profunda con SZ-2',
    group: 'Mitigación de range folding',
    elevations: 14,
    scanMinutes: '~5',
    description:
      'Variante de VCP 11 con procesamiento SZ-2 para resolver la ambigüedad rango-velocidad; mismo '
      + 'patrón de 14 ángulos de elevación. Uso poco frecuente en la red operativa actual.',
  },
  212: {
    code: 212,
    name: 'Convección profunda con SZ-2',
    group: 'Mitigación de range folding',
    elevations: 14,
    scanMinutes: '~4.5',
    description:
      'Variante de VCP 12 con procesamiento SZ-2 para mitigar range folding, manteniendo los mismos 14 '
      + 'ángulos de elevación y la compatibilidad con SAILS/MESO-SAILS de VCP 12.',
  },
  215: {
    code: 215,
    name: 'Vigilancia general — mejor resolución vertical',
    group: 'Precipitación',
    elevations: 15,
    scanMinutes: '~6',
    description:
      'Patrón de vigilancia general con la mejor resolución vertical de todos los VCP de precipitación: '
      + '15 ángulos de elevación por volumen. Añadido para reemplazar patrones legados.',
  },
  221: {
    code: 221,
    name: 'Precipitación general con SZ-2',
    group: 'Mitigación de range folding',
    elevations: 9,
    scanMinutes: '~6',
    description:
      'Variante de VCP 21 con procesamiento SZ-2 para mitigar range folding, con el mismo patrón de 9 '
      + 'ángulos de elevación.',
  },
})

export function vcpInfo(code: number | null | undefined): VcpInfo | null {
  if (code == null) return null
  return VCP_CATALOG[code] ?? null
}
