const rad = Math.PI / 180
const deg = 180 / Math.PI

// Longitude and latitude of the point where the sun is overhead.
export function subsolarPoint(date: Date): [number, number] {
  const n = date.getTime() / 86400000 - 10957.5
  const meanLon = (280.46 + 0.9856474 * n) % 360
  const anomaly = (357.528 + 0.9856003 * n) * rad
  const eclLon =
    (meanLon + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * rad
  const obliquity = (23.439 - 0.0000004 * n) * rad
  const ra = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclLon),
    Math.cos(eclLon)
  )
  const dec = Math.asin(Math.sin(obliquity) * Math.sin(eclLon))
  const gmst = (280.46061837 + 360.98564736629 * n) % 360
  const lon = ((ra * deg - gmst + 540) % 360) - 180
  return [lon, dec * deg]
}

// Sun altitude above the horizon in degrees at a point.
export function sunAltitude(
  lon: number,
  lat: number,
  sun: [number, number]
): number {
  const [sunLon, sunLat] = sun
  const s =
    Math.sin(lat * rad) * Math.sin(sunLat * rad) +
    Math.cos(lat * rad) *
      Math.cos(sunLat * rad) *
      Math.cos((lon - sunLon) * rad)
  return Math.asin(Math.max(-1, Math.min(1, s))) * deg
}

// Latitude where the sun sits at the given altitude, for a longitude. Null when no such latitude exists.
export function boundaryLatitude(
  lon: number,
  altitude: number,
  sun: [number, number]
): number | null {
  const [sunLon, sunLat] = sun
  const a = Math.sin(sunLat * rad)
  const b = Math.cos(sunLat * rad) * Math.cos((lon - sunLon) * rad)
  const r = Math.hypot(a, b)
  const s = Math.sin(altitude * rad) / r
  if (Math.abs(s) > 1) return null
  const alpha = Math.atan2(b, a)
  const base = Math.asin(s)
  for (const phi of [base - alpha, Math.PI - base - alpha]) {
    const wrapped = ((phi + 3 * Math.PI) % (2 * Math.PI)) - Math.PI
    if (Math.abs(wrapped) <= Math.PI / 2) return wrapped * deg
  }
  return null
}

export const nightSteps = 2

// Polygon of the area where the sun is below the given altitude, west to east, closed over the dark pole.
export function nightPolygon(
  altitude: number,
  sun: [number, number],
  maxLat = 85
): [number, number][] {
  const points: [number, number][] = []
  for (let lon = -180; lon <= 180; lon += nightSteps) {
    const lat = boundaryLatitude(lon, altitude, sun)
    if (lat == null) {
      // whole meridian is on one side, keep the dark half of it
      const dark = sunAltitude(lon, 0, sun) < altitude
      points.push([
        lon,
        dark ? (sun[1] > 0 ? maxLat : -maxLat) : sun[1] > 0 ? -maxLat : maxLat,
      ])
      continue
    }
    points.push([lon, Math.max(-maxLat, Math.min(maxLat, lat))])
  }
  const pole = sun[1] > 0 ? -maxLat : maxLat
  points.push([180, pole], [-180, pole])
  return points
}
