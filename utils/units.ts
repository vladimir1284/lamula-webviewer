// Conversión de unidades para display (D28). Solo texto: las barbas de
// viento (convención WMO) y toda la matemática interna siguen en kt/kft;
// convertir aquí y solo aquí evita dobles conversiones. Presentación pura
// de cliente — por eso vive en utils/ y no en shared/.

export type UnitsPref = 'imperial' | 'si'

const KFT_TO_KM = 0.3048
const FT_TO_M = 0.3048
const KT_TO_KMH = 1.852

// ── conversión numérica (para escalas de charts: convertir ANTES de
//    linearScale, así los ticks salen redondos en la unidad mostrada) ──────

export function convertHeightKft(kft: number, units: UnitsPref): number {
  return units === 'si' ? kft * KFT_TO_KM : kft
}

export function convertHeightFt(ft: number, units: UnitsPref): number {
  return units === 'si' ? ft * FT_TO_M : ft
}

export function convertSpeedKt(kt: number, units: UnitsPref): number {
  return units === 'si' ? kt * KT_TO_KMH : kt
}

// ── etiquetas de unidad (headers de tabla, captions) ─────────────────────

export function heightUnit(units: UnitsPref, src: 'kft' | 'ft'): string {
  if (units === 'imperial') return src
  return src === 'kft' ? 'km' : 'm'
}

export function speedUnit(units: UnitsPref): string {
  return units === 'si' ? 'km/h' : 'kt'
}

// ── formateo texto completo (null → '—', patrón fmt de CellTable) ────────

export function formatHeightKft(v: number | null, units: UnitsPref, digits = 1): string {
  return v === null ? '—' : convertHeightKft(v, units).toFixed(digits)
}

export function formatSpeedKt(v: number | null, units: UnitsPref, digits = 0): string {
  return v === null ? '—' : convertSpeedKt(v, units).toFixed(digits)
}

// ── leyenda/cursor del raster ─────────────────────────────────────────────
// Mapa passthrough por unidad de paleta: solo kt y kft son convertibles;
// dBZ, mm, kg/m² y cualquier unidad futura desconocida pasan intactas —
// un producto nuevo del catálogo jamás rompe la leyenda en SI.

const RASTER_CONVERSIONS: Record<string, { factor: number, unit: string }> = {
  'kt': { factor: KT_TO_KMH, unit: 'km/h' },
  'kft': { factor: KFT_TO_KM, unit: 'km' },
}

export function convertRasterValue(
  value: number,
  unit: string,
  units: UnitsPref,
): { value: number, unit: string } {
  const conv = units === 'si' ? RASTER_CONVERSIONS[unit] : undefined
  return conv ? { value: value * conv.factor, unit: conv.unit } : { value, unit }
}

export function rasterUnitLabel(unit: string, units: UnitsPref): string {
  return convertRasterValue(0, unit, units).unit
}
