// Chrome del export dibujado con Canvas2D. happy-dom no trae contexto 2D, así
// que se graba la secuencia de operaciones contra un contexto falso y se
// assertan los datos que tienen que salir en la imagen. Sin `node-canvas`.
import { describe, expect, it } from 'vitest'
import { n0b } from '../../shared/products/defs/n0b'
import { n0g } from '../../shared/products/defs/n0g'
import { attributionsFor } from '../../shared/attributions'
import type { ChromeSpec } from '~/utils/export/chrome'
import { chromeLayout, drawChrome } from '~/utils/export/chrome'
import { legendGeometry } from '~/utils/export/legend-geometry'

interface Op { op: string, args: unknown[] }

function recorder() {
  const ops: Op[] = []
  const rec = (op: string) => (...args: unknown[]) => { ops.push({ op, args }) }
  const ctx = {
    ops,
    fillStyle: '' as unknown,
    strokeStyle: '' as unknown,
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    lineWidth: 1,
    save: rec('save'),
    restore: rec('restore'),
    setTransform: rec('setTransform'),
    translate: rec('translate'),
    beginPath: rec('beginPath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    stroke: rec('stroke'),
    fill: rec('fill'),
    roundRect: rec('roundRect'),
    fillRect: (...args: unknown[]) => { ops.push({ op: 'fillRect', args: [...args, ctx.fillStyle] }) },
    fillText: (...args: unknown[]) => { ops.push({ op: 'fillText', args: [...args, ctx.fillStyle, ctx.font] }) },
    measureText: (t: string) => ({ width: t.length * 7 }),
    createLinearGradient: (...args: unknown[]) => {
      ops.push({ op: 'createLinearGradient', args })
      return { addColorStop: rec('addColorStop') }
    },
  }
  return ctx
}

function texts(ctx: ReturnType<typeof recorder>): string[] {
  return ctx.ops.filter(o => o.op === 'fillText').map(o => String(o.args[0]))
}

const BASE: ChromeSpec = {
  mode: 'bar',
  title: 'LAMULA WebViewer',
  site: 'KBYX',
  siteName: 'Key West',
  product: 'Reflectividad base 0.5° (N0B)',
  timeIso: '2026-07-18T03:08:18',
  clock: 'utc',
  units: 'imperial',
  palette: n0b.palette,
  attributions: attributionsFor('osm', true),
  parts: { title: true, meta: true, legend: true, attribution: true },
}

describe('chromeLayout', () => {
  it('modo bar: la franja va BAJO el mapa y no tapa píxeles de radar', () => {
    const l = chromeLayout(BASE, 800, 600)
    expect(l.barHeight).toBeGreaterThan(0)
    expect(l.legend!.y).toBeGreaterThanOrEqual(600)
    expect(l.legend!.x + l.legend!.width).toBeLessThanOrEqual(800)
  })

  it('modo overlay: nada de franja, la leyenda cae dentro del mapa', () => {
    const l = chromeLayout({ ...BASE, mode: 'overlay' }, 800, 600)
    expect(l.barHeight).toBe(0)
    expect(l.legend!.y).toBeLessThan(600)
    expect(l.legend!.y).toBeGreaterThan(0)
  })

  it('modo none: layout vacío', () => {
    expect(chromeLayout({ ...BASE, mode: 'none' }, 800, 600))
      .toEqual({ barHeight: 0, lines: [], legend: null, attribution: null })
  })

  it('cada parte desactivada desaparece y encoge la franja', () => {
    const full = chromeLayout(BASE, 800, 600)
    const noLegend = chromeLayout({ ...BASE, parts: { ...BASE.parts, legend: false } }, 800, 600)
    expect(noLegend.legend).toBeNull()
    // con las tres líneas de texto el bloque manda sobre la leyenda: quitarla
    // no encoge la franja. Sí lo hace cuando la leyenda es lo más alto.
    expect(noLegend.barHeight).toBeLessThanOrEqual(full.barHeight)
    const soloTitulo = { title: true, meta: false, attribution: false }
    const conLeyenda = chromeLayout({ ...BASE, parts: { ...soloTitulo, legend: true } }, 800, 600)
    const sinLeyenda = chromeLayout({ ...BASE, parts: { ...soloTitulo, legend: false } }, 800, 600)
    expect(sinLeyenda.barHeight).toBeLessThan(conLeyenda.barHeight)

    const noAttr = chromeLayout({ ...BASE, parts: { ...BASE.parts, attribution: false } }, 800, 600)
    expect(noAttr.attribution).toBeNull()

    const nothing = chromeLayout(
      { ...BASE, parts: { title: false, meta: false, legend: false, attribution: false } },
      800,
      600,
    )
    expect(nothing.barHeight).toBe(0)
  })

  it('sin paleta no hay leyenda aunque la parte esté activa', () => {
    expect(chromeLayout({ ...BASE, palette: null }, 800, 600).legend).toBeNull()
  })

  it('el ancho de la leyenda queda acotado en viewports extremos', () => {
    expect(chromeLayout(BASE, 320, 480).legend!.width).toBe(220)
    expect(chromeLayout(BASE, 3000, 2000).legend!.width).toBe(420)
  })
})

describe('drawChrome', () => {
  it('escribe sitio, producto, hora, unidad, título y atribución', () => {
    const ctx = recorder()
    drawChrome(ctx as unknown as CanvasRenderingContext2D, BASE, { widthCss: 800, heightCss: 600, scale: 2 })
    const t = texts(ctx)
    expect(t).toContain('LAMULA WebViewer')
    expect(t.some(s => s.includes('KBYX') && s.includes('Key West') && s.includes('N0B'))).toBe(true)
    expect(t).toContain('2026-07-18T03:08:18Z')
    expect(t).toContain('dBZ')
    expect(t.some(s => s.includes('OpenStreetMap') && s.includes('NOAA'))).toBe(true)
  })

  it('aplica el pixelRatio una sola vez, con setTransform (no acumula)', () => {
    const ctx = recorder()
    drawChrome(ctx as unknown as CanvasRenderingContext2D, BASE, { widthCss: 800, heightCss: 600, scale: 2 })
    const set = ctx.ops.filter(o => o.op === 'setTransform')
    expect(set).toHaveLength(1)
    expect(set[0]!.args).toEqual([2, 0, 0, 2, 0, 0])
  })

  it('modo bar: pinta el fondo de la franja justo debajo del mapa', () => {
    const ctx = recorder()
    drawChrome(ctx as unknown as CanvasRenderingContext2D, BASE, { widthCss: 800, heightCss: 600, scale: 1 })
    const bar = ctx.ops.find(o => o.op === 'fillRect' && o.args[1] === 600 && o.args[2] === 800)
    expect(bar).toBeDefined()
    expect(String(bar!.args[4])).toContain('rgba(15, 23, 42')
  })

  it('leyenda steps: un fillRect por stop, sin gradiente', () => {
    const ctx = recorder()
    drawChrome(ctx as unknown as CanvasRenderingContext2D, BASE, { widthCss: 800, heightCss: 600, scale: 1 })
    const lw = chromeLayout(BASE, 800, 600).legend!.width
    const g = legendGeometry(n0b.palette, 'imperial', lw)
    const bars = ctx.ops.filter(o => o.op === 'fillRect' && o.args[3] === g.barH)
    expect(bars).toHaveLength(n0b.palette.stops.length)
    expect(ctx.ops.some(o => o.op === 'createLinearGradient')).toBe(false)
  })

  it('leyenda interpolated: gradiente con una parada por stop', () => {
    const ctx = recorder()
    drawChrome(
      ctx as unknown as CanvasRenderingContext2D,
      { ...BASE, palette: n0g.palette },
      { widthCss: 800, heightCss: 600, scale: 1 },
    )
    expect(ctx.ops.filter(o => o.op === 'createLinearGradient')).toHaveLength(1)
    expect(ctx.ops.filter(o => o.op === 'addColorStop')).toHaveLength(n0g.palette.stops.length)
  })

  it('units si convierte la etiqueta de unidad del chrome', () => {
    const ctx = recorder()
    drawChrome(
      ctx as unknown as CanvasRenderingContext2D,
      { ...BASE, palette: n0g.palette, units: 'si' },
      { widthCss: 800, heightCss: 600, scale: 1 },
    )
    expect(texts(ctx)).toContain('km/h')
    expect(texts(ctx)).not.toContain('kt')
  })

  it('clock local no imprime el sufijo Z del UTC', () => {
    const ctx = recorder()
    drawChrome(
      ctx as unknown as CanvasRenderingContext2D,
      { ...BASE, clock: 'local' },
      { widthCss: 800, heightCss: 600, scale: 1 },
    )
    // ojo: 'dBZ' también termina en Z — lo que no debe aparecer es el
    // timestamp UTC con su sufijo
    expect(texts(ctx).some(s => /T\d{2}:\d{2}:\d{2}Z$/.test(s))).toBe(false)
    expect(texts(ctx).some(s => /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s))).toBe(true)
  })

  it('modo none no dibuja nada', () => {
    const ctx = recorder()
    drawChrome(ctx as unknown as CanvasRenderingContext2D, { ...BASE, mode: 'none' }, { widthCss: 800, heightCss: 600, scale: 1 })
    expect(ctx.ops).toHaveLength(0)
  })

  it('modo overlay: la atribución va DENTRO de la pastilla de la leyenda', () => {
    const ctx = recorder()
    const spec = { ...BASE, mode: 'overlay' as const }
    drawChrome(ctx as unknown as CanvasRenderingContext2D, spec, { widthCss: 800, heightCss: 600, scale: 1 })

    const layout = chromeLayout(spec, 800, 600)
    const lg = legendGeometry(n0b.palette, 'imperial', layout.legend!.width)
    const attr = ctx.ops.find(o => o.op === 'fillText' && String(o.args[0]).includes('OpenStreetMap'))
    expect(attr).toBeDefined()
    const ay = Number(attr!.args[2])

    // la pastilla que envuelve leyenda + atribución
    const pill = ctx.ops.find(o => o.op === 'roundRect' && Number(o.args[1]) > 400)
    expect(pill).toBeDefined()
    const [px0, py0, pw, ph] = (pill!.args as number[]).map(Number)
    expect(ph).toBeGreaterThan(lg.height)
    // el texto cae dentro de la caja de la pastilla, no contra el borde inferior
    expect(ay).toBeGreaterThan(py0!)
    expect(ay).toBeLessThan(py0! + ph!)
    expect(Number(attr!.args[1])).toBeGreaterThanOrEqual(px0!)
    expect(px0! + pw!).toBeLessThanOrEqual(800)
    expect(py0! + ph!).toBeLessThanOrEqual(600)
  })

  it('modo overlay sin leyenda: la atribución se dibuja con pastilla propia', () => {
    const ctx = recorder()
    const spec = { ...BASE, mode: 'overlay' as const, parts: { ...BASE.parts, legend: false } }
    drawChrome(ctx as unknown as CanvasRenderingContext2D, spec, { widthCss: 800, heightCss: 600, scale: 1 })
    const attr = ctx.ops.find(o => o.op === 'fillText' && String(o.args[0]).includes('OpenStreetMap'))
    expect(attr).toBeDefined()
    // dos pastillas: la del texto arriba y la de la atribución abajo
    expect(ctx.ops.filter(o => o.op === 'roundRect').length).toBeGreaterThanOrEqual(2)
  })

  it('modo overlay: mide el texto para la pastilla, nunca la adivina', () => {
    const ctx = recorder()
    drawChrome(
      ctx as unknown as CanvasRenderingContext2D,
      { ...BASE, mode: 'overlay' },
      { widthCss: 800, heightCss: 600, scale: 1 },
    )
    expect(ctx.ops.some(o => o.op === 'roundRect')).toBe(true)
    // ningún fillRect a lo ancho del canvas: el overlay no pinta franja
    expect(ctx.ops.some(o => o.op === 'fillRect' && o.args[2] === 800)).toBe(false)
  })
})
