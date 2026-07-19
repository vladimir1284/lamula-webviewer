// Join por ventana del overlay de rayos: la ventana de observación del
// frame (vol_time anterior, vol_time], su cruce con cubos de 300 s y la
// normalización de strikes a progreso 0–1 — más el caso real derivado de
// la fixture (cubos sintéticos alrededor del volumen con meso).
import type { LightningBucketFile, LightningBucketMeta } from '#shared/contract'
import { describe, expect, it } from 'vitest'
import {
  bucketsInWindow,
  LIGHTNING_WINDOW_FALLBACK_S,
  observationWindow,
  strikesInWindow,
} from '~/utils/overlay/lightning-join'
import { lightningDay } from '../helpers/derive'

const epoch = (iso: string) => Date.parse(`${iso}Z`)

function meta(bucketStart: string, strikeCount = 10): LightningBucketMeta {
  return {
    site_id: 'TST',
    bucket_start: bucketStart,
    bucket_s: 300,
    strike_count: strikeCount,
    r2_key: strikeCount > 0 ? `TST/LIGHTNING/x/${bucketStart}.json` : null,
    source: 'glm-goes19',
    lightning_url: strikeCount > 0 ? `https://r2.test/${bucketStart}.json` : null,
  }
}

function file(bucketStart: string, offsets: number[]): LightningBucketFile {
  return {
    site: 'TST',
    bucket_start: bucketStart,
    bucket_s: 300,
    strikes: offsets.map((o, i) => [-81 - i * 0.01, 24 + i * 0.01, o]),
  }
}

describe('observationWindow', () => {
  it('con frame anterior: (prev, vol]', () => {
    const w = observationWindow('2026-07-11T03:08:18', '2026-07-11T03:04:52')
    expect(w.startMs).toBe(epoch('2026-07-11T03:04:52'))
    expect(w.endMs).toBe(epoch('2026-07-11T03:08:18'))
  })

  it('sin frame anterior: fallback de 600 s', () => {
    const w = observationWindow('2026-07-11T03:08:18', null)
    expect(w.endMs - w.startMs).toBe(LIGHTNING_WINDOW_FALLBACK_S * 1000)
  })

  it('hueco del feed (> 600 s) se recorta al fallback — no comprimir 1 h de rayos en el bucle', () => {
    const w = observationWindow('2026-07-11T03:08:18', '2026-07-11T02:00:00')
    expect(w.endMs - w.startMs).toBe(LIGHTNING_WINDOW_FALLBACK_S * 1000)
  })
})

describe('bucketsInWindow', () => {
  const w = observationWindow('2026-07-11T03:08:18', '2026-07-11T03:04:52')

  it('incluye los cubos que solapan la ventana', () => {
    const hit = [meta('2026-07-11T03:00:00'), meta('2026-07-11T03:05:00')]
    expect(bucketsInWindow(hit, w)).toEqual(hit)
  })

  it('excluye cubos que terminan en o antes del inicio (ventana abierta por la izquierda)', () => {
    // termina 03:00 < inicio 03:04:52 y termina exactamente en el inicio → fuera
    expect(bucketsInWindow([meta('2026-07-11T02:55:00')], w)).toEqual([])
    const wAligned = { startMs: epoch('2026-07-11T03:00:00'), endMs: epoch('2026-07-11T03:08:00') }
    expect(bucketsInWindow([meta('2026-07-11T02:55:00')], wAligned)).toEqual([])
  })

  it('incluye un cubo que empieza exactamente en el fin (contiene t = fin con offset 0)', () => {
    const wAligned = { startMs: epoch('2026-07-11T03:00:00'), endMs: epoch('2026-07-11T03:05:00') }
    expect(bucketsInWindow([meta('2026-07-11T03:05:00')], wAligned)).toHaveLength(1)
    expect(bucketsInWindow([meta('2026-07-11T03:10:00')], wAligned)).toEqual([])
  })

  it('cubos vacíos (strike_count 0 / r2_key null) no se fetchean', () => {
    expect(bucketsInWindow([meta('2026-07-11T03:05:00', 0)], w)).toEqual([])
  })

  it('caso real de la fixture: la ventana del último cubo con strikes lo selecciona', () => {
    const rows = lightningDay.rows
      .map(r => ({ ...r, lightning_url: r.r2_key && `https://r2.test/${r.r2_key}` }))
      .filter(r => r.strike_count > 0)
    const last = rows.at(-1)!
    const wReal = {
      startMs: epoch(last.bucket_start),
      endMs: epoch(last.bucket_start) + last.bucket_s * 1000,
    }
    expect(bucketsInWindow(rows as LightningBucketMeta[], wReal)).toContainEqual(last)
  })
})

describe('strikesInWindow', () => {
  const w = { startMs: epoch('2026-07-11T03:00:00'), endMs: epoch('2026-07-11T03:05:00') }

  it('filtra por (start, end] y normaliza el progreso', () => {
    const strikes = strikesInWindow([file('2026-07-11T03:00:00', [0, 150, 300 - 0.1])], w)
    // offset 0 → t == inicio → fuera (abierta); 150 → 0.5; 299.9 → ~1
    expect(strikes.map(s => s.progress)).toEqual([0.5, expect.closeTo(0.99966, 4)])
  })

  it('una descarga exactamente en vol_time llega con progress 1 (criterio de proporcionalidad)', () => {
    const strikes = strikesInWindow([file('2026-07-11T03:00:00', [150]), {
      ...file('2026-07-11T03:05:00', [0]),
    }], w)
    expect(strikes.at(-1)!.progress).toBe(1)
  })

  it('cruza varios cubos y ordena por progreso', () => {
    const strikes = strikesInWindow(
      [file('2026-07-11T03:00:00', [200, 100]), file('2026-07-11T02:55:00', [280])],
      { startMs: epoch('2026-07-11T02:58:00'), endMs: epoch('2026-07-11T03:05:00') },
    )
    expect(strikes.map(s => s.progress)).toEqual(
      [...strikes.map(s => s.progress)].sort((a, b) => a - b),
    )
    expect(strikes).toHaveLength(3)
  })

  it('strikes fuera de la ventana no aparecen jamás (regla D24)', () => {
    const strikes = strikesInWindow([file('2026-07-11T02:55:00', [0, 100])], w)
    expect(strikes).toEqual([])
  })
})
