import { describe, expect, it } from 'vitest'
import { exportFilename } from '~/utils/export/filename'

describe('exportFilename', () => {
  it('usa el vol_time en el mismo formato compacto que la URL', () => {
    expect(exportFilename({ site: 'KBYX', product: 'N0B', volTime: '2026-07-18T03:08:18', ext: 'png' }))
      .toBe('lamula_KBYX_N0B_20260718T030818Z.png')
  })

  it('sin vol_time cae al reloj', () => {
    expect(exportFilename({
      site: 'KBYX',
      product: 'N0B',
      volTime: null,
      ext: 'gif',
      now: new Date('2026-10-09T14:23:17.500Z'),
    })).toBe('lamula_KBYX_N0B_20261009T142317Z.gif')
  })

  it('acepta el código numérico cuando no hay mnemónico', () => {
    expect(exportFilename({ site: 'kbyx', product: 134, volTime: '2026-07-18T03:08:18', ext: 'png' }))
      .toBe('lamula_KBYX_134_20260718T030818Z.png')
  })

  it('no deja caracteres hostiles a un sistema de ficheros', () => {
    const name = exportFilename({ site: 'K/B Y..X', product: 'n0b-x', volTime: '2026-07-18T03:08:18', ext: 'png' })
    expect(name).toBe('lamula_KBYX_N0BX_20260718T030818Z.png')
    expect(name).not.toMatch(/[/\\:*?"<>|]/)
  })
})
