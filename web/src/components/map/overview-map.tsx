import { useEffect, useRef } from "react"
import { Hint } from "@/components/hint"
import { getSettings, subscribeSettings, useSettings } from "@/lib/map-settings"
import { type MapStore, worldWidth } from "./map-store"
import { visibleBounds } from "./map-sync"

const width = 176
const height = 96

type Props = { store: MapStore; onJump: (center: [number, number]) => void }

// Whole-world inset with the current viewport outlined, click to jump.
export function OverviewMap({ store, onJump }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const settings = useSettings()

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    let raf = 0
    const paint = () => {
      const state = store.get()
      if (!state.projection || state.width === 0 || !getSettings().overview) {
        return
      }
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== width * dpr) {
        canvas.width = width * dpr
        canvas.height = height * dpr
      }
      const style = getComputedStyle(canvas)
      const v = (name: string) => style.getPropertyValue(name).trim()
      const base = Math.max(state.width, state.height)
      const f = width / base
      const tx = width / 2 - (state.width / 2) * f
      const ty = height / 2 - (state.height / 2) * f
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = v("--map-sea") || "#dbe7f0"
      ctx.fillRect(0, 0, width, height)
      ctx.setTransform(dpr * f, 0, 0, dpr * f, dpr * tx, dpr * ty)
      ctx.fillStyle = v("--map-land") || "#f5f5f4"
      for (const path of state.land) ctx.fill(path)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const b = visibleBounds(store)
      const world = worldWidth(state)
      if (!b || world <= 0) return
      const proj = state.projection
      const toInset = (lon: number, lat: number) => {
        const p = proj([lon, lat])
        return p ? [p[0] * f + tx, p[1] * f + ty] : null
      }
      const top = toInset(0, Math.min(85, b.north))
      const bottom = toInset(0, Math.max(-85, b.south))
      if (!top || !bottom) return
      const spans =
        b.west <= b.east
          ? [[b.west, b.east]]
          : [
              [b.west, 180],
              [-180, b.east],
            ]
      ctx.strokeStyle = v("--primary") || "#84cc16"
      ctx.lineWidth = 1.5
      ctx.fillStyle = "rgba(127, 127, 127, 0.18)"
      for (const [west, east] of spans) {
        const l = toInset(west ?? -180, 0)
        const r = toInset(east ?? 180, 0)
        if (!l || !r) continue
        const x = Math.min(l[0], r[0])
        const w = Math.max(2, Math.abs(r[0] - l[0]))
        ctx.fillRect(x, top[1], w, bottom[1] - top[1])
        ctx.strokeRect(x, top[1], w, bottom[1] - top[1])
      }
    }
    const schedule = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        paint()
      })
    }
    const unsubscribe = store.subscribe(schedule)
    const unsubscribeSettings = subscribeSettings(schedule)
    const observer = new MutationObserver(schedule)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-scheme"],
    })
    schedule()
    return () => {
      cancelAnimationFrame(raf)
      unsubscribe()
      unsubscribeSettings()
      observer.disconnect()
    }
  }, [store])

  if (!settings.overview) return null

  const jump = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const state = store.get()
    const inv = state.projection?.invert
    if (!inv) return
    const rect = e.currentTarget.getBoundingClientRect()
    const base = Math.max(state.width, state.height)
    const f = width / base
    const bx = (e.clientX - rect.left - width / 2) / f + state.width / 2
    const by = (e.clientY - rect.top - height / 2) / f + state.height / 2
    const p = inv([bx, by])
    if (p) onJump([p[0], p[1]])
  }

  return (
    <Hint label="Overview, click to jump there" side="left">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="pointer-events-auto hidden cursor-pointer rounded-lg shadow-sm ring-1 ring-foreground/10 sm:block"
        style={{ width, height }}
        onClick={jump}
        aria-label="Overview map"
      />
    </Hint>
  )
}
