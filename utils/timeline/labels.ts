/**
 * Qué etiquetas de tick dibuja `TimelineStrip.vue` bajo el track.
 *
 * El componente ancla la primera etiqueta a la izquierda y la última a la
 * derecha, y centra las intermedias. Esa asimetría manda sobre el cálculo: dos
 * etiquetas centradas vecinas necesitan `ancho + aire` entre centros, pero la
 * pareja borde→intermedia necesita `ancho + ancho/2 + aire`, que es el caso
 * peor. Se usa un solo número para los dos.
 *
 * Medido en Chromium: '11:03 pm' en `text-sm font-bold` ocupa 74 px (el reloj
 * está clavado a `en-US` 12 h en el componente, así que todas las etiquetas
 * tienen esa forma). 74 + 37 + 9 de aire = 120.
 */
export const TICK_LABEL_PITCH_PX = 120

/** Tope histórico (D36): más de 6 etiquetas saturan el track aunque quepan. */
export const MAX_TICK_LABELS = 6

/** Índices equiespaciados *en la lista*, incluidos siempre los dos extremos. */
function evenlySpaced(total: number, count: number): number[] {
  if (count <= 1) return [0]
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i * (total - 1)) / (count - 1))
    if (out.at(-1) !== idx) out.push(idx)
  }
  return out
}

/**
 * Elige qué posiciones etiquetar sin que dos etiquetas se pisen.
 *
 * Equiespaciar en la LISTA no equiespacia en el TRACK: los vol_times no caen a
 * intervalos regulares (un volumen tarda entre ~2 y ~6 min según el VCP, y un
 * hueco de ingesta los separa más todavía). Por eso no basta con contar cuántas
 * caben — hace falta descartar las que queden demasiado juntas en píxeles.
 *
 * @param pcts posición de cada vol_time en el track, 0..100.
 * @param trackWidthPx ancho medido del track. `<= 0` significa "todavía no
 *   medido" (SSR, jsdom): devuelve los 6 equiespaciados de siempre, para que el
 *   HTML del servidor coincida con el del cliente y la hidratación no parpadee.
 */
export function pickTickLabels(pcts: number[], trackWidthPx: number): number[] {
  const total = pcts.length
  if (total === 0) return []
  const candidates = evenlySpaced(total, Math.min(MAX_TICK_LABELS, total))
  if (trackWidthPx <= 0) return candidates

  const minGapPct = (TICK_LABEL_PITCH_PX / trackWidthPx) * 100
  const gapOk = (a: number, b: number) => (pcts[b] ?? 0) - (pcts[a] ?? 0) >= minGapPct

  const kept: number[] = []
  for (const idx of candidates) {
    const prev = kept.at(-1)
    if (prev === undefined || gapOk(prev, idx)) kept.push(idx)
  }

  // El último extremo manda: es el que cierra el rango del día. Si se cayó por
  // quedar pegado al anterior, se retiran los anteriores hasta que entre.
  const last = candidates.at(-1)
  if (last !== undefined && kept.at(-1) !== last) {
    while (kept.length > 1 && !gapOk(kept.at(-1)!, last)) kept.pop()
    kept.push(last)
  }
  return kept
}
