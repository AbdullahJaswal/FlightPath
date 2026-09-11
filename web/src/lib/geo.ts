const earthKm = 6371

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * earthKm * Math.asin(Math.min(1, Math.sqrt(a)))
}

// Flat step along the heading, accurate enough for a few minutes of flight.
export function deadReckon(
  lat: number,
  lon: number,
  headingDeg: number,
  velocityMs: number,
  seconds: number
): [number, number] {
  const dist = (velocityMs * seconds) / 1000 / earthKm
  const h = rad(headingDeg)
  const lat2 = lat + deg(dist * Math.cos(h))
  const lon2 = lon + deg((dist * Math.sin(h)) / Math.cos(rad(lat)))
  return [clampLat(lat2), wrapLon(lon2)]
}

export function wrapLon(lon: number) {
  return ((((lon + 180) % 360) + 360) % 360) - 180
}

export function clampLat(lat: number) {
  return Math.max(-89.9, Math.min(89.9, lat))
}

const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const

export function compassPoint(headingDeg: number) {
  const i = Math.round((((headingDeg % 360) + 360) % 360) / 45) % 8
  return points[i] ?? "N"
}
