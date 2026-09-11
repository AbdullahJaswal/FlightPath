import { useEffect } from "react"
import { useMapContext, useZoomPanContext } from "react-simple-maps"
import type { Viewport } from "@/lib/live"
import type { MapStore } from "./map-store"

type Props = {
  store: MapStore
  onBounds: (bounds: Viewport) => void
}

// Mirrors the projection and zoom transform into the store for the canvas layer.
export function MapSync({ store, onBounds }: Props) {
  const { width, height, projection } = useMapContext()
  const { x, y, k } = useZoomPanContext()

  useEffect(() => {
    store.set({ width, height, projection, x, y, k })
    const bounds = visibleBounds(store)
    if (bounds) onBounds(bounds)
  }, [store, onBounds, width, height, projection, x, y, k])

  return null
}

const maxLat = 85

export function visibleBounds(store: MapStore): Viewport | null {
  const { width, height, projection, k } = store.get()
  if (!projection) return null
  const left = store.unproject(0, height / 2)
  const right = store.unproject(width, height / 2)
  const top = store.unproject(width / 2, 0)
  const bottom = store.unproject(width / 2, height)
  if (!left || !right || !top || !bottom) return null
  // d3 wraps inverted longitudes, so compare pixel widths instead
  const worldPx = 2 * Math.PI * projection.scale() * k
  const wholeWorld = width >= worldPx - 0.5
  return {
    west: wholeWorld ? -180 : left[0],
    east: wholeWorld ? 180 : right[0],
    south: clamp(bottom[1]),
    north: clamp(top[1]),
  }
}

function clamp(lat: number) {
  if (!Number.isFinite(lat)) return lat > 0 ? maxLat : -maxLat
  return Math.max(-maxLat, Math.min(maxLat, lat))
}
