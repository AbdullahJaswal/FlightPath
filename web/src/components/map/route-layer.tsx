import {
  Line,
  Marker,
  useMapContext,
  useZoomPanContext,
} from "react-simple-maps"
import type { Airport } from "@/lib/api/schemas"

type Props = {
  origin?: Airport
  destination?: Airport
  position?: [number, number]
}

export function RouteLayer({ origin, destination, position }: Props) {
  const { k } = useZoomPanContext()
  const { projection } = useMapContext()
  const world = 2 * Math.PI * projection.scale()
  const from: [number, number] | null = origin ? [origin.lon, origin.lat] : null
  const to: [number, number] | null = destination
    ? [destination.lon, destination.lat]
    : null

  return (
    <g className="pointer-events-none">
      {[-1, 0, 1].map((copy) => (
        <g key={copy} transform={`translate(${copy * world} 0)`}>
          {from && position && (
            <Line
              from={from}
              to={position}
              className="stroke-primary"
              strokeWidth={2}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {position && to && (
            <Line
              from={position}
              to={to}
              className="stroke-primary/60"
              strokeWidth={2}
              strokeDasharray="6 6"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {!position && from && to && (
            <Line
              from={from}
              to={to}
              className="stroke-primary/60"
              strokeWidth={2}
              strokeDasharray="6 6"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {origin && <AirportMarker airport={origin} scale={1 / k} />}
          {destination && <AirportMarker airport={destination} scale={1 / k} />}
        </g>
      ))}
    </g>
  )
}

function AirportMarker({
  airport,
  scale,
}: {
  airport: Airport
  scale: number
}) {
  return (
    <Marker coordinates={[airport.lon, airport.lat]}>
      <g transform={`scale(${scale})`}>
        <circle
          r={5}
          className="fill-primary stroke-background"
          strokeWidth={2}
        />
        <text
          x={9}
          y={4}
          className="fill-foreground stroke-background font-medium text-[11px]"
          strokeWidth={3}
          style={{ paintOrder: "stroke" }}
        >
          {airport.iata ?? airport.icao}
        </text>
      </g>
    </Marker>
  )
}
