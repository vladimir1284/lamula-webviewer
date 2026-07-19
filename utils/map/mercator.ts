// Proyección inline EPSG:4326 → EPSG:3857 sin pasar por ol/proj en hot
// paths de canvas (miles de llamadas por tick); mismas constantes que usa
// OL. Compartida por las capas canvas custom (viento, rayos).
const R_3857 = 6378137

export function fromLonLat3857(lon: number, lat: number): [number, number] {
  return [
    (lon * Math.PI * R_3857) / 180,
    R_3857 * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
  ]
}
