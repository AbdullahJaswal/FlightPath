import { compassPoint } from "./geo"

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

export const formatInt = (n: number) => integer.format(n)
export const metersToFeet = (m: number) => m * 3.28084
export const msToKnots = (ms: number) => ms * 1.94384

export function formatAltitude(m?: number, onGround?: boolean) {
  if (onGround) return "On ground"
  if (m == null) return "n/a"
  return `${formatInt(metersToFeet(m))} ft`
}

export function flightLevel(m?: number) {
  if (m == null || m < 3000) return null
  return `FL${String(Math.round(metersToFeet(m) / 100)).padStart(3, "0")}`
}

export function formatSpeed(ms?: number) {
  if (ms == null) return "n/a"
  return `${formatInt(msToKnots(ms))} kt`
}

export function formatSpeedKmh(ms?: number) {
  if (ms == null) return "n/a"
  return `${formatInt(ms * 3.6)} km/h`
}

export function formatVerticalRate(ms?: number) {
  if (ms == null) return "n/a"
  const fpm = Math.round((metersToFeet(ms) * 60) / 50) * 50
  if (Math.abs(fpm) < 100) return "Level"
  return `${fpm > 0 ? "+" : ""}${formatInt(fpm)} ft/min`
}

export function formatHeading(d?: number) {
  if (d == null) return "n/a"
  return `${Math.round(d)}° ${compassPoint(d)}`
}

export function formatDistance(km: number) {
  return `${formatInt(km)} km`
}

export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  if (h === 0) return m === 0 ? "under a minute" : `${m} min`
  return `${h}h ${String(m).padStart(2, "0")}m`
}

export function formatAge(seconds: number) {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`
}

export function secondsSince(iso: string, now = Date.now()) {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? (now - t) / 1000 : 0
}

// aviationstack reports airport local time with a +00:00 suffix, so format in UTC.
export function formatWallTime(iso?: string) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(d)
}

export function formatDate(iso?: string) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d)
}

export function formatCoords(lat: number, lon: number) {
  const ns = lat >= 0 ? "N" : "S"
  const ew = lon >= 0 ? "E" : "W"
  return `${Math.abs(lat).toFixed(3)}° ${ns}, ${Math.abs(lon).toFixed(3)}° ${ew}`
}

export function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}
