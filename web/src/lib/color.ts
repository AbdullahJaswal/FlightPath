const cache = new Map<string, [number, number, number]>()
let probe: CanvasRenderingContext2D | null = null

// Resolves any CSS colour, oklch included, to sRGB bytes through a 1px canvas.
export function toRgb(color: string): [number, number, number] {
  const hit = cache.get(color)
  if (hit) return hit
  if (!probe) {
    const c = document.createElement("canvas")
    c.width = 1
    c.height = 1
    probe = c.getContext("2d", { willReadFrequently: true })
  }
  let rgb: [number, number, number] = [128, 128, 128]
  if (probe) {
    probe.clearRect(0, 0, 1, 1)
    probe.fillStyle = "#000"
    probe.fillStyle = color
    probe.fillRect(0, 0, 1, 1)
    const d = probe.getImageData(0, 0, 1, 1).data
    rgb = [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0]
  }
  cache.set(color, rgb)
  return rgb
}

export function rgba(color: string, alpha: number) {
  const [r, g, b] = toRgb(color)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Lightens (positive) or darkens (negative) a colour, with an optional alpha.
export function shade(color: string, amount: number, alpha = 1) {
  const [r, g, b] = toRgb(color)
  const mix = (c: number) =>
    Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))
  return `rgba(${mix(r)}, ${mix(g)}, ${mix(b)}, ${alpha})`
}
