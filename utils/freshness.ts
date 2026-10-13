/**
 * Minutos transcurridos desde un timestamp del contrato.
 * Contrato (docs/contrato.md): TEXT ISO-8601 UTC sin sufijo de zona
 * (`YYYY-MM-DDTHH:MM:SS`), por eso se fuerza `Z` antes de parsear.
 */
export function minutesSince(isoUtc: string, now: Date = new Date()): number {
  const parsed = Date.parse(isoUtc.endsWith('Z') ? isoUtc : `${isoUtc}Z`)
  if (Number.isNaN(parsed)) {
    throw new Error(`Timestamp inválido: "${isoUtc}"`)
  }
  return Math.floor((now.getTime() - parsed) / 60_000)
}

/**
 * Magnitud + unidad de la antigüedad, con unidad dinámica según el tamaño,
 * para no mostrar "hace 9494759 min" cuando el timestamp es muy viejo o está
 * corrupto. Devuelve datos, no texto: el módulo se mantiene puro y la
 * traducción (y su pluralización) vive en el componente — misma frontera que
 * impuso la decisión 40 para `utils/export/`.
 *
 * `value` conserva el signo (un reloj adelantado da minutos negativos); quien
 * pluralice debe usar su valor absoluto como índice de plural.
 */
export type FreshnessUnit = 'min' | 'hours' | 'days' | 'months' | 'years'

export interface FreshnessParts {
  unit: FreshnessUnit
  value: number
}

export function freshnessParts(minutes: number): FreshnessParts {
  const abs = Math.abs(minutes)
  if (abs < 60) return { unit: 'min', value: minutes }
  if (abs < 60 * 24) return { unit: 'hours', value: Math.floor(minutes / 60) }
  if (abs < 60 * 24 * 30) return { unit: 'days', value: Math.floor(minutes / (60 * 24)) }
  if (abs < 60 * 24 * 365) return { unit: 'months', value: Math.floor(minutes / (60 * 24 * 30)) }
  return { unit: 'years', value: Math.floor(minutes / (60 * 24 * 365)) }
}
