import { memo, useEffect } from "react"
import {
  type MapContextType,
  type UseGeographiesProps,
  useGeographies,
  useMapContext,
} from "react-simple-maps"
import type { MapLabel, MapStore } from "./map-store"

type Props = {
  store: MapStore
  geography: UseGeographiesProps["geography"]
}

// react-simple-maps types the d3 geoPath as a plain function, the object has more
type GeoPath = {
  centroid: (object: unknown) => [number, number]
  area: (object: unknown) => number
}

const gridStep = 15
const sampleStep = 5
const maxLat = 85

// Turns the projected geographies into canvas paths and label anchors, once per data or size change.
export const BaseMapSync = memo(function BaseMapSync({
  store,
  geography,
}: Props) {
  const { projection, path } = useMapContext()
  const { geographies, borders } = useGeographies({ geography })

  useEffect(() => {
    const geoPath = path as unknown as GeoPath
    const land: Path2D[] = []
    const labels: MapLabel[] = []
    for (const geo of geographies) {
      if (geo.svgPath) land.push(new Path2D(geo.svgPath))
      const name = (geo.properties as { name?: string } | null)?.name
      if (!name) continue
      const [x, y] = geoPath.centroid(largestPart(geo.geometry))
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      labels.push({ text: name, x, y, area: geoPath.area(geo) })
    }
    labels.sort((a, b) => b.area - a.area)
    store.set({
      land,
      labels,
      borders: borders?.svgPath ? new Path2D(borders.svgPath) : null,
      grid: graticule(projection),
    })

    // island territories would pull a multipolygon centroid offshore
    function largestPart(geometry: (typeof geographies)[number]["geometry"]) {
      if (geometry.type !== "MultiPolygon") return geometry
      let best: unknown = geometry
      let bestArea = -1
      for (const coordinates of geometry.coordinates) {
        const part = { type: "Polygon" as const, coordinates }
        const area = geoPath.area(part)
        if (area > bestArea) {
          bestArea = area
          best = part
        }
      }
      return best
    }
  }, [geographies, borders, projection, path, store])

  return null
})

function graticule(projection: MapContextType["projection"]) {
  const grid = new Path2D()
  const line = (points: [number, number][]) => {
    let first = true
    for (const point of points) {
      const p = projection(point)
      if (!p) continue
      if (first) grid.moveTo(p[0], p[1])
      else grid.lineTo(p[0], p[1])
      first = false
    }
  }
  for (let lon = -180; lon <= 180; lon += gridStep) {
    const points: [number, number][] = []
    for (let lat = -maxLat; lat <= maxLat; lat += sampleStep)
      points.push([lon, lat])
    line(points)
  }
  for (let lat = -75; lat <= 75; lat += gridStep) {
    const points: [number, number][] = []
    for (let lon = -180; lon <= 180; lon += sampleStep) points.push([lon, lat])
    line(points)
  }
  return grid
}
