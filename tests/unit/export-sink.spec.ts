// Salida del export. El caso que importa de verdad es el de Safari: el
// ClipboardItem debe recibir la PROMESA del blob y `write` debe llamarse de
// forma síncrona dentro del gesto del usuario.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canCopyImages, canvasToBlob, copyCanvasToClipboard, downloadBlob } from '~/utils/export/sink'

const g = globalThis as Record<string, unknown>
const originals = { ClipboardItem: g.ClipboardItem, clipboard: (globalThis.navigator as { clipboard?: unknown })?.clipboard }

function stubClipboard() {
  const write = vi.fn(() => Promise.resolve())
  const seen: Record<string, unknown>[] = []
  class FakeClipboardItem {
    data: Record<string, unknown>
    constructor(data: Record<string, unknown>) {
      this.data = data
      seen.push(data)
    }
  }
  g.ClipboardItem = FakeClipboardItem
  Object.defineProperty(globalThis.navigator, 'clipboard', { value: { write }, configurable: true })
  return { write, seen }
}

afterEach(() => {
  g.ClipboardItem = originals.ClipboardItem
  Object.defineProperty(globalThis.navigator, 'clipboard', { value: originals.clipboard, configurable: true })
  vi.restoreAllMocks()
})

function fakeCanvas(blob: Blob | null = new Blob(['x'], { type: 'image/png' })): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.toBlob = ((cb: BlobCallback) => cb(blob)) as HTMLCanvasElement['toBlob']
  return canvas
}

describe('canvasToBlob', () => {
  it('resuelve con el blob', async () => {
    await expect(canvasToBlob(fakeCanvas())).resolves.toBeInstanceOf(Blob)
  })

  it('rechaza si toBlob devuelve null en vez de colgarse', async () => {
    await expect(canvasToBlob(fakeCanvas(null))).rejects.toThrow(/devolvió null/)
  })
})

describe('canCopyImages', () => {
  it('false sin ClipboardItem', () => {
    g.ClipboardItem = undefined
    expect(canCopyImages()).toBe(false)
  })

  it('true con ClipboardItem y navigator.clipboard.write', () => {
    stubClipboard()
    expect(canCopyImages()).toBe(true)
  })

  it('respeta ClipboardItem.supports cuando existe', () => {
    stubClipboard()
    ;(g.ClipboardItem as unknown as { supports: (t: string) => boolean }).supports = (t: string) => t !== 'image/png'
    expect(canCopyImages()).toBe(false)
  })
})

describe('copyCanvasToClipboard', () => {
  it('pasa una PROMESA al ClipboardItem y llama write en el mismo tick (requisito de Safari)', () => {
    const { write, seen } = stubClipboard()
    const p = copyCanvasToClipboard(fakeCanvas())
    // síncrono: sin await de por medio, el gesto del usuario sigue vivo
    expect(write).toHaveBeenCalledTimes(1)
    expect(seen).toHaveLength(1)
    expect(seen[0]!['image/png']).toBeInstanceOf(Promise)
    return p
  })

  it('rechaza (no lanza) donde no hay soporte', async () => {
    g.ClipboardItem = undefined
    await expect(copyCanvasToClipboard(fakeCanvas())).rejects.toThrow(/no soporta/)
  })
})

describe('downloadBlob', () => {
  it('crea un anchor con download, lo clickea y lo retira', () => {
    const createObjectURL = vi.fn(() => 'blob:fake')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(globalThis.URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadBlob(new Blob(['x']), 'lamula_KBYX_N0B_20260718T030818Z.png')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(document.querySelector('a[download]')).toBeNull()
  })
})
