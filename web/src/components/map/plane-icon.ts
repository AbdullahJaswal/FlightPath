import type { Category } from "@/lib/api/schemas"

export type ShapeId =
  | "jet"
  | "wide"
  | "prop"
  | "glider"
  | "heli"
  | "balloon"
  | "fast"
  | "drone"
  | "vehicle"
  | "chute"

export type Shape = { id: ShapeId; path: Path2D; size: number }

// Top-down silhouettes in a 24x24 box, nose pointing up.
const outlines: Record<ShapeId, [string, number]> = {
  jet: [
    "M12 1.8 L13.7 3.6 L13.7 9.2 L22.2 14.2 L22.2 16.4 L13.7 13.6 L13.7 18.4 L16.3 20.2 L16.3 21.8 L12 20.6 L7.7 21.8 L7.7 20.2 L10.3 18.4 L10.3 13.6 L1.8 16.4 L1.8 14.2 L10.3 9.2 L10.3 3.6 Z",
    14,
  ],
  wide: [
    "M12 0.8 L14.1 3.2 L14.1 8.6 L23.4 15 L23.4 17.3 L14.1 14.4 L14.1 18.7 L17.2 20.7 L17.2 22.4 L12 21.2 L6.8 22.4 L6.8 20.7 L9.9 18.7 L9.9 14.4 L0.6 17.3 L0.6 15 L9.9 8.6 L9.9 3.2 Z",
    16,
  ],
  prop: [
    "M12 2.2 L13.3 3.8 L13.3 9 L22.4 9.6 L22.4 11.8 L13.3 12.4 L13.3 17.8 L15.9 19.4 L15.9 20.9 L12 20.2 L8.1 20.9 L8.1 19.4 L10.7 17.8 L10.7 12.4 L1.6 11.8 L1.6 9.6 L10.7 9 L10.7 3.8 Z",
    11,
  ],
  glider: [
    "M12 2.6 L12.9 3.8 L12.9 9.6 L23.6 10.3 L23.6 11.5 L12.9 11.9 L12.9 18.6 L14.8 19.6 L14.8 20.8 L12 20.3 L9.2 20.8 L9.2 19.6 L11.1 18.6 L11.1 11.9 L0.4 11.5 L0.4 10.3 L11.1 9.6 L11.1 3.8 Z",
    13,
  ],
  heli: [
    "M12 5.5 C14.6 5.5 16.2 7.4 16.2 10.2 C16.2 12.6 14.6 14.2 13 14.6 L13 19.6 L15.6 20.4 L15.6 21.6 L12 21 L8.4 21.6 L8.4 20.4 L11 19.6 L11 14.6 C9.4 14.2 7.8 12.6 7.8 10.2 C7.8 7.4 9.4 5.5 12 5.5 Z M11.35 1 L12.65 1 L12.65 19 L11.35 19 Z M3 9.35 L21 9.35 L21 10.65 L3 10.65 Z",
    12,
  ],
  balloon: [
    "M12 1.5 C16.8 1.5 19.8 5 19.8 9.4 C19.8 13 15.6 15.6 13.4 17.4 L13.4 19 L10.6 19 L10.6 17.4 C8.4 15.6 4.2 13 4.2 9.4 C4.2 5 7.2 1.5 12 1.5 Z M9.8 20 L14.2 20 L14.2 23 L9.8 23 Z",
    11,
  ],
  fast: [
    "M12 0.8 L13.5 4 L13.5 9.5 L22.5 18.8 L22.5 20.4 L13.7 17.8 L13.7 19.6 L15.8 21 L15.8 22.4 L12 21.6 L8.2 22.4 L8.2 21 L10.3 19.6 L10.3 17.8 L1.5 20.4 L1.5 18.8 L10.5 9.5 L10.5 4 Z",
    13,
  ],
  drone: [
    "M9.5 9.5 L14.5 9.5 L14.5 14.5 L9.5 14.5 Z M4.5 4.5 L6.6 4.5 L12.7 10.6 L11.3 12 Z M19.5 4.5 L19.5 6.6 L13.4 12.7 L12 11.3 Z M19.5 19.5 L17.4 19.5 L11.3 13.4 L12.7 12 Z M4.5 19.5 L4.5 17.4 L10.6 11.3 L12 12.7 Z M5 1.8 a3.2 3.2 0 1 0 0.01 0 Z M19 1.8 a3.2 3.2 0 1 0 0.01 0 Z M19 15.8 a3.2 3.2 0 1 0 0.01 0 Z M5 15.8 a3.2 3.2 0 1 0 0.01 0 Z",
    11,
  ],
  vehicle: [
    "M8.5 4 L15.5 4 Q17.5 4 17.5 6 L17.5 18 Q17.5 20 15.5 20 L8.5 20 Q6.5 20 6.5 18 L6.5 6 Q6.5 4 8.5 4 Z",
    8,
  ],
  chute: ["M3.5 10 C3.5 3.5 20.5 3.5 20.5 10 L12 20.5 Z", 10],
}

const byCategory: Record<Category, ShapeId> = {
  unknown: "jet",
  light: "prop",
  small: "prop",
  large: "jet",
  high_vortex_large: "jet",
  heavy: "wide",
  high_performance: "fast",
  rotorcraft: "heli",
  glider: "glider",
  lighter_than_air: "balloon",
  parachutist: "chute",
  ultralight: "prop",
  uav: "drone",
  space: "fast",
  emergency_surface: "vehicle",
  service_surface: "vehicle",
  obstacle: "vehicle",
}

export const planeBox = 24
export const shapeIds = Object.keys(outlines) as ShapeId[]

const cache = new Map<ShapeId, Shape>()

export function shape(id: ShapeId): Shape {
  let s = cache.get(id)
  if (!s) {
    const [d, size] = outlines[id]
    s = { id, path: new Path2D(d), size }
    cache.set(id, s)
  }
  return s
}

export function shapeFor(category: Category, shapes: boolean): Shape {
  return shape(shapes ? byCategory[category] : "jet")
}

export function planePath() {
  return shape("jet").path
}
