import type { RefObject } from "react"
import { useEffect, useMemo, useRef } from "react"
import type { Aircraft, TrailPoint } from "@/lib/api/schemas"
import { livePosition } from "@/lib/flight-progress"
import { type MapStore, worldWidth } from "./map-store"
import { planeBox, planePath } from "./plane-icon"

export type HoverTarget = { aircraft: Aircraft; x: number; y: number }

type Props = {
  containerRef: RefObject<HTMLDivElement | null>
  store: MapStore
  aircraft: Aircraft[]
  clockOffsetMs: number
  selectedId: string | null
  highlightPrefix: string | null
  trail: TrailPoint[] | null
  onHover: (target: HoverTarget | null) => void
  onSelect: (aircraft: Aircraft | null) => void
}

type Item = { a: Aircraft }

type Inputs = Omit<Props, "containerRef" | "store" | "aircraft"> & {
  items: Item[]
}

type Hits = { x: Float32Array; y: Float32Array; idx: Int32Array; n: number }

const hitRadius = 14
const idleRedrawMs = 250
const labelZoom = 24
const airSize = 14
const groundSize = 10
const spriteCell = 20
const rotationSteps = 72

export function PlanesLayer({ containerRef, store, aircraft, ...rest }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hoveredRef = useRef<string | null>(null)
  const hitsRef = useRef<Hits>({
    x: new Float32Array(0),
    y: new Float32Array(0),
    idx: new Int32Array(0),
    n: 0,
  })
  const items = useMemo<Item[]>(() => aircraft.map((a) => ({ a })), [aircraft])
  const inputs = useRef<Inputs>({ ...rest, items })
  inputs.current = { ...rest, items }

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    let dirty = true
    let lastDraw = 0
    let raf = 0
    const unsubscribe = store.subscribe(() => {
      dirty = true
      if (hoveredRef.current) {
        hoveredRef.current = null
        inputs.current.onHover(null)
      }
    })
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (!dirty && now - lastDraw < idleRedrawMs) return
      dirty = false
      lastDraw = now
      render(
        ctx,
        canvas,
        store,
        inputs.current,
        hoveredRef.current,
        hitsRef.current
      )
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      unsubscribe()
    }
  }, [store])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let raf = 0
    let pending: { x: number; y: number } | null = null

    const hitTest = (x: number, y: number) => {
      const h = hitsRef.current
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

    const targetAt = (hit: number): HoverTarget | null => {
      if (hit < 0) return null
      const h = hitsRef.current
      const item = inputs.current.items[h.idx[hit] ?? -1]
      if (!item) return null
      return { aircraft: item.a, x: h.x[hit] ?? 0, y: h.y[hit] ?? 0 }
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      const rect = el.getBoundingClientRect()
      pending = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (!pending) return
        const target = targetAt(hitTest(pending.x, pending.y))
        const id = target?.aircraft.icao24 ?? null
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
      const rect = el.getBoundingClientRect()
      const target = targetAt(
        hitTest(e.clientX - rect.left, e.clientY - rect.top)
      )
      inputs.current.onSelect(target?.aircraft ?? null)
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

type Palette = {
  primary: string
  fg: string
  bg: string
  muted: string
  outline: string
}

type Sprites = { key: string; sheet: HTMLCanvasElement; cell: number }

let sprites: Sprites | null = null

// One pre-rendered icon per 5 degree heading, airborne on row 0 and on ground on row 1.
function spriteSheet(palette: Palette, dpr: number): Sprites | null {
  const key = `${palette.primary}|${palette.muted}|${palette.outline}|${dpr}`
  if (sprites?.key === key) return sprites
  const cell = Math.round(spriteCell * dpr)
  const sheet = document.createElement("canvas")
  sheet.width = cell * rotationSteps
  sheet.height = cell * 2
  const ctx = sheet.getContext("2d")
  if (!ctx) return null
  const icon = planePath()
  const rows: [number, string][] = [
    [airSize, palette.primary],
    [groundSize, palette.muted],
  ]
  rows.forEach(([size, fill], row) => {
    const scale = size / planeBox
    for (let i = 0; i < rotationSteps; i++) {
      ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        (i + 0.5) * spriteCell * dpr,
        (row + 0.5) * spriteCell * dpr
      )
      ctx.rotate((i * (360 / rotationSteps) * Math.PI) / 180)
      ctx.scale(scale, scale)
      ctx.translate(-planeBox / 2, -planeBox / 2)
      ctx.lineJoin = "round"
      ctx.lineWidth = 2.5 / scale
      ctx.strokeStyle = palette.outline
      ctx.stroke(icon)
      ctx.fillStyle = fill
      ctx.fill(icon)
    }
  })
  sprites = { key, sheet, cell }
  return sprites
}

function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  store: MapStore,
  inputs: Inputs,
  hoveredId: string | null,
  hits: Hits
) {
  const state = store.get()
  const { width, height, k } = state
  if (width === 0 || height === 0) return
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

  const style = getComputedStyle(canvas)
  const fg = style.getPropertyValue("--foreground").trim() || "#000"
  const bg = style.getPropertyValue("--background").trim() || "#fff"
  const dark = document.documentElement.classList.contains("dark")
  const palette: Palette = {
    primary: style.getPropertyValue("--primary").trim() || "#84cc16",
    fg,
    bg,
    muted: style.getPropertyValue("--muted-foreground").trim() || "#888",
    // the same near-black rim in both themes
    outline: dark ? bg : fg,
  }

  drawTrail(ctx, store, inputs.trail, palette, world)

  const { items, selectedId, highlightPrefix, clockOffsetMs } = inputs
  if (hits.x.length < items.length) {
    hits.x = new Float32Array(items.length)
    hits.y = new Float32Array(items.length)
    hits.idx = new Int32Array(items.length)
  }
  const icon = planePath()
  const sheet = spriteSheet(palette, dpr)
  if (!sheet) return
  const now = Date.now() - clockOffsetMs
  const showLabels = k >= labelZoom
  const half = spriteCell / 2
  ctx.font = "500 12px 'Figtree Variable', sans-serif"
  ctx.textBaseline = "middle"
  const labels = new Labels()

  let n = 0
  let selected: { a: Aircraft; x: number; y: number } | null = null
  let hovered: { a: Aircraft; x: number; y: number } | null = null

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item) continue
    const { a } = item
    const [lon, lat] = livePosition(a, now)
    const p = store.project(lon, lat)
    if (!p) continue
    const x =
      world > 0 ? p[0] - Math.round((p[0] - width / 2) / world) * world : p[0]
    const y = p[1]
    if (x < -24 || y < -24 || x > width + 24 || y > height + 24) continue
    hits.x[n] = x
    hits.y[n] = y
    hits.idx[n] = i
    n++
    if (a.icao24 === selectedId) {
      selected = { a, x, y }
      continue
    }
    if (a.icao24 === hoveredId) {
      hovered = { a, x, y }
      continue
    }
    const dimmed =
      highlightPrefix !== null &&
      !(a.callsign ?? "").startsWith(highlightPrefix)
    const heading = (((a.headingDeg ?? 0) % 360) + 360) % 360
    const step = Math.round(heading / (360 / rotationSteps)) % rotationSteps
    if (dimmed) ctx.globalAlpha = 0.2
    ctx.drawImage(
      sheet.sheet,
      step * sheet.cell,
      a.onGround ? sheet.cell : 0,
      sheet.cell,
      sheet.cell,
      x - half,
      y - half,
      spriteCell,
      spriteCell
    )
    if (dimmed) ctx.globalAlpha = 1
    if (showLabels && a.callsign && !dimmed) {
      labels.draw(ctx, a.callsign, x + 12, y, palette)
    }
  }
  hits.n = n

  if (hovered) {
    drawPlane(ctx, icon, hovered.x, hovered.y, hovered.a, 18, palette, 1)
    if (hovered.a.callsign)
      drawLabel(ctx, hovered.a.callsign, hovered.x + 14, hovered.y, palette)
  }
  if (selected) {
    ctx.beginPath()
    ctx.arc(selected.x, selected.y, 16, 0, Math.PI * 2)
    ctx.strokeStyle = palette.primary
    ctx.lineWidth = 2
    ctx.stroke()
    drawPlane(ctx, icon, selected.x, selected.y, selected.a, 20, palette, 1)
    if (selected.a.callsign)
      drawLabel(ctx, selected.a.callsign, selected.x + 20, selected.y, palette)
  }
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  store: MapStore,
  trail: TrailPoint[] | null,
  palette: Palette,
  world: number
) {
  if (!trail || trail.length < 2) return
  const { width } = store.get()
  ctx.beginPath()
  let started = false
  let lastX = 0
  for (const point of trail) {
    const p = store.project(point.lon, point.lat)
    if (!p) continue
    const x =
      world > 0 ? p[0] - Math.round((p[0] - width / 2) / world) * world : p[0]
    // break the line where the trail crosses the seam
    if (started && Math.abs(x - lastX) < world / 2) ctx.lineTo(x, p[1])
    else ctx.moveTo(x, p[1])
    lastX = x
    started = true
  }
  ctx.strokeStyle = palette.primary
  ctx.globalAlpha = 0.7
  ctx.lineWidth = 2
  ctx.lineJoin = "round"
  ctx.stroke()
  ctx.globalAlpha = 1
}

