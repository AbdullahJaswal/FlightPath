import {
  IconArrowNarrowRight,
  IconBuilding,
  IconBuildingSkyscraper,
  IconCalendar,
  IconCalendarClock,
  IconClock,
  IconCompass,
  IconCurrentLocation,
  IconDoor,
  IconFlag,
  IconFocusCentered,
  IconGauge,
  IconHash,
  IconHourglass,
  IconIdBadge2,
  IconMapPin,
  IconMountain,
  IconPlane,
  IconPlaneArrival,
  IconPlaneDeparture,
  IconPlaneOff,
  IconRoute,
  IconRulerMeasure,
  IconTicket,
  IconTimeline,
  IconTools,
  IconTrendingDown,
  IconTrendingUp,
  IconUser,
  IconX,
} from "@tabler/icons-react"
import { useState } from "react"
import { Hint } from "@/components/hint"
import {
  AircraftPanelSkeleton,
  RouteSkeleton,
  RowSkeleton,
  ScheduleSkeleton,
  SectionSkeleton,
} from "@/components/skeletons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { useGetFlightSchedule } from "@/lib/api/flights/flights"
import type {
  Aircraft,
  AircraftDetail,
  Airport,
  FlightDetail,
  ScheduleEndpoint,
} from "@/lib/api/schemas"
import { useGetStats } from "@/lib/api/stats/stats"
import { flightProgress } from "@/lib/flight-progress"
import {
  flightLevel,
  formatAge,
  formatAltitude,
  formatCoords,
  formatDate,
  formatDistance,
  formatDuration,
  formatHeading,
  formatInt,
  formatSpeed,
  formatSpeedKmh,
  formatVerticalRate,
  formatWallTime,
  secondsSince,
} from "@/lib/format"
import { useNow, useSettled } from "@/lib/hooks"
import {
  categoryInfo,
  emergencySquawks,
  sourceInfo,
  statusInfo,
} from "@/lib/labels"
import { ApiError } from "@/lib/server/bff-fetch"
import { AircraftPhoto } from "./aircraft-photo"
import { DetailRow, Section } from "./detail-row"

type Props = {
  icao24: string
  live: Aircraft | null
  detail?: AircraftDetail
  detailPending: boolean
  flight?: FlightDetail
  flightPending: boolean
  onClose: () => void
  onCenter: () => void
  following: boolean
  onFollow: () => void
}

