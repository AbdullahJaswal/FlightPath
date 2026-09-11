import { type GeoProjection, geoCircle, geoGraticule10, geoPath } from "d3-geo"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { Aircraft, Airport, Route, TrailPoint } from "@/lib/api/schemas"
import { shade } from "@/lib/color"
import { wrapLon } from "@/lib/geo"
import type { Viewport } from "@/lib/live"
import { getSettings, subscribeSettings } from "@/lib/map-settings"
import { subsolarPoint } from "@/lib/sun"
import { loadWorld, type World } from "@/lib/world"
import { createGlobeStore } from "./globe-store"
import { baseMapUrl, type MapView } from "./live-map"
import { globeMaxZoom, globeMinZoom, type MapStore } from "./map-store"
import { OverlayLayer } from "./overlay-layer"
import type { HoverTarget } from "./planes-layer"
import { PlanesOverlay } from "./planes-overlay"

const margin = 28
// globe zoom to the label thresholds of the flat map
const kScale = 1.6
const dragThreshold = 3
const reportDelayMs = 150
const rad = Math.PI / 180

type Props = {
  // the parent learns the store once the chunk has loaded
  onStore: (store: MapStore) => void
  aircraft: Aircraft[]
  airports: Airport[]
  clockOffsetMs: number
  selectedId: string | null
  selectedPosition?: [number, number]
  route?: Route
  trail: TrailPoint[] | null
  highlightPrefix: string | null
  view: MapView
  onViewChange: (view: MapView) => void
  onBounds: (bounds: Viewport) => void
  onSelect: (target: HoverTarget | null) => void
}

type Pointer = { id: number; x: number; y: number }

