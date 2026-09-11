import { useCallback, useEffect, useRef } from "react"
import type { MapView } from "@/components/map/live-map"

const durationMs = 900

const ease = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
const mercY = (lat: number) =>
  Math.log(
    Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360)
  )
const invY = (y: number) => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90

// Animated camera move that zooms out over long hops and back in on arrival.
export function useFlyTo(view: MapView, setView: (view: MapView) => void) {
  const current = useRef(view)
  current.current = view
  const raf = useRef(0)

  const cancel = useCallback(() => {
    cancelAnimationFrame(raf.current)
    raf.current = 0
  }, [])

  useEffect(() => cancel, [cancel])

  const flyTo = useCallback(
    (target: MapView) => {
      cancel()
      const from = current.current
      const [lon0, lat0] = from.center
      const [lon1, lat1] = target.center
      let dLon = lon1 - lon0
      if (dLon > 180) dLon -= 360
      if (dLon < -180) dLon += 360
      const y0 = mercY(lat0)
      const y1 = mercY(lat1)
      const logK0 = Math.log(from.zoom)
      const logK1 = Math.log(target.zoom)
      const side = Math.max(window.innerWidth, window.innerHeight)
      // screen distance at the starting zoom decides how far to pull back
      const px = Math.hypot(
        (dLon / 360) * side * from.zoom,
        ((y1 - y0) / (2 * Math.PI)) * side * from.zoom
      )
      const dip = Math.min(1.4, px / (2 * side))
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs)
        const e = ease(t)
        const lon = lon0 + dLon * e
        const lat = invY(y0 + (y1 - y0) * e)
        const zoom = Math.exp(
          logK0 + (logK1 - logK0) * e - dip * Math.sin(Math.PI * e)
        )
        setView({ center: [lon, lat], zoom })
        if (t < 1) raf.current = requestAnimationFrame(step)
        else raf.current = 0
      }
      raf.current = requestAnimationFrame(step)
    },
    [cancel, setView]
  )

  return { flyTo, cancel }
}
