import type { MapContextType } from "react-simple-maps"

type Projection = MapContextType["projection"]

export type MapState = {
  width: number
  height: number
  projection: Projection | null
  x: number
  y: number
  k: number
  land: Path2D[]
  grid: Path2D | null
  borders: Path2D | null
  labels: MapLabel[]
}

// country name anchored at the projected centroid, area in projected units
export type MapLabel = { text: string; x: number; y: number; area: number }

export function createMapStore() {
  let state: MapState = {
    width: 0,
    height: 0,
    projection: null,
    x: 0,
    y: 0,
    k: 1,
    land: [],
    grid: null,
    borders: null,
    labels: [],
  }
  const listeners = new Set<() => void>()

  return {
    get: () => state,
    set(patch: Partial<MapState>) {
      let changed = false
      for (const key of Object.keys(patch) as (keyof MapState)[]) {
        if (patch[key] !== state[key]) changed = true
      }
      if (!changed) return
      state = { ...state, ...patch }
      for (const l of listeners) l()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    // screen coordinates of a lon/lat under the current zoom transform
    project(lon: number, lat: number): [number, number] | null {
      const p = state.projection?.([lon, lat])
      if (!p) return null
      return [p[0] * state.k + state.x, p[1] * state.k + state.y]
    },
    unproject(px: number, py: number): [number, number] | null {
      const inv = state.projection?.invert
      if (!inv) return null
      const p = inv([(px - state.x) / state.k, (py - state.y) / state.k])
      return p ? [p[0], p[1]] : null
    },
  }
}

export type MapStore = ReturnType<typeof createMapStore>

// width of one copy of the world in screen pixels at the current zoom
export function worldWidth(state: MapState) {
  return 2 * Math.PI * (state.projection?.scale() ?? 0) * state.k
}

// screen x of the primary copy's western edge
export function worldLeft(state: MapState) {
  const p = state.projection?.([-180, 0])
  return (p ? p[0] : 0) * state.k + state.x
}

// screen y of the web mercator tile origin
export function worldTop(state: MapState) {
  const p = state.projection?.([0, 85.05112878])
  return (p ? p[1] : 0) * state.k + state.y
}
