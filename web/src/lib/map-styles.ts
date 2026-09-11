import {
  IconMap2,
  IconMountain,
  IconPhoto,
  IconRoad,
  IconSatellite,
  IconTopologyStar3,
  IconWaveSine,
  IconWorld,
} from "@tabler/icons-react"
import { useSyncExternalStore } from "react"
import type { Icon } from "./labels"

export type MapStyleId =
  | "simple"
  | "terrain"
  | "relief"
  | "physical"
  | "ocean"
  | "canvas"
  | "streets"
  | "satellite"

export type TileSource = {
  url: string
  dark?: string
  maxZoom: number
  retina?: boolean
  attribution: string
  // brightness of the imagery, picks the overlay colours
  tone: "light" | "dark" | "theme"
  // draw our own English country names and borders
  overlay: boolean
}

export type MapStyle = {
  id: MapStyleId
  label: string
  icon: Icon
  tiles?: TileSource
}

const esri = (service: string) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`

export const mapStyles: MapStyle[] = [
  { id: "simple", label: "Simple", icon: IconMap2 },
  {
    id: "terrain",
    label: "Terrain",
    icon: IconMountain,
    tiles: {
      url: esri("World_Terrain_Base"),
      maxZoom: 13,
      attribution: "© Esri, USGS, NOAA",
      tone: "light",
      overlay: true,
    },
  },
  {
    id: "relief",
    label: "Relief",
    icon: IconTopologyStar3,
    tiles: {
      url: esri("World_Shaded_Relief"),
      maxZoom: 13,
      attribution: "© Esri",
      tone: "light",
      overlay: true,
    },
  },
  {
    id: "physical",
    label: "Physical",
    icon: IconWorld,
    tiles: {
      url: esri("World_Physical_Map"),
      maxZoom: 8,
      attribution: "© Esri, US National Park Service",
      tone: "light",
      overlay: true,
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    icon: IconWaveSine,
    tiles: {
      url: esri("Ocean/World_Ocean_Base"),
      maxZoom: 16,
      attribution: "© Esri, Garmin, GEBCO, NOAA",
      tone: "light",
      overlay: true,
    },
  },
  {
    id: "canvas",
    label: "Canvas",
    icon: IconPhoto,
    tiles: {
      url: esri("Canvas/World_Light_Gray_Base"),
      dark: esri("Canvas/World_Dark_Gray_Base"),
      maxZoom: 16,
      attribution: "© Esri, HERE, Garmin, OpenStreetMap contributors",
      tone: "theme",
      overlay: true,
    },
  },
  {
    id: "streets",
    label: "Streets",
    icon: IconRoad,
    tiles: {
      url: esri("World_Street_Map"),
      maxZoom: 19,
      attribution: "© Esri, HERE, Garmin, OpenStreetMap contributors",
      tone: "light",
      overlay: false,
    },
  },
  {
    id: "satellite",
    label: "Satellite",
    icon: IconSatellite,
    tiles: {
      url: esri("World_Imagery"),
      maxZoom: 19,
      attribution: "© Esri, Maxar, Earthstar Geographics",
      tone: "dark",
      overlay: true,
    },
  },
]

export const defaultMapStyle: MapStyleId = "terrain"
export const mapStyleKey = "flightpath:map"

const ids = mapStyles.map((s) => s.id)

export function isMapStyleId(v: unknown): v is MapStyleId {
  return typeof v === "string" && (ids as string[]).includes(v)
}

let current: MapStyleId = defaultMapStyle
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

export function getMapStyle() {
  return current
}

export function subscribeMapStyle(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setMapStyle(id: MapStyleId) {
  current = id
  try {
    localStorage.setItem(mapStyleKey, id)
  } catch {}
  notify()
}

// Reads the stored choice once the client is up.
export function loadMapStyle() {
  try {
    const stored = localStorage.getItem(mapStyleKey)
    if (isMapStyleId(stored) && stored !== current) {
      current = stored
      notify()
    }
  } catch {}
}

export function useMapStyle() {
  const id = useSyncExternalStore(
    subscribeMapStyle,
    getMapStyle,
    () => defaultMapStyle
  )
  return [id, setMapStyle] as const
}
