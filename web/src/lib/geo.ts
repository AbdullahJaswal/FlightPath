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

// Initial great-circle bearing from the first point to the second, in degrees.
export function initialBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const dLon = rad(lon2 - lon1)
  const y = Math.sin(dLon) * Math.cos(rad(lat2))
  const x =
    Math.cos(rad(lat1)) * Math.sin(rad(lat2)) -
    Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(dLon)
  return (deg(Math.atan2(y, x)) + 360) % 360
}

// Points along the great circle between two lon/lat pairs, ends included.
export function greatCircle(
  a: [number, number],
  b: [number, number],
  steps = 64
): [number, number][] {
  const [lon1, lat1] = [rad(a[0]), rad(a[1])]
  const [lon2, lat2] = [rad(b[0]), rad(b[1])]
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
      )
    )
  if (d === 0) return [a, b]
  const out: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const f = i / steps
    const p = Math.sin((1 - f) * d) / Math.sin(d)
    const q = Math.sin(f * d) / Math.sin(d)
    const x =
      p * Math.cos(lat1) * Math.cos(lon1) + q * Math.cos(lat2) * Math.cos(lon2)
    const y =
      p * Math.cos(lat1) * Math.sin(lon1) + q * Math.cos(lat2) * Math.sin(lon2)
    const z = p * Math.sin(lat1) + q * Math.sin(lat2)
    out.push([deg(Math.atan2(y, x)), deg(Math.atan2(z, Math.hypot(x, y)))])
  }
  return out
}
