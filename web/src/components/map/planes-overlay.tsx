import type { ComponentProps } from "react"
import { useState } from "react"
import { AircraftTooltip } from "@/components/flight/aircraft-tooltip"
import { AirportTooltip } from "@/components/flight/airport-tooltip"
import { type HoverTarget, PlanesLayer, type Pulse } from "./planes-layer"

type Props = Omit<
  ComponentProps<typeof PlanesLayer>,
  "onHover" | "onEmergencies"
> & {
  width: number
  height: number
}

// Keeps hover state out of the map tree so tooltips never re-render the SVG.
export function PlanesOverlay({ width, height, ...props }: Props) {
  const [hover, setHover] = useState<HoverTarget | null>(null)
  const [pulses, setPulses] = useState<Pulse[]>([])
  return (
    <>
      <PlanesLayer {...props} onHover={setHover} onEmergencies={setPulses} />
      {pulses.map((p) => (
        <span
          key={p.id}
          className="pointer-events-none absolute size-8 animate-ping rounded-full border-2 border-destructive"
          style={{ left: p.x - 16, top: p.y - 16 }}
        />
      ))}
      {hover?.kind === "aircraft" && (
        <AircraftTooltip
          aircraft={hover.aircraft}
          x={hover.x}
          y={hover.y}
          width={width}
          height={height}
        />
      )}
      {hover?.kind === "airport" && (
        <AirportTooltip
          airport={hover.airport}
          x={hover.x}
          y={hover.y}
          width={width}
          height={height}
        />
      )}
    </>
  )
}
