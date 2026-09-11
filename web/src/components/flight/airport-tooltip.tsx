import { IconBuildingAirport, IconMapPin } from "@tabler/icons-react"
import { useLayoutEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import type { Airport } from "@/lib/api/schemas"
import { titleCase } from "@/lib/format"

type Props = {
  airport: Airport
  x: number
  y: number
  width: number
  height: number
}

const pointerGap = 16
const edgeGap = 8

export function AirportTooltip({ airport, x, y, width, height }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 240, height: 64 })

  useLayoutEffect(() => {
    const el = boxRef.current
    if (el) setBox({ width: el.offsetWidth, height: el.offsetHeight })
  }, [])

  let left = x + pointerGap
  if (left + box.width + edgeGap > width) left = x - pointerGap - box.width
  left = Math.max(edgeGap, Math.min(left, width - box.width - edgeGap))
  let top = y - 12
  if (top + box.height + edgeGap > height) top = y + 12 - box.height
  top = Math.max(edgeGap, Math.min(top, height - box.height - edgeGap))

  return (
    <div
      ref={boxRef}
      className="pointer-events-none absolute z-20 flex max-w-64 animate-fade-up flex-col gap-1 rounded-lg bg-popover/95 p-3 text-popover-foreground text-sm/relaxed shadow-md ring-1 ring-foreground/10 backdrop-blur"
      style={{ left, top }}
    >
      <div className="flex items-center gap-2">
        <IconBuildingAirport className="size-4 shrink-0 text-primary" />
        <span className="truncate font-heading font-medium">
          {airport.name}
        </span>
      </div>
      <div className="flex items-center gap-1 text-muted-foreground text-xs">
        {airport.iata && <Badge variant="secondary">{airport.iata}</Badge>}
        <Badge variant="outline">{airport.icao}</Badge>
        {airport.type && <span>{titleCase(airport.type)}</span>}
      </div>
      <div className="flex items-center gap-1 text-muted-foreground text-xs">
        <IconMapPin className="size-3" />
        {[airport.municipality, airport.country].filter(Boolean).join(", ") ||
          "Unknown"}
      </div>
    </div>
  )
}
