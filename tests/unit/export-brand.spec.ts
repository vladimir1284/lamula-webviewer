// Marca del export (F7.2): marca de agua del logo y avatar circular.
// Mismo truco que export-chrome.spec.ts: contexto 2D grabador a mano, sin
// `node-canvas`.
import { describe, expect, it } from 'vitest'
import type { BrandImage } from '~/utils/export/types'
import { WATERMARK_ALPHA, drawAvatar, drawWatermark, watermarkLayout } from '~/utils/export/brand'

interface Op { op: string, args: unknown[] }

function recorder() {
  const ops: Op[] = []
  const rec = (op: string) => (...args: unknown[]) => { ops.push({ op, args }) }
  const ctx = {
    ops,
    fillStyle: '' as unknown,
    strokeStyle: '' as unknown,
    globalAlpha: 1,
    lineWidth: 1,
    save: rec('save'),
    restore: rec('restore'),
    setTransform: rec('setTransform'),
    beginPath: rec('beginPath'),
    arc: rec('arc'),
    clip: rec('clip'),
    stroke: rec('stroke'),
    drawImage: (...args: unknown[]) => { ops.push({ op: 'drawImage', args: [...args, ctx.globalAlpha] }) },
  }
  return ctx
}

const LOGO: BrandImage = { image: {} as CanvasImageSource, width: 172, height: 167 }

describe('watermarkLayout', () => {
  it('va a la esquina inferior derecha del ÁREA DEL MAPA', () => {
    const box = watermarkLayout(LOGO, 1280, 800)!
    expect(box.x + box.width).toBeLessThan(1280)
    expect(box.y + box.height).toBeLessThan(800)
    expect(box.x).toBeGreaterThan(1280 * 0.8)
    expect(box.y).toBeGreaterThan(800 * 0.8)
  })

  it('conserva la relación de aspecto del logo', () => {
    const box = watermarkLayout(LOGO, 1280, 800)!
    expect(box.height / box.width).toBeCloseTo(167 / 172, 5)
  })

  it('acota el tamaño en viewports extremos', () => {
    expect(watermarkLayout(LOGO, 320, 240)!.width).toBe(48)
    expect(watermarkLayout(LOGO, 4000, 3000)!.width).toBe(120)
  })

  it('una imagen sin dimensiones no se dibuja', () => {
    expect(watermarkLayout({ ...LOGO, width: 0 }, 1280, 800)).toBeNull()
    expect(watermarkLayout({ ...LOGO, height: 0 }, 1280, 800)).toBeNull()
  })
})

describe('drawWatermark', () => {
  it('dibuja apenas visible y escala px CSS a px del canvas', () => {
    const ctx = recorder()
    drawWatermark(ctx as unknown as CanvasRenderingContext2D, LOGO, { widthCss: 1280, heightCss: 800, scale: 2 })
    expect(ctx.ops.find(o => o.op === 'setTransform')!.args).toEqual([2, 0, 0, 2, 0, 0])
    const draw = ctx.ops.find(o => o.op === 'drawImage')!
    expect(draw.args.at(-1)).toBe(WATERMARK_ALPHA)
    expect(WATERMARK_ALPHA).toBeLessThan(0.2)
    // restaura el alpha: el chrome que viene después no puede salir translúcido
    expect(ctx.ops.at(-1)!.op).toBe('restore')
  })

  it('sin dimensiones no emite ningún dibujo', () => {
    const ctx = recorder()
    drawWatermark(ctx as unknown as CanvasRenderingContext2D, { ...LOGO, width: 0 }, { widthCss: 800, heightCss: 600, scale: 1 })
    expect(ctx.ops.filter(o => o.op === 'drawImage')).toHaveLength(0)
  })
})

describe('drawAvatar', () => {
  it('recorta en círculo y hace cover centrado de una foto apaisada', () => {
    const ctx = recorder()
    drawAvatar(ctx as unknown as CanvasRenderingContext2D, { image: {} as CanvasImageSource, width: 200, height: 100 }, { x: 10, y: 20, size: 40 })

    const arc = ctx.ops.find(o => o.op === 'arc')!
    expect(arc.args.slice(0, 3)).toEqual([30, 40, 20]) // centro + radio
    expect(ctx.ops.some(o => o.op === 'clip')).toBe(true)

    const draw = ctx.ops.find(o => o.op === 'drawImage')!
    // recorte cuadrado de lado 100 centrado: sx=50, sy=0
    expect(draw.args.slice(1, 5)).toEqual([50, 0, 100, 100])
    expect(draw.args.slice(5, 9)).toEqual([10, 20, 40, 40])
  })

  it('una imagen sin dimensiones no se dibuja', () => {
    const ctx = recorder()
    drawAvatar(ctx as unknown as CanvasRenderingContext2D, { image: {} as CanvasImageSource, width: 0, height: 0 }, { x: 0, y: 0, size: 40 })
    expect(ctx.ops).toHaveLength(0)
  })
})
