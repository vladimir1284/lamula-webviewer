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