export default function GlobeMap({
  onStore,
  aircraft,
  airports,
  clockOffsetMs,
  selectedId,
  selectedPosition,
  route,
  trail,
  highlightPrefix,
  view,
  onViewChange,
  onBounds,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const store = useMemo(() => createGlobeStore(), [])
  const [size, setSize] = useState({ width: 1280, height: 720 })
  const current = useRef<MapView>(view)
  const reported = useRef<MapView>(view)
  const pointers = useRef<Pointer[]>([])
  const pinch = useRef(0)
  const moved = useRef(0)
  const suppressClick = useRef(false)
  const reportTimer = useRef(0)

  useEffect(() => {
    onStore(store)
  }, [onStore, store])

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect && rect.width > 0 && rect.height > 0) {
        setSize({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const apply = useCallback(() => {
    const projection = store.get().projection
    if (!projection) return
    const { center, zoom } = current.current
    const radius = (Math.min(size.width, size.height) / 2 - margin) * zoom
    projection
      .rotate([-center[0], -center[1]])
      .scale(radius)
      .translate([size.width / 2, size.height / 2])
    store.set({
      width: size.width,
      height: size.height,
      x: -center[0],
      y: -center[1],
      k: zoom * kScale,
    })
    onBounds(bounds(store, size.width, size.height, center))
  }, [store, size, onBounds])

  // external view changes, own gestures are reported back and ignored here
  useEffect(() => {
    if (view !== reported.current) current.current = view
    apply()
  }, [view, apply])

  const report = useCallback(() => {
    clearTimeout(reportTimer.current)
    reportTimer.current = 0
    reported.current = { ...current.current }
    onViewChange(reported.current)
  }, [onViewChange])

  const rotateBy = (dx: number, dy: number) => {
    const { center, zoom } = current.current
    const radius = (Math.min(size.width, size.height) / 2 - margin) * zoom
    const step = 90 / radius
    // the surface follows the pointer, so the centre moves the other way
    current.current = {
      center: [
        wrapLon(center[0] - dx * step),
        Math.max(-89, Math.min(89, center[1] + dy * step)),
      ],
      zoom,
    }
    apply()
  }

  const zoomTo = (zoom: number) => {
    current.current = {
      ...current.current,
      zoom: Math.max(globeMinZoom, Math.min(globeMaxZoom, zoom)),
    }
    apply()
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current = [
      ...pointers.current.filter((p) => p.id !== e.pointerId),
      { id: e.pointerId, x: e.clientX, y: e.clientY },
    ]
    if (pointers.current.length === 2)
      pinch.current = distance(pointers.current)
    moved.current = 0
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const list = pointers.current
    const i = list.findIndex((p) => p.id === e.pointerId)
    if (i < 0) return
    const prev = list[i] as Pointer
    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y
    list[i] = { id: e.pointerId, x: e.clientX, y: e.clientY }
    moved.current += Math.abs(dx) + Math.abs(dy)
    if (list.length === 1) {
      rotateBy(dx, dy)
      return
    }
    const d = distance(list)
    if (pinch.current > 0) zoomTo(current.current.zoom * (d / pinch.current))
    pinch.current = d
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current = pointers.current.filter((p) => p.id !== e.pointerId)
    pinch.current =
      pointers.current.length === 2 ? distance(pointers.current) : 0
    if (moved.current > dragThreshold) suppressClick.current = true
    if (pointers.current.length === 0) report()
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    zoomTo(current.current.zoom * 2 ** (-e.deltaY / 400))
    clearTimeout(reportTimer.current)
    reportTimer.current = window.setTimeout(report, reportDelayMs)
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    // a drag must not count as a click on the plane underneath
    const onClick = (e: MouseEvent) => {
      if (!suppressClick.current) return
      suppressClick.current = false
      e.stopImmediatePropagation()
      e.preventDefault()
    }
    el.addEventListener("click", onClick, true)
    return () => el.removeEventListener("click", onClick, true)
  }, [])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 cursor-grab touch-none select-none overflow-hidden bg-background active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <GlobeBase store={store} route={route} position={selectedPosition} />
      <OverlayLayer store={store} aircraft={aircraft} />
      <PlanesOverlay
        containerRef={containerRef}
        store={store}
        aircraft={aircraft}
        airports={airports}
        clockOffsetMs={clockOffsetMs}
        selectedId={selectedId}
        highlightPrefix={highlightPrefix}
        trail={trail}
        interactive
        onSelect={onSelect}
        width={size.width}
        height={size.height}
      />
    </div>
  )
}

function distance(list: Pointer[]) {
  const [a, b] = list
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
}

// Visible box for the live stream, the whole world when the disc edge is in view.
function bounds(
  store: MapStore,
  width: number,
  height: number,
  center: [number, number]
): Viewport {
  const world: Viewport = { west: -180, east: 180, south: -90, north: 90 }
  const samples: [number, number][] = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
    [width / 2, 0],
    [width / 2, height],
    [0, height / 2],
    [width, height / 2],
  ]
  let minD = 0
  let maxD = 0
  let south = 90
  let north = -90
  for (const [x, y] of samples) {
    const p = store.unproject(x, y)
    if (!p) return world
    const d = wrapLon(p[0] - center[0])
    minD = Math.min(minD, d)
    maxD = Math.max(maxD, d)
    south = Math.min(south, p[1])
    north = Math.max(north, p[1])
  }
  return {
    west: wrapLon(center[0] + minD - 2),
    east: wrapLon(center[0] + maxD + 2),
    south: Math.max(-90, south - 2),
    north: Math.min(90, north + 2),
  }
}

const nightBands: [number, number][] = [
  [90, 0.16],
  [96, 0.1],
  [102, 0.08],
]

type BaseProps = {
  store: MapStore
  route?: Route
  position?: [number, number]
}

