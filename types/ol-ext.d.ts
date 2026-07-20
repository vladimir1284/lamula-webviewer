// ol-ext no publica tipos (ni @types/ol-ext) — poc(raster): variante Laplacian
// vía ol-ext/filter/SVGFilter.js + ol-ext/util/SVGFilter/Laplacian.js.
declare module 'ol-ext/filter/SVGFilter.js' {
  const SVGFilter: new (filters?: unknown) => unknown
  export default SVGFilter
}

declare module 'ol-ext/util/SVGFilter/Laplacian.js' {
  const Laplacian: new (options?: { neighbours?: 4 | 8, grayscale?: boolean, alpha?: boolean }) => unknown
  export default Laplacian
}
