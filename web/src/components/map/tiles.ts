import type { TileSource } from "@/lib/map-styles"

export type Tile = { img: HTMLImageElement; ready: boolean; failed: boolean }

const maxTiles = 400
export const tileSize = 256
export const mercatorMaxLat = 85.05112878

// In-memory tile images with insertion-order eviction.
export class TileCache {
  private tiles = new Map<string, Tile>()

  constructor(private onLoad: () => void) {}

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
    }
    img.src = url
    this.tiles.set(url, tile)
    if (this.tiles.size > maxTiles) {
      const oldest = this.tiles.keys().next().value
      if (oldest !== undefined) this.tiles.delete(oldest)
    }
    return tile
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
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y))
    .replace("{r}", retina && source.retina ? "@2x" : "")
}

export function tileZoom(worldPx: number, dpr: number, source: TileSource) {
  const bias = !source.retina && dpr > 1.5 ? 1 : 0
  const z = Math.round(Math.log2(worldPx / tileSize)) + bias
  return Math.max(0, Math.min(source.maxZoom, z))
}
