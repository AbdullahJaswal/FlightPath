import type { RefObject } from "react"
import { useEffect, useRef } from "react"
import { altitudeColor } from "@/lib/altitude"
import type { Aircraft, Airport, TrailPoint } from "@/lib/api/schemas"
import { isEmergency } from "@/lib/filters"
import { livePosition } from "@/lib/flight-progress"
import { flightLevel, formatSpeed } from "@/lib/format"
import { getSettings, subscribeSettings } from "@/lib/map-settings"
import { type MapStore, worldWidth } from "./map-store"
import { planeBox, type Shape, shapeFor } from "./plane-icon"

export type HoverTarget = { x: number; y: number } & (
  | { kind: "aircraft"; aircraft: Aircraft }
  | { kind: "airport"; airport: Airport }
)

type Props = {
  containerRef: RefObject<HTMLDivElement | null>
  store: MapStore
  aircraft: Aircraft[]
  airports: Airport[]
  clockOffsetMs: number
  selectedId: string | null
  highlightPrefix: string | null
  trail: TrailPoint[] | null
  // false while another tool owns the pointer
  interactive: boolean
  onHover: (target: HoverTarget | null) => void
  onSelect: (target: HoverTarget | null) => void
  // screen positions of emergency squawks, animated with CSS instead of redraws
  onEmergencies: (points: Pulse[]) => void
}

export type Pulse = { id: string; x: number; y: number }

type Inputs = Omit<Props, "containerRef" | "store">

// screen positions of everything clickable, aircraft first then airports
type Hits = {
  x: Float32Array
  y: Float32Array
  idx: Int32Array
  n: number
  aircraft: number
}

export const hitRadius = 14
const labelZoom = 24
const detailZoom = 56
const airportZoom = 6
const airportLabelZoom = 12
const airportNameZoom = 40
const smallAirportNameZoom = 120
const spriteCell = 20
const rotationSteps = 72
const maxRows = 48

// dead reckoning moves icons a fraction of a pixel per second when zoomed out
function idleRedrawMs(k: number) {
  if (k < 8) return 1000
  if (k < 32) return 500
  return 250
}

export function PlanesLayer({ containerRef, store, ...rest }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hoveredRef = useRef<string | null>(null)
  const hitsRef = useRef<Hits>({
    x: new Float32Array(0),
    y: new Float32Array(0),
    idx: new Int32Array(0),
    n: 0,
    aircraft: 0,
  })
  const inputs = useRef<Inputs>(rest)
  inputs.current = rest
  const pulseRef = useRef("")
  const dirtyRef = useRef(true)

  // new props, such as a replay frame, must show before the idle redraw
  useEffect(() => {
    dirtyRef.current = true
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    let lastDraw = 0
    let raf = 0
    const invalidate = () => {
      dirtyRef.current = true
    }
    const unsubscribe = store.subscribe(() => {
      dirtyRef.current = true
      if (hoveredRef.current) {
        hoveredRef.current = null
        inputs.current.onHover(null)
      }
    })
    const unsubscribeSettings = subscribeSettings(invalidate)
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (!dirtyRef.current && now - lastDraw < idleRedrawMs(store.get().k)) {
        return
      }
      dirtyRef.current = false
      lastDraw = now
      const pulses = render(
        ctx,
        canvas,
        store,
        inputs.current,
        hoveredRef.current,
        hitsRef.current
      )
      const key = pulses.map((p) => `${p.id}:${p.x | 0}:${p.y | 0}`).join(" ")
      if (key !== pulseRef.current) {
        pulseRef.current = key
        inputs.current.onEmergencies(pulses)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      unsubscribe()
      unsubscribeSettings()
    }
  }, [store])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let raf = 0
    let pending: { x: number; y: number } | null = null

    const targetAt = (hit: number): HoverTarget | null => {
      if (hit < 0) return null
      const h = hitsRef.current
      const x = h.x[hit] ?? 0
      const y = h.y[hit] ?? 0
      const i = h.idx[hit] ?? -1
      if (hit < h.aircraft) {
        const aircraft = inputs.current.aircraft[i]
        return aircraft ? { kind: "aircraft", aircraft, x, y } : null
      }
      const airport = inputs.current.airports[i]
      return airport ? { kind: "airport", airport, x, y } : null
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !inputs.current.interactive) return
      const rect = el.getBoundingClientRect()
      pending = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (!pending) return
        const target = targetAt(hitTest(hitsRef.current, pending.x, pending.y))
        const id = targetId(target)
        el.style.cursor = id ? "pointer" : ""
        if (id === hoveredRef.current) return
        hoveredRef.current = id
        inputs.current.onHover(target)
      })
    }
    const onLeave = () => {
      el.style.cursor = ""
      if (!hoveredRef.current) return
      hoveredRef.current = null
      inputs.current.onHover(null)
    }
    const onClick = (e: MouseEvent) => {
      if (!inputs.current.interactive) return
      const rect = el.getBoundingClientRect()
      const target = targetAt(
        hitTest(hitsRef.current, e.clientX - rect.left, e.clientY - rect.top)
      )
      inputs.current.onSelect(target)
    }

    el.addEventListener("pointermove", onMove)
    el.addEventListener("pointerleave", onLeave)
    el.addEventListener("click", onClick)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener("pointermove", onMove)
      el.removeEventListener("pointerleave", onLeave)
      el.removeEventListener("click", onClick)
    }
  }, [containerRef])

  return (
    <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
  )
}

