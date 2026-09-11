import { useEffect, useRef } from "react"
import {
  getRadar,
  loadRadar,
  radarRefreshMs,
  radarTile,
  setRadarIndex,
  subscribeRadar,
} from "@/lib/rainviewer"
import {
  type MapState,
  type MapStore,
  worldLeft,
  worldTop,
  worldWidth,
} from "./map-store"
import { TileCache, tileSize } from "./tiles"

const maxZoom = 10
const alpha = 0.72
const frameMs = 1400
const holdMs = 3000
const blendMs = 450
const retryMs = 120
// tiles are requested once the view has stopped moving, so a zoom loads one level
const settleMs = 160
const margin = 0.25
const cacheTiles = 1500
// other frames load a few at a time so the visible frame is never queued behind them
const prefetchSlots = 6

type Grid = {
  z: number
  count: number
  size: number
  left: number
  top: number
  x0: number
  x1: number
  y0: number
  y1: number
}

function grid(state: MapState, pad: number): Grid | null {
  const world = worldWidth(state)
  if (world <= 0) return null
  const z = Math.max(
    0,
    Math.min(maxZoom, Math.round(Math.log2(world / tileSize)))
  )
  const count = 2 ** z
  const size = world / count
  const left = worldLeft(state)
  const top = worldTop(state)
  const w = state.width
  const h = state.height
  return {
    z,
    count,
    size,
    left,
    top,
    x0: Math.floor((-pad * w - left) / size),
    x1: Math.floor(((1 + pad) * w - left) / size),
    y0: Math.max(0, Math.floor((-pad * h - top) / size)),
    y1: Math.min(count - 1, Math.floor(((1 + pad) * h - top) / size)),
  }
}

// Animated precipitation radar, mounted only while the weather layer is on.
// Frames crossfade on a steady clock and only advance once their tiles are in.
export function RadarLayer({ store }: { store: MapStore }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    let raf = 0
    let loading = false
    let previous = -1
    let blendStart = 0
    let wanted: string[] = []
    let movedAt = 0
    let settleTimer = 0
    const tiles = new TileCache(() => {
      pump()
      schedule()
    }, cacheTiles)

    const pump = () => {
      let busy = 0
      const missing: string[] = []
      for (const url of wanted) {
        const t = tiles.peek(url)
        if (!t) missing.push(url)
        else if (!t.ready && !t.failed) busy++
      }
      for (const url of missing) {
        if (busy >= prefetchSlots) break
        tiles.get(url)
        busy++
      }
    }

    const each = (
      g: Grid,
      fn: (col: number, tx: number, ty: number) => void
    ) => {
      for (let ty = g.y0; ty <= g.y1; ty++) {
        for (let tx = g.x0; tx <= g.x1; tx++) {
          fn(((tx % g.count) + g.count) % g.count, tx, ty)
        }
      }
    }

    const drawFrame = (
      g: Grid,
      host: string,
      path: string,
      opacity: number,
      request: boolean
    ) => {
      ctx.globalAlpha = opacity
      each(g, (col, tx, ty) => {
        const url = radarTile(host, path, g.z, col, ty)
        const tile = request ? tiles.get(url) : tiles.peek(url)
        if (!tile?.ready) return
        ctx.drawImage(
          tile.img,
          g.left + tx * g.size,
          g.top + ty * g.size,
          g.size + 0.5,
          g.size + 0.5
        )
      })
      ctx.globalAlpha = 1
    }

    const paint = (now: number) => {
      const state = store.get()
      const { width, height } = state
      if (width === 0 || height === 0) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
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
      ctx.imageSmoothingQuality = "high"
      const radar = getRadar()
      const frame = radar.frames[radar.index]
      const g = frame && state.wrap ? grid(state, margin) : null
      if (!frame || !g) return
      const settled = now - movedAt >= settleMs
      if (!settled && !settleTimer) {
        settleTimer = window.setTimeout(() => {
          settleTimer = 0
          schedule()
        }, settleMs)
      }
      const last = radar.frames[previous]
      const t = last ? Math.min(1, (now - blendStart) / blendMs) : 1
      if (last && t < 1) {
        drawFrame(g, radar.host, last.path, alpha * (1 - t), settled)
        drawFrame(g, radar.host, frame.path, alpha * t, settled)
        schedule()
      } else {
        drawFrame(g, radar.host, frame.path, alpha, settled)
      }
      // the other frames follow for the visible area so the loop has no holes
      const v = settled ? grid(state, 0) : null
      if (!v) return
      // the frames about to play come first
      wanted = []
      const n = radar.frames.length
      for (let step = 1; step < n; step++) {
        const f = radar.frames[(radar.index + step) % n]
        if (!f) continue
        each(v, (col, _tx, ty) => {
          wanted.push(radarTile(radar.host, f.path, v.z, col, ty))
        })
      }
      pump()
    }

    const schedule = () => {
      if (raf) return
      raf = requestAnimationFrame((now) => {
        raf = 0
        paint(now)
      })
    }

    const frameReady = (index: number) => {
      const radar = getRadar()
      const f = radar.frames[index]
      const v = f ? grid(store.get(), 0) : null
      if (!f || !v) return false
      let ready = true
      each(v, (col, _tx, ty) => {
        const tile = tiles.peek(radarTile(radar.host, f.path, v.z, col, ty))
        if (!tile?.ready && !tile?.failed) ready = false
      })
      return ready
    }

    // one timer owns the loop, start() replaces it so a publish never spawns a second loop
    let loop = 0
    const start = (delay: number) => {
      clearTimeout(loop)
      loop = window.setTimeout(advance, delay)
    }

    const advance = () => {
      const radar = getRadar()
      if (document.hidden || radar.frames.length === 0) {
        loop = 0
        return
      }
      const next = (radar.index + 1) % radar.frames.length
      if (!frameReady(next)) {
        start(retryMs)
        return
      }
      previous = radar.index
      blendStart = performance.now()
      setRadarIndex(next)
      start(next === radar.frames.length - 1 ? holdMs : frameMs)
    }

    const refresh = () => {
      if (loading || Date.now() - getRadar().loadedAt < radarRefreshMs) return
      loading = true
      loadRadar()
        .catch(() => {})
        .finally(() => {
          loading = false
        })
    }

    // a hidden tab throttles timers, so the loop pauses and restarts cleanly on return
    const onVisibility = () => {
      clearTimeout(loop)
      loop = 0
      previous = -1
      if (document.hidden) return
      refresh()
      start(holdMs)
      schedule()
    }

    let loadedAt = getRadar().loadedAt
    const unsubscribe = store.subscribe(() => {
      movedAt = performance.now()
      schedule()
    })
    const unsubscribeRadar = subscribeRadar(() => {
      const radar = getRadar()
      // a fresh index renumbers the frames, so no crossfade from the old list
      if (radar.loadedAt !== loadedAt) {
        loadedAt = radar.loadedAt
        previous = -1
      }
      schedule()
      if (!loop && !document.hidden) start(holdMs)
    })
    const refreshTimer = window.setInterval(() => {
      if (!document.hidden) refresh()
    }, 60_000)
    document.addEventListener("visibilitychange", onVisibility)
    refresh()
    schedule()
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(loop)
      clearTimeout(settleTimer)
      clearInterval(refreshTimer)
      document.removeEventListener("visibilitychange", onVisibility)
      unsubscribe()
      unsubscribeRadar()
    }
  }, [store])

  return (
    <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
  )
}
