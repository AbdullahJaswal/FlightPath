import { geoArea, geoCentroid } from "d3-geo"
import { feature, mesh } from "topojson-client"

type Ring = [number, number][]

export type LandFeature = {
  type: "Feature"
  properties: { name?: string } | null
  geometry:
    | { type: "Polygon"; coordinates: Ring[] }
    | { type: "MultiPolygon"; coordinates: Ring[][] }
}

export type Lines = { type: "MultiLineString"; coordinates: Ring[] }

export type WorldLabel = {
  name: string
  centroid: [number, number]
  area: number
}

export type World = {
  land: LandFeature[]
  borders: Lines
  labels: WorldLabel[]
}

type Topology = Parameters<typeof feature>[0]
type Geometry = NonNullable<Parameters<typeof mesh>[1]>

const cache = new Map<string, Promise<World>>()

// Loads a world-atlas topology once and derives features, borders and label anchors.
export function loadWorld(url: string): Promise<World> {
  let p = cache.get(url)
  if (!p) {
    p = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText)
        return res.json() as Promise<Topology>
      })
      .then((topo) => {
        const object = topo.objects[Object.keys(topo.objects)[0] ?? ""] as
          | Geometry
          | undefined
        if (!object) throw new Error("empty topology")
        const collection = feature(topo, object) as unknown as {
          features?: LandFeature[]
        }
        const land = collection.features ?? []
        const labels: WorldLabel[] = []
        for (const f of land) {
          const name = f.properties?.name
          if (!name) continue
          labels.push({
            name,
            centroid: geoCentroid(largestPart(f)),
            area: geoArea(f),
          })
        }
        labels.sort((a, b) => b.area - a.area)
        const borders = mesh(
          topo,
          object,
          (a, b) => a !== b
        ) as unknown as Lines
        return { land, borders, labels }
      })
    cache.set(url, p)
  }
  return p
}

// island territories would pull a multipolygon centroid offshore
function largestPart(f: LandFeature): LandFeature {
  if (f.geometry.type !== "MultiPolygon") return f
  let best: LandFeature = f
  let bestArea = -1
  for (const coordinates of f.geometry.coordinates) {
    const part: LandFeature = {
      type: "Feature",
      properties: f.properties,
      geometry: { type: "Polygon", coordinates },
    }
    const area = geoArea(part)
    if (area > bestArea) {
      bestArea = area
      best = part
    }
  }
  return best
}