export function hitTest(h: Hits, x: number, y: number) {
  let best = -1
  let bestDist = hitRadius * hitRadius
  for (let i = 0; i < h.n; i++) {
    const dx = (h.x[i] ?? 0) - x
    const dy = (h.y[i] ?? 0) - y
    const d = dx * dx + dy * dy
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

function targetId(t: HoverTarget | null) {
  if (!t) return null
  return t.kind === "aircraft" ? t.aircraft.icao24 : `ap:${t.airport.icao}`
}

export type Palette = {
  primary: string
  fg: string
  bg: string
  card: string
  muted: string
  outline: string
  destructive: string
}

export function readPalette(el: Element): Palette {
  const style = getComputedStyle(el)
  const v = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback
  const fg = v("--foreground", "#000")
  const bg = v("--background", "#fff")
  const dark = document.documentElement.classList.contains("dark")
  return {
    primary: v("--primary", "#84cc16"),
    fg,
    bg,
    card: v("--card", bg),
    muted: v("--muted-foreground", "#888"),
    // the same near-black rim in both themes
    outline: dark ? bg : fg,
    destructive: v("--destructive", "#dc2626"),
  }
}

type Row = { sheet: HTMLCanvasElement; cell: number }

const rows = new Map<string, Row>()

// One pre-rendered icon per 5 degree heading for a shape, size and colour.
function spriteRow(
  shape: Shape,
  size: number,
  fill: string,
  outline: string,
  dpr: number
): Row | null {
  const key = `${shape.id}|${size}|${fill}|${outline}|${dpr}`
  const hit = rows.get(key)
  if (hit) return hit
  evictRows()
  const cell = Math.round(spriteCell * dpr)
  const sheet = document.createElement("canvas")
  sheet.width = cell * rotationSteps
  sheet.height = cell
  const ctx = sheet.getContext("2d")
  if (!ctx) return null
  const scale = size / planeBox
  for (let i = 0; i < rotationSteps; i++) {
    ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      (i + 0.5) * spriteCell * dpr,
      spriteCell * dpr * 0.5
    )
    ctx.rotate((i * (360 / rotationSteps) * Math.PI) / 180)
    ctx.scale(scale, scale)
    ctx.translate(-planeBox / 2, -planeBox / 2)
    ctx.lineJoin = "round"
    ctx.lineWidth = 2.5 / scale
    ctx.strokeStyle = outline
    ctx.stroke(shape.path)
    ctx.fillStyle = fill
    ctx.fill(shape.path)
  }
  const row = { sheet, cell }
  rows.set(key, row)
  return row
}

function evictRows() {
  if (rows.size < maxRows) return
  const oldest = rows.keys().next().value
  if (oldest !== undefined) rows.delete(oldest)
}

export function planeFill(a: Aircraft, palette: Palette, byAltitude: boolean) {
  if (a.onGround) return palette.muted
  return byAltitude ? altitudeColor(a.baroAltM) : palette.primary
}

// spin is the screen rotation of north at the position, non zero on the globe
type Placed = {
  a: Aircraft
  x: number
  y: number
  shape: Shape
  fill: string
  spin: number
}

function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  store: MapStore,
  inputs: Inputs,
  hoveredId: string | null,
  hits: Hits
): Pulse[] {
  const state = store.get()
  const { width, height, k } = state
  if (width === 0 || height === 0) return []
  const world = worldWidth(state)
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

  const palette = readPalette(canvas)
  const settings = getSettings()
  const byAltitude = settings.colorBy === "altitude"
  const { aircraft, airports, selectedId, highlightPrefix, clockOffsetMs } =
    inputs
  const total = aircraft.length + airports.length
  if (hits.x.length < total) {
    hits.x = new Float32Array(total)
    hits.y = new Float32Array(total)
    hits.idx = new Int32Array(total)
  }
  const wrap = (px: number) =>
    world > 0 ? px - Math.round((px - width / 2) / world) * world : px
  const time = Date.now() - clockOffsetMs
  const labels = new Labels()
  ctx.font = "500 12px 'Figtree Variable', sans-serif"
  ctx.textBaseline = "middle"

  let n = 0
  let selected: Placed | null = null
  let hovered: Placed | null = null
  const pulses: Pulse[] = []
  const placed: Placed[] = []
  for (let i = 0; i < aircraft.length; i++) {
    const a = aircraft[i]
    if (!a) continue
    const [lon, lat] = livePosition(a, time)
    const p = store.project(lon, lat)
    if (!p) continue
    const x = wrap(p[0])
    const y = p[1]
    if (x < -24 || y < -24 || x > width + 24 || y > height + 24) continue
    hits.x[n] = x
    hits.y[n] = y
    hits.idx[n] = i
    n++
    const item: Placed = {
      a,
      x,
      y,
      shape: shapeFor(a.category, settings.shapes),
      fill: planeFill(a, palette, byAltitude),
      spin: store.northAngle ? (store.northAngle(lon, lat) * 180) / Math.PI : 0,
    }
    if (a.icao24 === selectedId) selected = item
    else if (a.icao24 === hoveredId) hovered = item
    else placed.push(item)
  }
  hits.aircraft = n

  drawTrail(
    ctx,
    store,
    inputs.trail,
    selected,
    palette,
    byAltitude,
    wrap,
    world
  )

  if (k >= airportZoom) {
    n = drawAirports(ctx, store, airports, hits, n, k, palette, labels, wrap)
  }
  hits.n = n

  const showLabels = k >= labelZoom
  const showDetail = k >= detailZoom
  const half = spriteCell / 2
  for (const item of placed) {
    const { a, x, y } = item
    const dimmed =
      highlightPrefix !== null &&
      !(a.callsign ?? "").startsWith(highlightPrefix)
    if (isEmergency(a) && !dimmed) pulses.push({ id: a.icao24, x, y })
    const row = spriteRow(
      item.shape,
      a.onGround ? item.shape.size * 0.72 : item.shape.size,
      item.fill,
      palette.outline,
      dpr
    )
    if (!row) continue
    const heading = ((a.headingDeg ?? 0) + item.spin + 720) % 360
    const step = Math.round(heading / (360 / rotationSteps)) % rotationSteps
    if (dimmed) ctx.globalAlpha = 0.2
    ctx.drawImage(
      row.sheet,
      step * row.cell,
      0,
      row.cell,
      row.cell,
      x - half,
      y - half,
      spriteCell,
      spriteCell
    )
    if (dimmed) ctx.globalAlpha = 1
    if (showLabels && a.callsign && !dimmed) {
      labels.draw(ctx, a, x + 12, y, palette, showDetail)
    }
  }

  if (hovered) {
    drawPlane(ctx, hovered, 1.35, palette)
    drawLabel(ctx, hovered.a, hovered.x + 14, hovered.y, palette, true)
  }
  if (selected) {
    if (isEmergency(selected.a)) {
      pulses.push({ id: selected.a.icao24, x: selected.x, y: selected.y })
    }
    ctx.beginPath()
    ctx.arc(selected.x, selected.y, 16, 0, Math.PI * 2)
    ctx.strokeStyle = palette.primary
    ctx.lineWidth = 2
    ctx.stroke()
    drawPlane(ctx, selected, 1.5, palette)
    drawLabel(ctx, selected.a, selected.x + 20, selected.y, palette, true)
  }
  return pulses
}