function drawPlane(
  ctx: CanvasRenderingContext2D,
  icon: Path2D,
  x: number,
  y: number,
  a: Aircraft,
  size: number,
  palette: Palette,
  alpha: number
) {
  const scale = size / planeBox
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.rotate(((a.headingDeg ?? 0) * Math.PI) / 180)
  ctx.scale(scale, scale)
  ctx.translate(-planeBox / 2, -planeBox / 2)
  ctx.lineWidth = 2.5 / scale
  ctx.lineJoin = "round"
  ctx.strokeStyle = palette.outline
  ctx.stroke(icon)
  ctx.fillStyle = a.onGround ? palette.muted : palette.primary
  ctx.fill(icon)
  ctx.restore()
}

// Greedy placement, labels that would overlap an earlier one are skipped.
class Labels {
  private boxes: [number, number, number, number][] = []

  draw(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    palette: Palette
  ) {
    const w = ctx.measureText(text).width + 4
    const h = 14
    const top = y - h / 2
    for (const [bx, by, bw, bh] of this.boxes) {
      if (x < bx + bw && x + w > bx && top < by + bh && top + h > by) return
    }
    this.boxes.push([x, top, w, h])
    drawLabel(ctx, text, x, y, palette)
  }
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  palette: Palette
) {
  ctx.lineWidth = 3.5
  ctx.strokeStyle = palette.bg
  ctx.strokeText(text, x, y)
  ctx.fillStyle = palette.fg
  ctx.fillText(text, x, y)
}