export function AircraftPanel({
  icao24,
  live,
  detail,
  detailPending,
  flight,
  flightPending,
  onClose,
  onCenter,
  following,
  onFollow,
}: Props) {
  const booting = useSettled(!live && detailPending)
  const routeLoading = useSettled(flightPending)
  const infoLoading = useSettled(detailPending)
  const now = useNow(1000)
  if (booting) return <AircraftPanelSkeleton />
  const callsign = live?.callsign ?? flight?.callsign ?? ""
  const info = detail?.info ?? flight?.aircraft
  const route = flight?.route
  const progress = live ? flightProgress(live, route) : null
  const category = live ? categoryInfo[live.category] : null
  const source = live ? sourceInfo[live.source] : null
  const squawkAlert = live?.squawk ? emergencySquawks[live.squawk] : undefined
  const trail = detail?.trail ?? []
  const firstPoint = trail[0]
  const lastPoint = trail[trail.length - 1]

  return (
    <Card
      size="sm"
      className="flex max-h-[min(55svh,42rem)] w-[min(100vw-1.5rem,23rem)] animate-fade-up flex-col gap-0 py-0 text-sm/relaxed shadow-md sm:max-h-[min(70svh,42rem)]"
    >
      <AircraftPhoto icao24={icao24} />
      <CardHeader className="shrink-0 border-b py-3">
        <div className="flex items-center gap-2">
          <IconPlane className="size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-heading font-semibold text-base">
                {callsign || icao24.toUpperCase()}
              </span>
              {flight?.airline && (
                <span className="truncate text-muted-foreground">
                  {flight.airline.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <IconHash className="size-3" />
              {icao24}
              {info?.registration && (
                <>
                  <span>·</span>
                  <IconIdBadge2 className="size-3" />
                  {info.registration}
                </>
              )}
            </div>
          </div>
          <Hint
            label="Keep the map on this aircraft"
            keys={["f"]}
            side="bottom"
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Follow aircraft"
              aria-pressed={following}
              className={following ? "bg-primary/15 text-primary" : ""}
              disabled={!live}
              onClick={onFollow}
            >
              <IconFocusCentered />
            </Button>
          </Hint>
          <Hint label="Center on the aircraft" keys={["c"]} side="bottom">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Center on aircraft"
              onClick={onCenter}
            >
              <IconCurrentLocation />
            </Button>
          </Hint>
          <Hint label="Close" keys={["esc"]} side="bottom">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              onClick={onClose}
            >
              <IconX />
            </Button>
          </Hint>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-col gap-4 overflow-y-auto py-3">
        <div className="flex flex-wrap gap-1">
          {category && (
            <Badge variant="secondary">
              <category.icon data-icon="inline-start" />
              {category.label}
            </Badge>
          )}
          {live?.onGround && (
            <Badge variant="outline">
              <IconPlaneOff data-icon="inline-start" />
              On ground
            </Badge>
          )}
          {source && (
            <Badge variant="outline">
              <source.icon data-icon="inline-start" />
              {source.label}
            </Badge>
          )}
          {live?.squawk && (
            <Badge variant={squawkAlert ? "destructive" : "outline"}>
              <IconHash data-icon="inline-start" />
              {live.squawk}
              {squawkAlert ? ` ${squawkAlert}` : ""}
            </Badge>
          )}
          {live?.country && (
            <Badge variant="outline">
              <IconFlag data-icon="inline-start" />
              {live.country}
            </Badge>
          )}
        </div>

        {!live && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <IconPlaneOff className="size-3.5" />
            Not in the current snapshot
          </p>
        )}

        <Section icon={IconRoute} title="Route">
          {routeLoading ? (
            <RouteSkeleton />
          ) : route?.origin || route?.destination ? (
            <div className="flex animate-fade-up flex-col gap-2">
              <div className="flex items-start gap-2">
                <RouteEndpoint
                  icon={IconPlaneDeparture}
                  airport={route.origin}
                />
                <IconArrowNarrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                <RouteEndpoint
                  icon={IconPlaneArrival}
                  airport={route.destination}
                  align="right"
                />
              </div>
              {progress && (
                <div className="flex flex-col gap-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{
                        width: `${Math.round(progress.fraction * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <IconRulerMeasure className="size-3.5" />
                      {formatDistance(progress.flownKm)} flown
                    </span>
                    <span className="flex items-center gap-1">
                      <IconClock className="size-3.5" />
                      {progress.etaSeconds != null
                        ? `${formatDuration(progress.etaSeconds)} left`
                        : `${formatDistance(progress.remainingKm)} to go`}
                    </span>
                  </div>
                </div>
              )}
              <DetailRow icon={IconRulerMeasure} label="Great circle">
                {formatDistance(
                  progress?.totalKm ??
                    routeDistance(route.origin, route.destination)
                )}
              </DetailRow>
            </div>
          ) : (
            <p className="text-muted-foreground">
              {callsign
                ? "No route on record for this callsign."
                : "No callsign, so no route lookup."}
            </p>
          )}
        </Section>

        {live && (
          <Section icon={IconGauge} title="Live">
            <DetailRow
              icon={IconMountain}
              label="Altitude"
              hint={flightLevel(live.baroAltM) ?? undefined}
            >
              {formatAltitude(live.baroAltM, live.onGround)}
            </DetailRow>
            {live.geoAltM != null && !live.onGround && (
              <DetailRow icon={IconMountain} label="GNSS altitude">
                {formatAltitude(live.geoAltM)}
              </DetailRow>
            )}
            <DetailRow
              icon={IconGauge}
              label="Ground speed"
              hint={formatSpeedKmh(live.velocityMs)}
            >
              {formatSpeed(live.velocityMs)}
            </DetailRow>
            <DetailRow
              icon={
                (live.vertRateMs ?? 0) < 0 ? IconTrendingDown : IconTrendingUp
              }
              label="Vertical rate"
            >
              {formatVerticalRate(live.vertRateMs)}
            </DetailRow>
            <DetailRow icon={IconCompass} label="Heading">
              {formatHeading(live.headingDeg)}
            </DetailRow>
            <DetailRow icon={IconMapPin} label="Position">
              {formatCoords(live.lat, live.lon)}
            </DetailRow>
            <DetailRow icon={IconClock} label="Position age">
              {formatAge(secondsSince(live.positionAt, now))}
            </DetailRow>
          </Section>
        )}

        <Section icon={IconPlane} title="Aircraft">
          {infoLoading ? (
            <SectionSkeleton rows={4} title="w-0" />
          ) : info ? (
            <div className="flex animate-fade-up flex-col gap-1.5">
              {info.registration && (
                <DetailRow icon={IconIdBadge2} label="Registration">
                  {info.registration}
                </DetailRow>
              )}
              {(info.typeCode || info.model) && (
                <DetailRow
                  icon={IconPlane}
                  label="Type"
                  hint={info.typeCode && info.model ? info.typeCode : undefined}
                >
                  {info.model ?? info.typeCode}
                </DetailRow>
              )}
              {info.manufacturer && (
                <DetailRow icon={IconTools} label="Manufacturer">
                  {info.manufacturer}
                </DetailRow>
              )}
              {(info.operator || info.operatorIcao) && (
                <DetailRow
                  icon={IconBuilding}
                  label="Operator"
                  hint={info.operatorIcao}
                >
                  {info.operator ?? info.operatorIcao}
                </DetailRow>
              )}
              {info.owner && info.owner !== info.operator && (
                <DetailRow icon={IconUser} label="Owner">
                  {info.owner}
                </DetailRow>
              )}
              {flight?.airline && (
                <DetailRow
                  icon={IconBuildingSkyscraper}
                  label="Airline"
                  hint={flight.airline.iata ?? flight.airline.icao}
                >
                  {flight.airline.name}
                </DetailRow>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">
              No registry entry for this address.
            </p>
          )}
        </Section>

        <Section icon={IconTimeline} title="Trail">
          {infoLoading ? (
            <RowSkeleton index={2} />
          ) : trail.length > 1 && firstPoint && lastPoint ? (
            <DetailRow icon={IconTimeline} label="Recorded" hint="stored">
              {formatInt(trail.length)} points over{" "}
              {formatDuration(
                secondsSince(firstPoint.time, Date.parse(lastPoint.time))
              )}
            </DetailRow>
          ) : (
            <p className="text-muted-foreground">
              No trail yet, it grows while the aircraft stays in view.
            </p>
          )}
        </Section>

        <ScheduleSection callsign={callsign} />
      </CardContent>
    </Card>
  )
}

function routeDistance(a?: Airport, b?: Airport) {
  if (!a || !b) return 0
  return (
    flightProgress(
      { lat: a.lat, lon: a.lon },
      { origin: a, destination: b, source: "adsbdb" }
    )?.totalKm ?? 0
  )
}

function RouteEndpoint({
  icon: Icon,
  airport,
  align,
}: {
  icon: typeof IconPlaneDeparture
  airport?: Airport
  align?: "right"
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col ${align === "right" ? "text-right" : ""}`}
    >
      <span className="flex items-center gap-1 font-heading font-semibold text-base">
        <Icon className="size-4 text-primary" />
        {airport?.iata ?? airport?.icao ?? "?"}
      </span>
      <span className="truncate text-foreground">
        {airport?.name ?? "Unknown"}
      </span>
      <span className="truncate text-muted-foreground">
        {[airport?.municipality, airport?.country].filter(Boolean).join(", ")}
      </span>
    </div>
  )
}

function ScheduleSection({ callsign }: { callsign: string }) {
  const [wanted, setWanted] = useState(false)
  const stats = useGetStats({ query: { staleTime: 15_000 } })
  const quota = stats.data?.aviationstack
  const schedule = useGetFlightSchedule(callsign, {
    query: {
      enabled: wanted && callsign.length >= 2,
      retry: false,
      staleTime: 6 * 3600_000,
    },
  })
  const scheduleLoading = useSettled(schedule.isLoading, 600)
  const data = schedule.data
  const status = data ? statusInfo[data.status] : null
  if (quota && !quota.enabled) return null

  return (
    <Section icon={IconCalendarClock} title="Schedule">
      {!wanted || !callsign ? (
        <div className="flex flex-col gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={!callsign}
            onClick={() => setWanted(true)}
          >
            <IconCalendarClock data-icon="inline-start" />
            Load schedule
          </Button>
        </div>
      ) : scheduleLoading ? (
        <ScheduleSkeleton />
      ) : schedule.error ? (
        <p className="text-muted-foreground">{scheduleError(schedule.error)}</p>
      ) : data && status ? (
        <div className="flex animate-fade-up flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant={status.variant}>
              <status.icon data-icon="inline-start" />
              {status.label}
            </Badge>
            {data.flightIata && (
              <Badge variant="outline">
                <IconTicket data-icon="inline-start" />
                {data.flightIata}
              </Badge>
            )}
            <Badge variant="outline">
              <IconCalendar data-icon="inline-start" />
              {formatDate(data.flightDate) ?? data.flightDate}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ScheduleTimes
              icon={IconPlaneDeparture}
              title="Departure"
              endpoint={data.departure}
            />
            <ScheduleTimes
              icon={IconPlaneArrival}
              title="Arrival"
              endpoint={data.arrival}
            />
          </div>
        </div>
      ) : null}
    </Section>
  )
}

function ScheduleTimes({
  icon: Icon,
  title,
  endpoint,
}: {
  icon: typeof IconPlaneDeparture
  title: string
  endpoint: ScheduleEndpoint
}) {
  const scheduled = formatWallTime(endpoint.scheduled)
  const estimated = formatWallTime(endpoint.estimated)
  const actual = formatWallTime(endpoint.actual)
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1 font-medium">
        <Icon className="size-3.5 text-primary" />
        {title}
        <span className="text-muted-foreground">
          {endpoint.iata ?? endpoint.icao}
        </span>
      </span>
      {scheduled && (
        <TimeLine icon={IconClock} label="Scheduled" value={scheduled} />
      )}
      {estimated && estimated !== scheduled && (
        <TimeLine icon={IconHourglass} label="Estimated" value={estimated} />
      )}
      {actual && <TimeLine icon={IconClock} label="Actual" value={actual} />}
      {(endpoint.terminal || endpoint.gate) && (
        <TimeLine
          icon={IconDoor}
          label={endpoint.terminal ? `T${endpoint.terminal}` : "Gate"}
          value={endpoint.gate ?? ""}
        />
      )}
      {endpoint.delayMin != null && endpoint.delayMin > 0 && (
        <TimeLine
          icon={IconHourglass}
          label="Delay"
          value={`${endpoint.delayMin} min`}
        />
      )}
    </div>
  )
}

function TimeLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof IconClock
  label: string
  value: string
}) {
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <Icon className="size-3" />
      {label}
      <span className="ml-auto text-foreground">{value}</span>
    </span>
  )
}

function scheduleError(err: unknown) {
  if (err instanceof ApiError && err.status === 404) {
    return "No schedule found for this flight."
  }
  return "Schedule unavailable right now."
}
