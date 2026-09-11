import type { TileSource } from "@/lib/map-styles"

export type Tile = { img: HTMLImageElement; ready: boolean; failed: boolean }

const defaultCapacity = 400
export const tileSize = 256
export const mercatorMaxLat = 85.05112878

// In-memory tile images, oldest finished tiles evicted first so downloads never get cancelled.
export class TileCache {
  private tiles = new Map<string, Tile>()

  // onLoad runs after every load or failure so layers can repaint or refill queues
  constructor(
    private onLoad: () => void,
    private capacity = defaultCapacity
  ) {}

  peek(url: string) {
    return this.tiles.get(url)
  }

  get(url: string): Tile {
    let tile = this.tiles.get(url)
    if (tile) return tile
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.decoding = "async"
    tile = { img, ready: false, failed: false }
    const t = tile
    img.onload = () => {
      t.ready = true
      this.onLoad()
    }
    img.onerror = () => {
      t.failed = true
      this.onLoad()
    }
    img.src = url
    this.tiles.set(url, tile)
    if (this.tiles.size > this.capacity) this.evict()
    return tile
  }

  private evict() {
    for (const [key, t] of this.tiles) {
      if (!t.ready && !t.failed) continue
      this.tiles.delete(key)
      return
    }
  }
}

export function tileUrl(
  source: TileSource,
  z: number,
  x: number,
  y: number,
  retina: boolean,
  dark: boolean
) {
  const template = dark && source.dark ? source.dark : source.url
  return template
    .replace("{date}", imageryDate())
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y))
    .replace("{r}", retina && source.retina ? "@2x" : "")
}

// yesterday in UTC, the newest day with complete daily imagery
function imageryDate() {
  return new Date(Date.now() - 30 * 3600_000).toISOString().slice(0, 10)
}

export function tileZoom(worldPx: number, dpr: number, source: TileSource) {
  const bias = !source.retina && dpr > 1.5 ? 1 : 0
  const z = Math.round(Math.log2(worldPx / tileSize)) + bias
  return Math.max(0, Math.min(source.maxZoom, z))
}
