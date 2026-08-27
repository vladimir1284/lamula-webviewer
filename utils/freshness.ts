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
 * Texto "hace X unidad" con unidad dinámica según magnitud, para no mostrar
 * "hace 9494759 min" cuando el timestamp es muy viejo o está corrupto.
 */
export function formatFreshness(minutes: number): string {
  const abs = Math.abs(minutes)
  if (abs < 60) return `hace ${minutes} min`
  if (abs < 60 * 24) return `hace ${Math.floor(minutes / 60)} h`
  if (abs < 60 * 24 * 30) return `hace ${Math.floor(minutes / (60 * 24))} d`
  if (abs < 60 * 24 * 365) {
    const meses = Math.floor(minutes / (60 * 24 * 30))
    return `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`
  }
  const anios = Math.floor(minutes / (60 * 24 * 365))
  return `hace ${anios} ${anios === 1 ? 'año' : 'años'}`
}
