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

// hash corto (FNV-1a) del proj4def — NO del domain_id: cada fila de
// mosaic_rasters trae su propia geometría (añadir un radar recalcula la
// malla del dominio, docs/decisiones.md D43), así que dos COGs del MISMO
// dominio pueden tener proj4 distinto. Si el código registrado dependiera
// solo del domain_id, la comprobación idempotente de abajo se saltaría el
// re-registro y una fila vieja quedaría leyendo la definición de otra.
function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function domainProjCode(proj4def: string): string {
  return `AEQD-DOMAIN:${fnv1a(proj4def)}`
}

/** Registra la proyección AEQD de UNA geometría de mosaico (`mosaic_rasters.proj4`
 * de esa fila concreta) y devuelve su código. Idempotente por contenido, no
 * por dominio — ver nota de `domainProjCode`. */
export function registerDomainProjection(proj4def: string): string {
  const code = domainProjCode(proj4def)
  if (!getProjection(code)) {
    proj4.defs(code, proj4def)
    register(proj4)
  }
  return code
}
