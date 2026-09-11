import { useEffect, useRef } from "react"
import {
  getMapStyle,
  type MapStyleId,
  mapStyles,
  subscribeMapStyle,
  type TileSource,
} from "@/lib/map-styles"
import {
  type MapState,
  type MapStore,
  worldLeft,
  worldTop,
  worldWidth,
} from "./map-store"
import { TileCache, tileUrl, tileZoom } from "./tiles"

type Cache = {
  canvas: HTMLCanvasElement
  k: number
  x: number
  y: number
  width: number
  height: number
  dpr: number
  land: Path2D[]
  grid: Path2D | null
  colors: string
  style: MapStyleId
  dark: boolean
  tiles: number
}

// extra area rendered around the viewport so pans only blit
const margin = 0.25
const settleMs = 120
const tileBatchMs = 80
const fallbackLevels = 4
const coarseLevels = 3

// Base map rendered into a bitmap once per view, blitted while panning and zooming.
export function BaseLayer({ store }: { store: MapStore }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    let cache: Cache | null = null
    let raf = 0
    let settle = 0
    let tileVersion = 0
    let tileTimer = 0
    const tiles = new TileCache(() => {
      if (tileTimer) return
      tileTimer = window.setTimeout(() => {
        tileTimer = 0
        tileVersion++
        schedule()
      }, tileBatchMs)
    })

    const isDark = () => document.documentElement.classList.contains("dark")
    const colorsKey = () => {
      const style = getComputedStyle(canvas)
      return ["--map-land", "--map-coast", "--border", "--map-sea"]
        .map((name) => style.getPropertyValue(name).trim())
        .join("|")
    }

    const drawVector = (
      c: CanvasRenderingContext2D,
      state: MapState,
      dpr: number,
      colors: string
    ) => {
      const [land, coast, grid, sea] = colors.split("|") as [
        string,
        string,
        string,
        string,
      ]
      c.setTransform(1, 0, 0, 1, 0, 0)
      c.fillStyle = sea || "#e6f0f6"
      c.fillRect(0, 0, c.canvas.width, c.canvas.height)
      const { x, y, k } = state
      const world = worldWidth(state)
      const left = worldLeft(state)
      const from =
        world > 0 ? Math.floor((-margin * state.width - left) / world) : 0
      const to =
        world > 0 ? Math.floor(((1 + margin) * state.width - left) / world) : 0
      c.lineJoin = "round"
      for (let i = from; i <= to; i++) {
        c.setTransform(
          dpr * k,
          0,
          0,
          dpr * k,
          dpr * (x + margin * state.width + i * world),
          dpr * (y + margin * state.height)
        )
        if (state.grid) {
          c.strokeStyle = grid || "#ccc"
          c.globalAlpha = 0.5
          c.lineWidth = 0.5 / k
          c.stroke(state.grid)
          c.globalAlpha = 1
        }
        c.fillStyle = land || "#f7f7f5"
        c.strokeStyle = coast || "#9cc0d6"
        c.lineWidth = 0.6 / k
        for (const path of state.land) {
          c.fill(path)
          c.stroke(path)
        }
      }
    }

    const drawTiles = (
      c: CanvasRenderingContext2D,
      state: MapState,
      dpr: number,
      source: TileSource,
      dark: boolean
    ) => {
      const world = worldWidth(state)
      if (world <= 0) return
      const z = tileZoom(world, dpr, source)
      const count = 2 ** z
      const size = world / count
      const left = worldLeft(state)
      const top = worldTop(state)
      const w = state.width
      const h = state.height
      const x0 = Math.floor((-margin * w - left) / size)
      const x1 = Math.floor(((1 + margin) * w - left) / size)
      const y0 = Math.max(0, Math.floor((-margin * h - top) / size))
      const y1 = Math.min(
        count - 1,
        Math.floor(((1 + margin) * h - top) / size)
      )
      const retina = dpr > 1.5
      c.setTransform(dpr, 0, 0, dpr, dpr * margin * w, dpr * margin * h)
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const col = ((tx % count) + count) % count
          const dx = left + tx * size
          const dy = top + ty * size
          const tile = tiles.get(tileUrl(source, z, col, ty, retina, dark))
          if (tile.ready) {
            c.drawImage(tile.img, dx, dy, size + 0.5, size + 0.5)
            continue
          }
          // a coarse ancestor covers the area quickly while the tile loads
          if (z >= coarseLevels) {
            tiles.get(
              tileUrl(
                source,
                z - coarseLevels,
                col >> coarseLevels,
                ty >> coarseLevels,
                retina,
                dark
              )
            )
          }
          // show the nearest loaded ancestor until this tile arrives
          for (let up = 1; up <= fallbackLevels && z - up >= 0; up++) {
            const parent = tiles.peek(
              tileUrl(source, z - up, col >> up, ty >> up, retina, dark)
            )
            if (!parent?.ready) continue
            const part = parent.img.naturalWidth / 2 ** up
            const mask = 2 ** up - 1
            c.drawImage(
              parent.img,
              (col & mask) * part,
              (ty & mask) * part,
              part,
              part,
              dx,
              dy,
              size + 0.5,
              size + 0.5
            )
            break
          }
        }
      }
    }

    // English country names and borders on top of any base, sized to the country at this zoom
    const drawOverlay = (
      c: CanvasRenderingContext2D,
      state: MapState,
      dpr: number,
      tone: "light" | "dark"
    ) => {
      const { x, y, k } = state
      const world = worldWidth(state)
      const left = worldLeft(state)
      const w = state.width
      const h = state.height
      const from = world > 0 ? Math.floor((-margin * w - left) / world) : 0
      const to = world > 0 ? Math.floor(((1 + margin) * w - left) / world) : 0
      const borderColor =
        tone === "dark" ? "rgba(255,255,255,0.45)" : "rgba(39,39,42,0.4)"
      const textColor =
        tone === "dark" ? "rgba(255,255,255,0.92)" : "rgba(24,24,27,0.88)"
      const halo =
        tone === "dark" ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.85)"
      if (state.borders) {
        for (let i = from; i <= to; i++) {
          c.setTransform(
            dpr * k,
            0,
            0,
            dpr * k,
            dpr * (x + margin * w + i * world),
            dpr * (y + margin * h)
          )
          c.strokeStyle = borderColor
          c.lineJoin = "round"
          c.lineWidth = 0.8 / k
          c.stroke(state.borders)
        }
      }
      c.setTransform(dpr, 0, 0, dpr, dpr * margin * w, dpr * margin * h)
      c.font = "600 11px 'Figtree Variable', sans-serif"
      c.textAlign = "center"
      c.textBaseline = "middle"
      c.lineJoin = "round"
      c.lineWidth = 3
      c.letterSpacing = "0.08em"
      const placed: [number, number, number, number][] = []
      for (const label of state.labels) {
        const text = label.text.toUpperCase()
        const width = c.measureText(text).width + 6
        const height = 16
        // skip countries too small at this zoom to carry their name
        if (label.area * k * k < width * height * 1.4) continue
        for (let i = from; i <= to; i++) {
          const sx = label.x * k + x + i * world
          const sy = label.y * k + y
          if (
            sx < -margin * w ||
            sx > (1 + margin) * w ||
            sy < -margin * h ||
            sy > (1 + margin) * h
          )
            continue
          const bx = sx - width / 2
          const by = sy - height / 2
          let clash = false
          for (const [px, py, pw, ph] of placed) {
            if (
              bx < px + pw &&
              bx + width > px &&
              by < py + ph &&
              by + height > py
            ) {
              clash = true
              break
            }
          }
          if (clash) continue
          placed.push([bx, by, width, height])
          c.strokeStyle = halo
          c.strokeText(text, sx, sy)
          c.fillStyle = textColor
          c.fillText(text, sx, sy)
        }
      }
      c.letterSpacing = "0px"
      c.textAlign = "start"
    }

    const renderCache = (state: MapState, dpr: number, colors: string) => {
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
      const style = getMapStyle()
      const source = mapStyles.find((s) => s.id === style)?.tiles
      const dark = isDark()
      if (source) drawTiles(c, state, dpr, source, dark)
      else drawVector(c, state, dpr, colors)
      if (!source || source.overlay) {
        const tone =
          !source || source.tone === "theme"
            ? dark
              ? "dark"
              : "light"
            : source.tone
        drawOverlay(c, state, dpr, tone)
      }
      cache = {
        canvas: target,
        k: state.k,
        x: state.x,
        y: state.y,
        width: state.width,
        height: state.height,
        dpr,
        land: state.land,
        grid: state.grid,
        colors,
        style,
        dark,
        tiles: tileVersion,
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
      const colors = colorsKey()
      const stale =
        !cache ||
        cache.land !== state.land ||
        cache.grid !== state.grid ||
        cache.colors !== colors ||
        cache.dpr !== dpr ||
        cache.width !== state.width ||
        cache.height !== state.height ||
        cache.style !== getMapStyle() ||
        cache.dark !== isDark() ||
        cache.tiles !== tileVersion
      if (stale || (cache && !covers(cache, state))) {
        clearTimeout(settle)
        settle = 0
        renderCache(state, dpr, colors)
      }
      if (!cache) return
      if (cache.k !== state.k && !settle) {
        // keep the scaled bitmap until the zoom settles, then rerender crisp
        settle = window.setTimeout(() => {
          settle = 0
          const s = store.get()
          renderCache(s, window.devicePixelRatio || 1, colorsKey())
          schedule()
        }, settleMs)
      }
      const f = state.k / cache.k
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, state.width, state.height)
      if (cache.style === "simple") {
        // sea also covers the edges revealed while a zoom settles
        ctx.fillStyle = cache.colors.split("|")[3] || "#e6f0f6"
        ctx.fillRect(0, 0, state.width, state.height)
      }
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
    const unsubscribeStyle = subscribeMapStyle(schedule)
    const observer = new MutationObserver(schedule)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-scheme"],
    })
    schedule()
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(settle)
      clearTimeout(tileTimer)
      unsubscribe()
      unsubscribeStyle()
      observer.disconnect()
    }
  }, [store])

  return (
    <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
  )
}
