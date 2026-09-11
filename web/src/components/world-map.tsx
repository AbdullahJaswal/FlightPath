import type { ReactNode } from "react"
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps"
import countriesUrl from "world-atlas/countries-110m.json?url"

export function WorldMap({ children }: { children?: ReactNode }) {
  return (
    <ComposableMap projection="geoMercator" className="h-full w-full">
      <ZoomableGroup minZoom={1} maxZoom={16}>
        <Geographies geography={countriesUrl}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                className="fill-muted stroke-[0.5] stroke-border outline-none"
              />
            ))
          }
        </Geographies>
        {children}
      </ZoomableGroup>
    </ComposableMap>
  )
}
