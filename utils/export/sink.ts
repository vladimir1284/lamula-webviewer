// Salida del export: fichero y portapapeles.
//
// `copyCanvasToClipboard` NO es `async` a propósito. Safari aborta un
// `clipboard.write()` que ocurre después de que un `await` haya cerrado la
// tarea del gesto del usuario, así que el `ClipboardItem` tiene que recibir la
// PROMESA del blob y `write` tiene que invocarse de forma síncrona dentro del
// mismo click. Convertir esta función en `async` rompería el pegado en Safari
// sin romper ningún test de Chromium: no hacerlo.

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string = 'image/png',
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error(`canvasToBlob: toBlob devolvió null (${type})`)),
      type,
      quality,
    )
  })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // revocar en el siguiente tick: Firefox cancela la descarga si se revoca ya
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** ¿Este navegador puede poner una imagen en el portapapeles? (requiere contexto seguro) */
export function canCopyImages(): boolean {
  if (typeof ClipboardItem === 'undefined') return false
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.write !== 'function') return false
  const supports = (ClipboardItem as unknown as { supports?: (t: string) => boolean }).supports
  return typeof supports === 'function' ? supports('image/png') : true
}

export function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<void> {
  if (!canCopyImages()) {
    return Promise.reject(new Error('copyCanvasToClipboard: el navegador no soporta copiar imágenes'))
  }
  const item = new ClipboardItem({ 'image/png': canvasToBlob(canvas, 'image/png') })
  return navigator.clipboard.write([item]).then(() => undefined)
}