// Sphere, land, borders, night side, route and names, redrawn as the globe turns.
function GlobeBase({ store, route, position }: BaseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [world, setWorld] = useState<World | null>(null)
  const routeRef = useRef({ route, position })
  const scheduleRef = useRef<() => void>(() => {})

  useEffect(() => {
    let alive = true
    loadWorld(baseMapUrl).then((w) => {
      if (alive) setWorld(w)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    routeRef.current = { route, position }
    scheduleRef.current()
  }, [route, position])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    let raf = 0
    const graticule = geoGraticule10()

    const paint = () => {
      const state = store.get()
      const projection = state.projection as GeoProjection | null
      const { width, height } = state
      if (!projection || width === 0 || height === 0) return
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
      const style = getComputedStyle(canvas)
      const v = (name: string, fallback: string) =>
        style.getPropertyValue(name).trim() || fallback
      const dark = document.documentElement.classList.contains("dark")
      const sea = v("--map-sea", "#dbe7f0")
      const land = v("--map-land", "#f5f5f4")
      const coast = v("--map-coast", "#9cc0d6")
      const primary = v("--primary", "#84cc16")
      const fg = v("--foreground", "#000")
      const bg = v("--background", "#fff")
      const [cx, cy] = projection.translate()
      const radius = projection.scale()
      const path = geoPath(projection, ctx)
      const [rl, rp] = projection.rotate()
      const visible = (lon: number, lat: number) =>
        Math.sin(-rp * rad) * Math.sin(lat * rad) +
          Math.cos(-rp * rad) *
            Math.cos(lat * rad) *
            Math.cos((lon + rl) * rad) >
        0.001

      // atmosphere
      const glow = ctx.createRadialGradient(
        cx,
        cy,
        radius,
        cx,
        cy,
        radius * 1.08
      )
      glow.addColorStop(0, shade(primary, 0, 0.35))
      glow.addColorStop(1, shade(primary, 0, 0))
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, radius * 1.08, 0, Math.PI * 2)
      ctx.fill()

      const sphere = ctx.createRadialGradient(
        cx - radius * 0.35,
        cy - radius * 0.35,
        radius * 0.1,
        cx,
        cy,
        radius
      )
      sphere.addColorStop(0, shade(sea, dark ? 0.12 : 0.1))
      sphere.addColorStop(1, shade(sea, dark ? -0.35 : -0.18))
      ctx.beginPath()
      path({ type: "Sphere" })
      ctx.fillStyle = sphere
      ctx.fill()

      ctx.beginPath()
      path(graticule)
      ctx.strokeStyle = v("--border", "#ccc")
      ctx.globalAlpha = 0.5
      ctx.lineWidth = 0.5
      ctx.stroke()
      ctx.globalAlpha = 1

      if (world) {
        ctx.beginPath()
        for (const f of world.land) path(f)
        ctx.fillStyle = land
        ctx.fill()
        ctx.strokeStyle = coast
        ctx.lineWidth = 0.6
        ctx.lineJoin = "round"
        ctx.stroke()
        ctx.beginPath()
        path(world.borders)
        ctx.strokeStyle = dark
          ? "rgba(255,255,255,0.35)"
          : "rgba(39,39,42,0.35)"
        ctx.lineWidth = 0.7
        ctx.stroke()
      }

      if (getSettings().terminator) {
        const sun = subsolarPoint(new Date())
        const antipode: [number, number] = [wrapLon(sun[0] + 180), -sun[1]]
        for (const [angle, alpha] of nightBands) {
          ctx.beginPath()
          path(geoCircle().center(antipode).radius(angle)())
          ctx.fillStyle = dark
            ? `rgba(0, 0, 0, ${alpha * 1.6})`
            : `rgba(10, 14, 48, ${alpha})`
          ctx.fill()
        }
        if (visible(sun[0], sun[1])) {
          const p = projection(sun)
          if (p) drawSun(ctx, p[0], p[1])
        }
      }

      const { route: r, position: pos } = routeRef.current
      const from = r?.origin ? [r.origin.lon, r.origin.lat] : null
      const to = r?.destination ? [r.destination.lon, r.destination.lat] : null
      const legs: [number[], number[], boolean][] = []
      if (from && pos) legs.push([from, pos, false])
      if (pos && to) legs.push([pos, to, true])
      if (!pos && from && to) legs.push([from, to, true])
      for (const [a, b, dashed] of legs) {
        ctx.beginPath()
        path({ type: "LineString", coordinates: [a, b] })
        ctx.lineWidth = 2
        ctx.lineCap = "round"
        ctx.setLineDash(dashed ? [6, 6] : [])
        ctx.strokeStyle = primary
        ctx.globalAlpha = dashed ? 0.6 : 1
        ctx.stroke()
      }
      ctx.setLineDash([])
      ctx.globalAlpha = 1
      ctx.font = "500 11px 'Figtree Variable', sans-serif"
      ctx.textBaseline = "middle"
      for (const ap of [r?.origin, r?.destination]) {
        if (!ap || !visible(ap.lon, ap.lat)) continue
        const p = projection([ap.lon, ap.lat])
        if (!p) continue
        ctx.beginPath()
        ctx.arc(p[0], p[1], 5, 0, Math.PI * 2)
        ctx.fillStyle = primary
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = bg
        ctx.stroke()
        ctx.lineWidth = 3
        ctx.strokeStyle = bg
        ctx.strokeText(ap.iata ?? ap.icao, p[0] + 9, p[1])
        ctx.fillStyle = fg
        ctx.fillText(ap.iata ?? ap.icao, p[0] + 9, p[1])
      }

      if (world) drawLabels(ctx, world, projection, visible, dark)
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
    const unsubscribeSettings = subscribeSettings(schedule)
    const timer = window.setInterval(schedule, 60_000)
    const observer = new MutationObserver(schedule)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-scheme"],
    })
    schedule()
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(timer)
      unsubscribe()
      unsubscribeSettings()
      observer.disconnect()
      scheduleRef.current = () => {}
    }
  }, [store, world])

  return (
    <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
  )
}

