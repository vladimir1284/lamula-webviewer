// Registro dinámico de la proyección AEQD de cada radar (decisión 6):
// radars.proj4 se registra tal cual, nada hardcodeado.
import { get as getProjection } from 'ol/proj'
import { register } from 'ol/proj/proj4'
import proj4 from 'proj4'

export function radarProjCode(siteId: string): string {
  return `AEQD:${siteId}`
}

/**
 * Registra la proyección del radar en proj4 + OpenLayers y devuelve su
 * código. Idempotente: re-registrar el mismo radar es un no-op.
 */
export function registerRadarProjection(siteId: string, proj4def: string): string {
  const code = radarProjCode(siteId)
  if (!getProjection(code)) {
    proj4.defs(code, proj4def)
    register(proj4)
  }
  return code
}
