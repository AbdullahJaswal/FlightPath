import type { Aircraft, Route } from "@/lib/api/schemas"
import { deadReckon, haversineKm } from "./geo"

export const maxExtrapolationS = 600

// Position moved along the last heading and speed since the report, capped.
export function livePosition(a: Aircraft, nowMs: number): [number, number] {
  const at = Date.parse(a.positionAt)
  if (
    a.onGround ||
    !a.velocityMs ||
    a.headingDeg == null ||
    !Number.isFinite(at)
  ) {
    return [a.lon, a.lat]
  }
  const dt = Math.min(maxExtrapolationS, Math.max(0, (nowMs - at) / 1000))
  if (dt === 0) return [a.lon, a.lat]
  const [lat, lon] = deadReckon(a.lat, a.lon, a.headingDeg, a.velocityMs, dt)
  return [lon, lat]
}

export type Progress = {
  totalKm: number
  flownKm: number
  remainingKm: number
  fraction: number
  etaSeconds: number | null
}

export function flightProgress(
  a: Pick<Aircraft, "lat" | "lon" | "velocityMs">,
  route?: Route
): Progress | null {
  const o = route?.origin
  const d = route?.destination
  if (!o || !d) return null
  const flownKm = haversineKm(o.lat, o.lon, a.lat, a.lon)
  const remainingKm = haversineKm(a.lat, a.lon, d.lat, d.lon)
  const totalKm = haversineKm(o.lat, o.lon, d.lat, d.lon)
  const fraction = Math.min(1, flownKm / (flownKm + remainingKm || 1))
  const etaSeconds =
    a.velocityMs && a.velocityMs > 30
      ? (remainingKm * 1000) / a.velocityMs
      : null
  return { totalKm, flownKm, remainingKm, fraction, etaSeconds }
}