function drawLabels(
  ctx: CanvasRenderingContext2D,
  world: World,
  projection: GeoProjection,
  visible: (lon: number, lat: number) => boolean,
  dark: boolean
) {
  const radius = projection.scale()
  ctx.font = "600 11px 'Figtree Variable', sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.lineJoin = "round"
  ctx.lineWidth = 3
  ctx.letterSpacing = "0.08em"
  const halo = dark ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.85)"
  const color = dark ? "rgba(255,255,255,0.92)" : "rgba(24,24,27,0.88)"
  const placed: [number, number, number, number][] = []
  for (const label of world.labels) {
    const [lon, lat] = label.centroid
    if (!visible(lon, lat)) continue
    const text = label.name.toUpperCase()
    const width = ctx.measureText(text).width + 6
    const height = 16
    // geoArea is in steradians, so screen area scales with the squared radius
    if (label.area * radius * radius < width * height * 1.4) continue
    const p = projection([lon, lat])
    if (!p) continue
    const bx = p[0] - width / 2
    const by = p[1] - height / 2
    if (
      placed.some(
        ([px, py, pw, ph]) =>
          bx < px + pw && bx + width > px && by < py + ph && by + height > py
      )
    ) {
      continue
    }
    placed.push([bx, by, width, height])
    ctx.strokeStyle = halo
    ctx.strokeText(text, p[0], p[1])
    ctx.fillStyle = color
    ctx.fillText(text, p[0], p[1])
  }
  ctx.letterSpacing = "0px"
  ctx.textAlign = "start"
}

function drawSun(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const glow = ctx.createRadialGradient(x, y, 2, x, y, 22)
  glow.addColorStop(0, "rgba(253, 224, 71, 0.55)")
  glow.addColorStop(1, "rgba(253, 224, 71, 0)")
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y, 22, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y, 4, 0, Math.PI * 2)
  ctx.fillStyle = "#fde047"
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = "rgba(180, 83, 9, 0.9)"
  ctx.stroke()
}
