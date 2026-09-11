// Top-down silhouette in a 24x24 box, nose pointing up.
const outline =
  "M12 1.8 L13.7 3.6 L13.7 9.2 L22.2 14.2 L22.2 16.4 L13.7 13.6 L13.7 18.4 L16.3 20.2 L16.3 21.8 L12 20.6 L7.7 21.8 L7.7 20.2 L10.3 18.4 L10.3 13.6 L1.8 16.4 L1.8 14.2 L10.3 9.2 L10.3 3.6 Z"

export const planeBox = 24

let cached: Path2D | null = null

export function planePath() {
  cached ??= new Path2D(outline)
  return cached
}
