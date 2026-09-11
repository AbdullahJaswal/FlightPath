import type { ComponentProps } from "react"
import { useState } from "react"
import { AircraftTooltip } from "@/components/flight/aircraft-tooltip"
import { type HoverTarget, PlanesLayer } from "./planes-layer"

type Props = Omit<ComponentProps<typeof PlanesLayer>, "onHover"> & {
  width: number
  height: number
}

// Keeps hover state out of the map tree so tooltips never re-render the SVG.
export function PlanesOverlay({ width, height, ...props }: Props) {
  const [hover, setHover] = useState<HoverTarget | null>(null)
  return (
    <>
      <PlanesLayer {...props} onHover={setHover} />
      {hover && (
        <AircraftTooltip
          aircraft={hover.aircraft}
          x={hover.x}
          y={hover.y}
          width={width}
          height={height}
        />
      )}
    </>
  )
}
