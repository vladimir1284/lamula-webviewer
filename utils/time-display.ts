// Formateo de timestamps del contrato (ISO naive UTC) para display (D28).
// Solo presentación: la URL (shared/url/time-path.ts) y la partición por
// día (shared/contract/time.ts) siguen siempre en UTC. Con clock:'local'
// se usa la zona del navegador; `tz` explícita solo para tests.

import { naiveUtcToEpochMs } from '#shared/contract'

export type ClockPref = 'utc' | 'local'

/** 'HH:MM' en la zona elegida. En UTC es byte-idéntico a iso.slice(11,16). */
export function formatHhmm(iso: string, clock: ClockPref, tz?: string): string {
  if (clock === 'utc') return iso.slice(11, 16)
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: tz,
  }).format(naiveUtcToEpochMs(iso))
}

/**
 * Timestamp completo. En UTC es byte-idéntico al render histórico
 * (`${iso}Z`); en local, 'YYYY-MM-DD HH:MM:SS GMT-4' (Intl short).
 */
export function formatFull(iso: string, clock: ClockPref, tz?: string): string {
  if (clock === 'utc') return `${iso}Z`
  const epoch = naiveUtcToEpochMs(iso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: tz,
    timeZoneName: 'short',
  }).formatToParts(epoch)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(p => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} `
    + `${get('hour')}:${get('minute')}:${get('second')} ${get('timeZoneName')}`
}

/**
 * Sufijo para labels cortos de chart: en local la zona ya la declara el
 * caption — no repetirla en cada label.
 */
export function clockSuffix(clock: ClockPref): string {
  return clock === 'utc' ? 'Z' : ''
}