function drawAirports(
  ctx: CanvasRenderingContext2D,
  store: MapStore,
  airports: Airport[],
  hits: Hits,
  start: number,
  k: number,
  palette: Palette,
  labels: Labels,
  wrap: (px: number) => number
) {
  const { width, height } = store.get()
  let n = start
  ctx.font = "600 11px 'Figtree Variable', sans-serif"
  for (let i = 0; i < airports.length; i++) {
    const ap = airports[i]
    if (!ap) continue
    const p = store.project(ap.lon, ap.lat)
    if (!p) continue
    const x = wrap(p[0])
    const y = p[1]
    if (x < -20 || y < -20 || x > width + 20 || y > height + 20) continue
    hits.x[n] = x
    hits.y[n] = y
    hits.idx[n] = i
    n++
    const large = ap.type === "large_airport"
    const small = ap.type === "small_airport"
    const r = large ? 5 : 3.5
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = palette.card
    ctx.fill()
    ctx.lineWidth = large ? 2 : 1.5
    ctx.strokeStyle = palette.fg
    ctx.stroke()
    if (large) {
      ctx.beginPath()
      ctx.arc(x, y, 1.6, 0, Math.PI * 2)
      ctx.fillStyle = palette.fg
      ctx.fill()
    }
    if (k >= airportLabelZoom && (large || k >= airportNameZoom)) {
      const code = ap.iata ?? ap.icao
      const named = small ? k >= smallAirportNameZoom : k >= airportNameZoom
      labels.text(
        ctx,
        named ? `${code} ${ap.name}` : code,
        x + r + 4,
        y,
        palette,
        true
      )
    }
  }
  ctx.font = "500 12px 'Figtree Variable', sans-serif"
  return n
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  store: MapStore,
  trail: TrailPoint[] | null,
  selected: Placed | null,
  palette: Palette,
  byAltitude: boolean,
  wrap: (px: number) => number,
  world: number
) {
  if (!trail || trail.length < 2) return
  const points: { x: number; y: number; color: string; t: number }[] = []
  for (const point of trail) {
    const p = store.project(point.lon, point.lat)
    if (!p) continue
    points.push({
      x: wrap(p[0]),
      y: p[1],
      color: byAltitude ? altitudeColor(point.baroAltM) : palette.primary,
      t: Date.parse(point.time),
    })
  }
  if (selected) {
    const last = points[points.length - 1]
    points.push({
      x: selected.x,
      y: selected.y,
      color: last?.color ?? palette.primary,
      t: Date.now(),
    })
  }
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last || points.length < 2) return
  const span = Math.max(1, last.t - first.t)
  ctx.lineWidth = 2.5
  ctx.lineJoin = "round"
  ctx.lineCap = "round"
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (!a || !b) continue
    // break the line where the trail crosses the seam
    if (world > 0 && Math.abs(b.x - a.x) > world / 2) continue
    ctx.globalAlpha = 0.3 + (0.6 * (b.t - first.t)) / span
    ctx.strokeStyle = b.color
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function drawPlane(
  ctx: CanvasRenderingContext2D,
  item: Placed,
  boost: number,
  palette: Palette
) {
  const { a, x, y, shape } = item
  const scale =
    ((a.onGround ? shape.size * 0.72 : shape.size) * boost) / planeBox
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((((a.headingDeg ?? 0) + item.spin) * Math.PI) / 180)
  ctx.scale(scale, scale)
  ctx.translate(-planeBox / 2, -planeBox / 2)
  ctx.lineWidth = 2.5 / scale
  ctx.lineJoin = "round"
  ctx.strokeStyle = palette.outline
  ctx.stroke(shape.path)
  ctx.fillStyle = item.fill
  ctx.fill(shape.path)
  ctx.restore()
}

