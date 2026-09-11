import { metersToFeet } from "./format"

// Colour stops by altitude in feet, warm near the ground and cool at cruise.
const stops: [number, string][] = [
  [0, "#f5c518"],
  [5000, "#f97316"],
  [10000, "#ef4444"],
  [20000, "#d946ef"],
  [30000, "#7c3aed"],
  [40000, "#2563eb"],
  [50000, "#06b6d4"],
]

export const bandFeet = 2500
export const bandCount = 19

export function altitudeBand(m?: number) {
  if (m == null) return 0
  const ft = Math.max(0, metersToFeet(m))
  return Math.min(bandCount - 1, Math.floor(ft / bandFeet))
}

const bandColors: string[] = []

export function bandColor(band: number) {
  let c = bandColors[band]
  if (!c) {
    c = colorAtFeet((band + 0.5) * bandFeet)
    bandColors[band] = c
  }
  return c
}

export function altitudeColor(m?: number) {
  return bandColor(altitudeBand(m))
}

export function colorAtFeet(ft: number) {
  const first = stops[0]
  const last = stops[stops.length - 1]
  if (!first || !last) return "#888"
  if (ft <= first[0]) return first[1]
  if (ft >= last[0]) return last[1]
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]
    const b = stops[i]
    if (!a || !b || ft > b[0]) continue
    return mix(a[1], b[1], (ft - a[0]) / (b[0] - a[0]))
  }
  return last[1]
}

export const legendGradient = `linear-gradient(to right, ${stops
  .filter(([ft]) => ft <= 45000)
  .map(([ft, c]) => `${c} ${(ft / 45000) * 100}%`)
  .join(", ")})`

export const legendTicks = [0, 10000, 20000, 30000, 40000]
export const legendMaxFeet = 45000

function mix(a: string, b: string, t: number) {
  const [r1, g1, b1] = rgb(a)
  const [r2, g2, b2] = rgb(b)
  const ch = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, "0")
  return `#${ch(r1, r2)}${ch(g1, g2)}${ch(b1, b2)}`
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
