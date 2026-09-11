import type { Aircraft, Track, TrailPoint } from "@/lib/api/schemas"
import { initialBearing, wrapLon } from "./geo"

export const replayMinutes = 60
export const replayLimit = 400
export const replaySpeeds = [30, 120, 600]

type Parsed = { track: Track; points: TrailPoint[]; times: number[] }

export function parseTracks(tracks: Track[] | null | undefined): Parsed[] {
  const out: Parsed[] = []
  for (const track of tracks ?? []) {
    const points = (track.points ?? []).filter((p) =>
      Number.isFinite(Date.parse(p.time))
    )
    if (points.length < 2) continue
    out.push({ track, points, times: points.map((p) => Date.parse(p.time)) })
  }
  return out
}

// index of the last point at or before t, or -1
function before(times: number[], t: number) {
  let lo = 0
  let hi = times.length - 1
  if (t < (times[0] ?? 0)) return -1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((times[mid] ?? 0) <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}

// Interpolated aircraft states at a moment, only for tracks that span it.
export function positionsAt(tracks: Parsed[], t: number): Aircraft[] {
  const out: Aircraft[] = []
  const at = new Date(t).toISOString()
  for (const { track, points, times } of tracks) {
    const i = before(times, t)
    if (i < 0 || i >= points.length - 1) continue
    const a = points[i]
    const b = points[i + 1]
    const ta = times[i]
    const tb = times[i + 1]
    if (!a || !b || ta == null || tb == null) continue
    const f = tb > ta ? (t - ta) / (tb - ta) : 0
    const dLon = wrapLon(b.lon - a.lon)
    const lon = wrapLon(a.lon + dLon * f)
    const lat = a.lat + (b.lat - a.lat) * f
    const alt =
      a.baroAltM != null && b.baroAltM != null
        ? a.baroAltM + (b.baroAltM - a.baroAltM) * f
        : (a.baroAltM ?? b.baroAltM)
    const heading =
      Math.abs(dLon) + Math.abs(b.lat - a.lat) > 1e-4
        ? initialBearing(a.lat, a.lon, b.lat, b.lon)
        : (a.headingDeg ?? b.headingDeg)
    out.push({
      icao24: track.icao24,
      callsign: track.callsign,
      lat,
      lon,
      baroAltM: alt,
      headingDeg: heading,
      onGround: a.onGround,
      source: "adsb",
      category: "unknown",
      positionAt: at,
      lastContact: at,
    })
  }
  return out
}

// Points of a track up to a moment, for the trail of a replayed aircraft.
export function trackUntil(tracks: Parsed[], icao24: string, t: number) {
  const p = tracks.find((x) => x.track.icao24 === icao24)
  if (!p) return null
  const i = before(p.times, t)
  return i < 0 ? null : p.points.slice(0, i + 1)
}
