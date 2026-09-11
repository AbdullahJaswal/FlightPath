import { useEffect, useRef } from "react"
import type { Aircraft } from "@/lib/api/schemas"
import { rgba } from "@/lib/color"
import { getSettings, subscribeSettings } from "@/lib/map-settings"
import { nightPolygon, subsolarPoint } from "@/lib/sun"
import {
  type MapState,
  type MapStore,
  worldLeft,
  worldWidth,
} from "./map-store"

type Cache = {
  canvas: HTMLCanvasElement
  k: number
  x: number
  y: number
  width: number
  height: number
  dpr: number
  key: string
}

// the glow is soft, so it is drawn at one pixel per css pixel and scaled up
type HeatCache = { canvas: HTMLCanvasElement; key: string }

type Props = { store: MapStore; aircraft: Aircraft[] }

// extra area rendered around the viewport so pans only blit
const margin = 0.25
const settleMs = 120
const sunRefreshMs = 60_000
const heatRadius = 26
// sun altitude thresholds and how much darker each band gets
const nightBands: [number, number][] = [
  [0, 0.16],
  [-6, 0.1],
  [-12, 0.08],
]

// Night side and density glow in one bitmap, redrawn when something changes and
// only blitted while the map moves.
export function OverlayLayer({ store, aircraft }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const aircraftRef = useRef(aircraft)
  const invalidateRef = useRef<() => void>(() => {})

  useEffect(() => {
    aircraftRef.current = aircraft
    if (getSettings().heatmap) invalidateRef.current()
  }, [aircraft])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    let cache: Cache | null = null
    let heat: HeatCache | null = null
    let heatVersion = 0
    let raf = 0
    let settle = 0
    let version = 0
    let blob: { canvas: HTMLCanvasElement; color: string } | null = null

    const invalidate = () => {
      version++
      schedule()
    }
    invalidateRef.current = () => {
      heatVersion++
      invalidate()
    }

    const isDark = () => document.documentElement.classList.contains("dark")

    // what the bitmap depends on besides the view
    const cacheKey = () => {
      const s = getSettings()
      return [
        version,
        s.terminator,
        s.heatmap,
        isDark(),
        getComputedStyle(canvas).getPropertyValue("--primary").trim(),
        Math.floor(Date.now() / sunRefreshMs),
      ].join("|")
    }

    // the glow only follows the view and the aircraft, not the radar frames
    const heatKey = (state: MapState) =>
      [
        heatVersion,
        state.x,
        state.y,
        state.k,
        state.width,
        state.height,
        getComputedStyle(canvas).getPropertyValue("--primary").trim(),
      ].join("|")

    const copies = (state: MapState) => {
      const world = worldWidth(state)
      if (world <= 0) return { world, from: 0, to: 0 }
      const left = worldLeft(state)
      return {
        world,
        from: Math.floor((-margin * state.width - left) / world),
        to: Math.floor(((1 + margin) * state.width - left) / world),
      }
    }

    const drawNight = (c: CanvasRenderingContext2D, state: MapState) => {
      const { world, from, to } = copies(state)
      const dark = isDark()
      const sun = subsolarPoint(new Date())
      for (const [altitude, alpha] of nightBands) {
        const path = new Path2D()
        const poly = nightPolygon(altitude, sun)
        for (let copy = from; copy <= to; copy++) {
          let first = true
          for (const [lon, lat] of poly) {
            const p = store.project(lon, lat)
            if (!p) continue
            const px = p[0] + copy * world
            if (first) path.moveTo(px, p[1])
            else path.lineTo(px, p[1])
            first = false
          }
          path.closePath()
        }
        c.fillStyle = dark
          ? `rgba(0, 0, 0, ${alpha * 1.6})`
          : `rgba(10, 14, 48, ${alpha})`
        c.fill(path)
      }
      const p = store.project(sun[0], sun[1])
      if (!p) return
      for (let copy = from; copy <= to; copy++) {
        drawSun(c, p[0] + copy * world, p[1])
      }
    }

    const blobFor = (color: string) => {
      if (blob?.color === color) return blob.canvas
      const b = document.createElement("canvas")
      b.width = heatRadius * 2
      b.height = heatRadius * 2
      const bc = b.getContext("2d")
      if (bc) {
        const g = bc.createRadialGradient(
          heatRadius,
          heatRadius,
          0,
          heatRadius,
          heatRadius,
          heatRadius
        )
        g.addColorStop(0, rgba(color, 0.34))
        g.addColorStop(1, rgba(color, 0))
        bc.fillStyle = g
        bc.fillRect(0, 0, heatRadius * 2, heatRadius * 2)
      }
      blob = { canvas: b, color }
      return b
    }

    const drawHeat = (c: CanvasRenderingContext2D, state: MapState) => {
      const key = heatKey(state)
      const w = Math.round(state.width * (1 + 2 * margin))
      const h = Math.round(state.height * (1 + 2 * margin))
      if (!heat || heat.key !== key || heat.canvas.width !== w) {
        const target = heat?.canvas ?? document.createElement("canvas")
        if (target.width !== w || target.height !== h) {
          target.width = w
          target.height = h
        }
        const hc = target.getContext("2d")
        if (!hc) return
        hc.setTransform(1, 0, 0, 1, 0, 0)
        hc.clearRect(0, 0, w, h)
        hc.setTransform(1, 0, 0, 1, margin * state.width, margin * state.height)
        drawBlobs(hc, state)
        heat = { canvas: target, key }
      }
      c.drawImage(
        heat.canvas,
        -margin * state.width,
        -margin * state.height,
        state.width * (1 + 2 * margin),
        state.height * (1 + 2 * margin)
      )
    }

    const drawBlobs = (c: CanvasRenderingContext2D, state: MapState) => {
      const color =
        getComputedStyle(canvas).getPropertyValue("--primary").trim() ||
        "#84cc16"
      const img = blobFor(color)
      const { world } = copies(state)
      const w = state.width
      const h = state.height
      const minX = -margin * w - heatRadius
      const maxX = (1 + margin) * w + heatRadius
      const place = (x: number, y: number) => {
        if (x < minX || x > maxX) return
        c.drawImage(
          img,
          x - heatRadius,
          y - heatRadius,
          heatRadius * 2,
          heatRadius * 2
        )
      }
      for (const a of aircraftRef.current) {
        const p = store.project(a.lon, a.lat)
        if (!p) continue
        const y = p[1]
        if (y < -margin * h - heatRadius || y > (1 + margin) * h + heatRadius)
          continue
        const x =
          world > 0 ? p[0] - Math.round((p[0] - w / 2) / world) * world : p[0]
        place(x, y)
        if (world > 0) {
          place(x - world, y)
          place(x + world, y)
        }
      }
    }

    const renderCache = (state: MapState, dpr: number, key: string) => {
      const width = state.width * (1 + 2 * margin)
      const height = state.height * (1 + 2 * margin)
      const target = cache?.canvas ?? document.createElement("canvas")
      const w = Math.round(width * dpr)
      const h = Math.round(height * dpr)
      if (target.width !== w || target.height !== h) {
        target.width = w
        target.height = h
      }
      const c = target.getContext("2d")
      if (!c) return
      c.setTransform(1, 0, 0, 1, 0, 0)
      c.clearRect(0, 0, w, h)
      c.setTransform(
        dpr,
        0,
        0,
        dpr,
        dpr * margin * state.width,
        dpr * margin * state.height
      )
      const s = getSettings()
      // the globe draws its own night side
      if (s.terminator && state.wrap) drawNight(c, state)
      if (s.heatmap) drawHeat(c, state)
      cache = {
        canvas: target,
        k: state.k,
        x: state.x,
        y: state.y,
        width: state.width,
        height: state.height,
        dpr,
        key,
      }
    }

    const covers = (c: Cache, state: MapState) => {
      const f = state.k / c.k
      const left = (0 - state.x) / f + c.x
      const top = (0 - state.y) / f + c.y
      const right = (state.width - state.x) / f + c.x
      const bottom = (state.height - state.y) / f + c.y
      return (
        left >= -margin * c.width &&
        top >= -margin * c.height &&
        right <= (1 + margin) * c.width &&
        bottom <= (1 + margin) * c.height
      )
    }

    const paint = () => {
      const state = store.get()
      if (state.width === 0 || state.height === 0) return
      const dpr = window.devicePixelRatio || 1
      const w = Math.round(state.width * dpr)
      const h = Math.round(state.height * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        canvas.style.width = `${state.width}px`
        canvas.style.height = `${state.height}px`
      }
      const s = getSettings()
      const active = s.heatmap || (state.wrap && s.terminator)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, state.width, state.height)
      if (!active) {
        cache = null
        heat = null
        return
      }
      const key = cacheKey()
      const stale =
        !cache ||
        cache.key !== key ||
        cache.dpr !== dpr ||
        cache.width !== state.width ||
        cache.height !== state.height ||
        // rotation is not a translation, the globe redraws every frame
        (!state.wrap &&
          (cache.x !== state.x || cache.y !== state.y || cache.k !== state.k))
      if (stale || (cache && !covers(cache, state))) {
        clearTimeout(settle)
        settle = 0
        renderCache(state, dpr, key)
      }
      if (!cache) return
      if (cache.k !== state.k && !settle) {
        settle = window.setTimeout(() => {
          settle = 0
          renderCache(store.get(), window.devicePixelRatio || 1, cacheKey())
          schedule()
        }, settleMs)
      }
      const f = state.k / cache.k
      ctx.drawImage(
        cache.canvas,
        (-margin * cache.width - cache.x) * f + state.x,
        (-margin * cache.height - cache.y) * f + state.y,
        (cache.canvas.width / cache.dpr) * f,
        (cache.canvas.height / cache.dpr) * f
      )
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
    const minute = window.setInterval(schedule, sunRefreshMs)
    const observer = new MutationObserver(schedule)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-scheme"],
    })
    schedule()
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(settle)
      clearInterval(minute)
      unsubscribe()
      unsubscribeSettings()
      observer.disconnect()
      invalidateRef.current = () => {}
    }
  }, [store])

  return (
    <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
  )
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