// Greedy placement, labels that would overlap an earlier one are skipped.
class Labels {
  private boxes: [number, number, number, number][] = []

  private fits(x: number, top: number, w: number, h: number) {
    for (const [bx, by, bw, bh] of this.boxes) {
      if (x < bx + bw && x + w > bx && top < by + bh && top + h > by) {
        return false
      }
    }
    this.boxes.push([x, top, w, h])
    return true
  }

  draw(
    ctx: CanvasRenderingContext2D,
    a: Aircraft,
    x: number,
    y: number,
    palette: Palette,
    detail: boolean
  ) {
    const text = a.callsign ?? ""
    const w = ctx.measureText(text).width + 12
    const h = detail ? 28 : 14
    if (!this.fits(x, y - 7, w, h)) return
    drawLabel(ctx, a, x, y, palette, detail)
  }

  text(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    palette: Palette,
    muted: boolean
  ) {
    const w = ctx.measureText(text).width + 4
    if (!this.fits(x, y - 7, w, 14)) return
    strokeText(ctx, text, x, y, palette, muted)
  }
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  a: Aircraft,
  x: number,
  y: number,
  palette: Palette,
  detail: boolean
) {
  const text = a.callsign ?? a.icao24.toUpperCase()
  ctx.font = "500 12px 'Figtree Variable', sans-serif"
  strokeText(ctx, text, x, y, palette, false)
  const rate = a.vertRateMs ?? 0
  if (!a.onGround && Math.abs(rate) >= 1.5) {
    const tx = x + ctx.measureText(text).width + 4
    ctx.beginPath()
    if (rate > 0) {
      ctx.moveTo(tx, y + 3)
      ctx.lineTo(tx + 6, y + 3)
      ctx.lineTo(tx + 3, y - 3)
    } else {
      ctx.moveTo(tx, y - 3)
      ctx.lineTo(tx + 6, y - 3)
      ctx.lineTo(tx + 3, y + 3)
    }
    ctx.closePath()
    ctx.lineWidth = 3
    ctx.strokeStyle = palette.bg
    ctx.stroke()
    ctx.fillStyle = rate > 0 ? palette.primary : palette.muted
    ctx.fill()
  }
  if (detail) {
    const parts = [
      a.onGround ? "on ground" : flightLevel(a.baroAltM),
      a.velocityMs != null ? formatSpeed(a.velocityMs) : null,
    ].filter(Boolean)
    if (parts.length) {
      ctx.font = "500 10px 'Figtree Variable', sans-serif"
      strokeText(ctx, parts.join(" · "), x, y + 13, palette, true)
      ctx.font = "500 12px 'Figtree Variable', sans-serif"
    }
  }
}

function strokeText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  palette: Palette,
  muted: boolean
) {
  ctx.lineJoin = "round"
  ctx.lineWidth = 3.5
  ctx.strokeStyle = palette.bg
  ctx.strokeText(text, x, y)
  ctx.fillStyle = muted ? palette.muted : palette.fg
  ctx.fillText(text, x, y)
}
