import { geoOrthographic } from "d3-geo"
import { initialMapState, type MapStore } from "./map-store"

const rad = Math.PI / 180

// Orthographic projection with the MapStore contract, so the plane layers work unchanged.
export function createGlobeStore(): MapStore {
  const projection = geoOrthographic().clipAngle(90)
  let state = { ...initialMapState, projection, wrap: false }
  const listeners = new Set<() => void>()

  const visible = (lon: number, lat: number) => {
    const [rl, rp] = projection.rotate()
    const lon0 = -rl
    const lat0 = -rp
    const c =
      Math.sin(lat0 * rad) * Math.sin(lat * rad) +
      Math.cos(lat0 * rad) * Math.cos(lat * rad) * Math.cos((lon - lon0) * rad)
    return c > 0.001
  }

  const project = (lon: number, lat: number): [number, number] | null => {
    if (!visible(lon, lat)) return null
    const p = projection([lon, lat])
    return p ? [p[0], p[1]] : null
  }

  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch, projection, wrap: false }
      for (const l of listeners) l()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    project,
    unproject(px, py) {
      const p = projection.invert?.([px, py])
      if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null
      return visible(p[0], p[1]) ? [p[0], p[1]] : null
    },
    northAngle(lon, lat) {
      const a = projection([lon, lat])
      const b = projection([lon, Math.min(89.9, lat + 0.05)])
      if (!a || !b) return 0
      return Math.atan2(b[0] - a[0], a[1] - b[1])
    },
  }
}
