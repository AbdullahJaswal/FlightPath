import {
  IconArrowNarrowRight,
  IconBuildingSkyscraper,
  IconClock,
  IconCompass,
  IconGauge,
  IconHash,
  IconMountain,
  IconPlaneArrival,
  IconPlaneDeparture,
  IconRoute,
} from "@tabler/icons-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { TooltipRouteSkeleton } from "@/components/skeletons"
import { Badge } from "@/components/ui/badge"
import { useGetFlight } from "@/lib/api/flights/flights"
import type { Aircraft } from "@/lib/api/schemas"
import { flightProgress } from "@/lib/flight-progress"
import {
  formatAltitude,
  formatDistance,
  formatDuration,
  formatHeading,
  formatSpeed,
} from "@/lib/format"
import { useSettled } from "@/lib/hooks"
import { categoryInfo, sourceInfo } from "@/lib/labels"

type Props = {
  aircraft: Aircraft
  x: number
  y: number
  width: number
  height: number
}

const hoverDelayMs = 200
const pointerGap = 18
const edgeGap = 8

export function AircraftTooltip({ aircraft, x, y, width, height }: Props) {
  const callsign = aircraft.callsign ?? ""
  const [ready, setReady] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 320, height: 220 })

  // measure the card so it can flip and clamp inside the map, also when it grows
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () =>
      setBox({ width: el.offsetWidth, height: el.offsetHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setReady(false)
    const t = setTimeout(() => setReady(true), hoverDelayMs)
    return () => clearTimeout(t)
  }, [])

  const flight = useGetFlight(callsign, {
    query: {
      enabled: ready && callsign.length >= 2,
      staleTime: 10 * 60_000,
      retry: false,
    },
  })
  const routeLoading = useSettled(flight.isLoading, 400)
  const route = flight.data?.route
  const progress = flightProgress(aircraft, route)
  const category = categoryInfo[aircraft.category]
  const source = sourceInfo[aircraft.source]
  const CategoryIcon = category.icon
  const SourceIcon = source.icon

  let left = x + pointerGap
  if (left + box.width + edgeGap > width) left = x - pointerGap - box.width
  left = Math.max(edgeGap, Math.min(left, width - box.width - edgeGap))
  let top = y - 12
  if (top + box.height + edgeGap > height) top = y + 12 - box.height
  top = Math.max(edgeGap, Math.min(top, height - box.height - edgeGap))

  return (
    <div
      ref={boxRef}
      className="pointer-events-none absolute z-20 flex w-80 animate-fade-up flex-col gap-2 rounded-lg bg-popover/95 p-3 text-popover-foreground text-sm/relaxed shadow-md ring-1 ring-foreground/10 backdrop-blur"
      style={{ left, top }}
    >
      <div className="flex items-center gap-2">
        <CategoryIcon className="size-4 text-primary" />
        <span className="font-heading font-medium text-sm">
          {callsign || aircraft.icao24.toUpperCase()}
        </span>
        <Badge variant="secondary" className="ml-auto">
          {category.label}
        </Badge>
      </div>

      {flight.data?.airline && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <IconBuildingSkyscraper className="size-3.5" />
          <span className="truncate">{flight.data.airline.name}</span>
        </div>
      )}

      {routeLoading ? (
        <TooltipRouteSkeleton />
      ) : route?.origin || route?.destination ? (
        <div className="flex items-center gap-2">
          <Endpoint
            icon={IconPlaneDeparture}
            code={route.origin?.iata ?? route.origin?.icao}
            city={route.origin?.municipality}
          />
          <IconArrowNarrowRight className="size-4 shrink-0 text-muted-foreground" />
          <Endpoint
            icon={IconPlaneArrival}
            code={route.destination?.iata ?? route.destination?.icao}
            city={route.destination?.municipality}
            align="right"
          />
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <IconRoute className="size-3.5" />
          <span>{callsign ? "No route on record" : "No callsign"}</span>
        </div>
      )}

      {progress && (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round(progress.fraction * 100)}%` }}
            />
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <IconClock className="size-3.5" />
            <span>
              {progress.etaSeconds != null
                ? `${formatDuration(progress.etaSeconds)} left`
                : "ETA unknown"}
              {" · "}
              {formatDistance(progress.remainingKm)} to go
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1 text-muted-foreground">
        <Stat
          icon={IconMountain}
          value={formatAltitude(aircraft.baroAltM, aircraft.onGround)}
        />
        <Stat icon={IconGauge} value={formatSpeed(aircraft.velocityMs)} />
        <Stat icon={IconCompass} value={formatHeading(aircraft.headingDeg)} />
      </div>

      <div className="flex items-center gap-3 text-muted-foreground text-xs">
        <span className="flex items-center gap-1">
          <SourceIcon className="size-3" />
          {source.label}
        </span>
        <span className="flex items-center gap-1">
          <IconHash className="size-3" />
          {aircraft.icao24}
        </span>
        {aircraft.country && (
          <span className="ml-auto truncate">{aircraft.country}</span>
        )}
      </div>
    </div>
  )
}

function Endpoint({
  icon: Icon,
  code,
  city,
  align,
}: {
  icon: typeof IconPlaneDeparture
  code?: string
  city?: string
  align?: "right"
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col ${align === "right" ? "text-right" : ""}`}
    >
      <span className="flex items-center gap-1 font-heading font-medium text-sm">
        <Icon className="size-3.5 text-primary" />
        {code ?? "?"}
      </span>
      <span className="truncate text-muted-foreground">
        {city ?? "Unknown"}
      </span>
    </div>
  )
}

function Stat({
  icon: Icon,
  value,
}: {
  icon: typeof IconMountain
  value: string
}) {
  return (
    <span className="flex items-center gap-1 truncate">
      <Icon className="size-3.5 shrink-0" />
      {value}
    </span>
  )
}
