// Tabla de tareas del export animado (F7.3). Pura: ni mapa, ni canvas, ni
// reloj — por eso el determinismo del GIF se puede razonar sin navegador.
import { describe, expect, it } from 'vitest'
import { LOOP_MS } from '../../utils/lightning/anim'
import { phaseTasks, sequenceTasks, warmupFrames } from '../../utils/export/frame-driver'
import { trailFadeAlpha } from '../../utils/wind/particles'

describe('sequenceTasks', () => {
  it('una tarea por frame del pool, en orden', () => {
    const tasks = sequenceTasks(4, 400)
    expect(tasks).toHaveLength(4)
    expect(tasks.map(t => t.index)).toEqual([0, 1, 2, 3])
    expect(tasks.every(t => t.kind === 'sequence')).toBe(true)
  })

  it('la fase de rayos se reparte sobre la secuencia: el bucle cierra al final', () => {
    const tasks = sequenceTasks(4, 400)
    expect(tasks.map(t => t.lightningPhase)).toEqual([0, 0.25, 0.5, 0.75])
    // la fase 1 ≡ fase 0 (la edad es modular): repetirla duplicaría un frame
    expect(tasks.at(-1)!.lightningPhase).toBeLessThan(1)
  })

  it('el avance del viento es el retardo del frame, en segundos', () => {
    expect(sequenceTasks(2, 400).map(t => t.windDtS)).toEqual([0.4, 0.4])
    expect(sequenceTasks(2, 400).map(t => t.delayMs)).toEqual([400, 400])
  })

  it('sin frames o sin retardo no hay nada que capturar', () => {
    expect(sequenceTasks(0, 400)).toEqual([])
    expect(sequenceTasks(-1, 400)).toEqual([])
    expect(sequenceTasks(4, 0)).toEqual([])
  })
})

describe('phaseTasks', () => {
  it('un solo frame de radar, N fases del bucle', () => {
    const tasks = phaseTasks(5, 3)
    expect(tasks).toHaveLength(5)
    expect(tasks.every(t => t.index === 3)).toBe(true)
    expect(tasks.every(t => t.kind === 'phase')).toBe(true)
    expect(tasks.map(t => t.lightningPhase)).toEqual([0, 0.2, 0.4, 0.6, 0.8])
  })

  it('el retardo sale del bucle de 5 s, no de una preferencia', () => {
    const tasks = phaseTasks(10, 0)
    expect(tasks[0]!.delayMs).toBe(LOOP_MS / 10)
    // la suma de los retardos reconstruye el bucle completo
    expect(tasks.reduce((s, t) => s + t.delayMs, 0)).toBe(LOOP_MS)
  })

  it('índice negativo = no tocar el raster (modo estático, sin pool)', () => {
    expect(phaseTasks(3, -1).every(t => t.index === -1)).toBe(true)
  })

  it('count no positivo da tabla vacía', () => {
    expect(phaseTasks(0, 0)).toEqual([])
  })
})

// El viento resiembra al entrar en modo export: sin calentar, el frame 0 sale
// sin estelas y el bucle salta al dar la vuelta. Medido en el GIF de muestra:
// el empalme pasaba de 0.0330 (interior) a 0.0514 de RMSE. Ver decisión 42.
describe('warmupFrames', () => {
  it('deja el residuo de estela bajo el 1 %', () => {
    for (const dtS of [0.05, 0.1, 0.25, 0.4]) {
      const n = warmupFrames(dtS)
      expect(trailFadeAlpha(dtS) ** n).toBeLessThanOrEqual(0.01)
      // y no se pasa de largo: un frame menos ya no alcanzaría
      expect(trailFadeAlpha(dtS) ** (n - 1)).toBeGreaterThan(0.01)
    }
  })

  it('un dt más grande necesita menos frames', () => {
    expect(warmupFrames(0.25)).toBeLessThan(warmupFrames(0.05))
  })

  it('el GIF de fases (20 frames de 250 ms) calienta en pocos frames', () => {
    const [task] = phaseTasks(20, -1)
    expect(warmupFrames(task!.windDtS)).toBeLessThanOrEqual(5)
  })

  it('dt no positivo no calienta; un dt diminuto queda acotado', () => {
    expect(warmupFrames(0)).toBe(0)
    expect(warmupFrames(-1)).toBe(0)
    expect(warmupFrames(1e-9)).toBe(24) // WARMUP_MAX
  })
})
