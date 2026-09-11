import { IconRulerMeasure } from "@tabler/icons-react"
import { useEffect, useRef, useState } from "react"
import { formatDistance, formatDuration, formatInt } from "@/lib/format"
import {
  compassPoint,
  greatCircle,
  haversineKm,
  initialBearing,
} from "@/lib/geo"
import { type MapStore, worldWidth } from "./map-store"

type Props = { store: MapStore; active: boolean }

type Point = [number, number]

const cruiseKmh = 900

// Two-click great-circle ruler drawn above the map.
export function MeasureLayer({ store, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [points, setPoints] = useState<Point[]>([])
  const [cursor, setCursor] = useState<Point | null>(null)
  const [label, setLabel] = useState<{
    x: number
    y: number
    text: string
  } | null>(null)
  const pointsRef = useRef(points)
  const cursorRef = useRef(cursor)
  const scheduleRef = useRef<() => void>(() => {})

  useEffect(() => {
    pointsRef.current = points
    cursorRef.current = cursor
    scheduleRef.current()
  }, [points, cursor])

  useEffect(() => {
    if (!active) {
      setPoints([])
      setCursor(null)
      setLabel(null)
    }
  }, [active])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    let raf = 0
    const paint = () => {
      const state = store.get()
      const { width, height } = state
      if (width === 0 || height === 0) return
      const dpr = window.devicePixelRatio || 1
      const w = Math.round(width * dpr)
      const h = Math.round(height * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      const a = pointsRef.current[0]
      const b = pointsRef.current[1] ?? cursorRef.current
      if (!a) {
        setLabel(null)
        return
      }
      const style = getComputedStyle(canvas)
      const primary = style.getPropertyValue("--primary").trim() || "#84cc16"
      const bg = style.getPropertyValue("--background").trim() || "#fff"
      const world = worldWidth(state)
      const wrap = (px: number) =>
        world > 0 ? px - Math.round((px - width / 2) / world) * world : px
      const dot = (p: Point) => {
        const s = store.project(p[0], p[1])
        if (!s) return
        ctx.beginPath()
        ctx.arc(wrap(s[0]), s[1], 5, 0, Math.PI * 2)
        ctx.fillStyle = primary
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = bg
        ctx.stroke()
      }
      if (b) {
        const arc = greatCircle(a, b, 96)
        ctx.beginPath()
        let last: number | null = null
        for (const [lon, lat] of arc) {
          const s = store.project(lon, lat)
          if (!s) continue
          const x = wrap(s[0])
          if (last !== null && Math.abs(x - last) < world / 2)
            ctx.lineTo(x, s[1])
          else ctx.moveTo(x, s[1])
          last = x
        }
        ctx.lineWidth = 3
        ctx.lineJoin = "round"
        ctx.strokeStyle = bg
        ctx.stroke()
        ctx.lineWidth = 1.5
        ctx.setLineDash([6, 5])
        ctx.strokeStyle = primary
        ctx.stroke()
        ctx.setLineDash([])
        const km = haversineKm(a[1], a[0], b[1], b[0])
        const bearing = initialBearing(a[1], a[0], b[1], b[0])
        const mid = arc[Math.floor(arc.length / 2)]
        const m = mid ? store.project(mid[0], mid[1]) : null
        setLabel({
          x: m ? wrap(m[0]) : width / 2,
          y: m ? m[1] : height / 2,
          text: `${formatDistance(km)} · ${formatInt(bearing)}° ${compassPoint(bearing)} · ${formatDuration((km / cruiseKmh) * 3600)} at ${cruiseKmh} km/h`,
        })
      }
      dot(a)
      if (pointsRef.current[1]) dot(pointsRef.current[1])
    }
    const schedule = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        paint()
      })
    }
    scheduleRef.current = schedule
    const unsubscribe = store.subscribe(schedule)
    schedule()
    return () => {
      cancelAnimationFrame(raf)
      unsubscribe()
      scheduleRef.current = () => {}
    }
  }, [store])

  const lonLat = (e: React.PointerEvent | React.MouseEvent): Point | null => {
    const rect = e.currentTarget.getBoundingClientRect()
    const p = store.unproject(e.clientX - rect.left, e.clientY - rect.top)
    return p ? [p[0], p[1]] : null
  }

  if (!active) return null

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        onPointerMove={(e) => {
          if (points.length !== 1) return
          setCursor(lonLat(e))
        }}
        onClick={(e) => {
          e.stopPropagation()
          const p = lonLat(e)
          if (!p) return
          setPoints((prev) => (prev.length === 1 ? [prev[0] as Point, p] : [p]))
          setCursor(null)
        }}
      />
      {points.length === 0 && (
        <div className="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 animate-fade-up items-center gap-2 rounded-full bg-card/90 px-3 py-1.5 text-xs shadow-sm ring-1 ring-foreground/10 backdrop-blur">
          <IconRulerMeasure className="size-3.5 text-primary" />
          Click two points to measure, Esc to leave
        </div>
      )}
      {label && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-md bg-popover/95 px-2 py-1 font-medium text-popover-foreground text-xs shadow-md ring-1 ring-foreground/10"
          style={{ left: label.x, top: label.y }}
        >
          {label.text}
        </div>
      )}
    </>
  )
}
