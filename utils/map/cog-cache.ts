// Cache de blobs de COG por r2_key, compartida entre modo estático
// (RadarMap.updateRasterLayer) y el pool de animación (FramePool): un mismo
// raster no debe volver a descargarse por reaparecer en una ventana del
// timeline o por re-visitar un tiempo ya visto haciendo scrub/stepping.
// LRU simple por recencia de acceso (no de tamaño) — alcanza para una
// sesión normal de scrubbing/animación.
const MAX_ENTRIES = 64
const cache = new Map<string, Promise<Blob>>()

export function getCogBlob(r2Key: string, url: string): Promise<Blob> {
  const cached = cache.get(r2Key)
  if (cached) {
    cache.delete(r2Key)
    cache.set(r2Key, cached) // recency: al final
    return cached
  }

  const promise = fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.blob()
  })
  // fetch fallido: no cachear el rechazo, permite reintentar más tarde
  promise.catch(() => {
    if (cache.get(r2Key) === promise) cache.delete(r2Key)
  })

  cache.set(r2Key, promise)
  if (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (oldestKey !== undefined) cache.delete(oldestKey)
  }
  return promise
}
