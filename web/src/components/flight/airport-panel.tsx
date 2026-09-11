import {
  IconBuildingAirport,
  IconCompass,
  IconCurrentLocation,
  IconFlag,
  IconMapPin,
  IconMountain,
  IconPlane,
  IconWorldLatitude,
  IconX,
} from "@tabler/icons-react"
import { useEffect, useMemo } from "react"
import { Hint } from "@/components/hint"
import { AirportPanelSkeleton } from "@/components/skeletons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { useGetAirport } from "@/lib/api/airports/airports"
import type { Aircraft, Airport } from "@/lib/api/schemas"
import {
  formatAltitude,
  formatCoords,
  formatInt,
  titleCase,
} from "@/lib/format"
import { compassPoint, haversineKm, initialBearing } from "@/lib/geo"
import { useSettled } from "@/lib/hooks"
import { categoryInfo } from "@/lib/labels"
import { DetailRow, Section } from "./detail-row"

type Props = {
  code: string
  aircraft: Aircraft[]
  onClose: () => void
  onCenter: (airport: Airport) => void
  onLoaded?: (airport: Airport) => void
  onPickAircraft: (aircraft: Aircraft) => void
}

const nearbyKm = 150
const nearbyRows = 8

export function AirportPanel({
  code,
  aircraft,
  onClose,
  onCenter,
  onLoaded,
  onPickAircraft,
}: Props) {
  const airport = useGetAirport(code, {
    query: { staleTime: 3600_000, retry: false },
  })
  const loading = useSettled(airport.isLoading)
  const data = airport.data
  useEffect(() => {
    if (data) onLoaded?.(data)
  }, [data, onLoaded])
  const nearby = useMemo(() => {
    if (!data) return []
    return aircraft
      .map((a) => ({ a, km: haversineKm(data.lat, data.lon, a.lat, a.lon) }))
      .filter((n) => n.km <= nearbyKm)
      .sort((x, y) => x.km - y.km)
  }, [aircraft, data])

  if (loading) return <AirportPanelSkeleton />

  return (
    <Card
      size="sm"
      className="w-[min(100vw-1.5rem,23rem)] animate-fade-up gap-0 py-0 text-sm/relaxed shadow-md"
    >
      <CardHeader className="border-b py-3">
        <div className="flex items-center gap-2">
          <IconBuildingAirport className="size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-heading font-semibold text-base">
              {data?.name ?? code}
            </div>
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              {data?.iata && <Badge variant="secondary">{data.iata}</Badge>}
              <Badge variant="outline">{data?.icao ?? code}</Badge>
              {data?.type && <span>{titleCase(data.type)}</span>}
            </div>
          </div>
          {data && (
            <Hint label="Center on the airport" side="bottom">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Center on airport"
                onClick={() => onCenter(data)}
              >
                <IconCurrentLocation />
              </Button>
            </Hint>
          )}
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
      <CardContent className="flex max-h-[min(55svh,42rem)] flex-col gap-1.5 overflow-y-auto py-3 sm:max-h-[min(70svh,42rem)]">
        {data ? (
          <>
            <DetailRow icon={IconMapPin} label="Location">
              {[data.municipality, data.country].filter(Boolean).join(", ") ||
                "Unknown"}
            </DetailRow>
            <DetailRow icon={IconFlag} label="Country">
              {data.country ?? "Unknown"}
            </DetailRow>
            <DetailRow icon={IconWorldLatitude} label="Coordinates">
              {formatCoords(data.lat, data.lon)}
            </DetailRow>
            {data.elevationFt != null && (
              <DetailRow icon={IconMountain} label="Elevation">
                {formatInt(data.elevationFt)} ft
              </DetailRow>
            )}
            <DetailRow icon={IconPlane} label="Nearby">
              {formatInt(nearby.length)} aircraft within {nearbyKm} km
            </DetailRow>
            {nearby.length > 0 && (
              <Section icon={IconCompass} title="Closest aircraft">
                <div className="flex flex-col">
                  {nearby.slice(0, nearbyRows).map(({ a, km }) => {
                    const bearing = initialBearing(
                      data.lat,
                      data.lon,
                      a.lat,
                      a.lon
                    )
                    const Icon = categoryInfo[a.category].icon
                    return (
                      <button
                        key={a.icao24}
                        type="button"
                        className="flex items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-muted"
                        onClick={() => onPickAircraft(a)}
                      >
                        <Icon className="size-3.5 shrink-0 text-primary" />
                        <span className="w-16 shrink-0 truncate font-medium">
                          {a.callsign || a.icao24.toUpperCase()}
                        </span>
                        <span className="text-muted-foreground">
                          {formatInt(km)} km {compassPoint(bearing)}
                        </span>
                        <span className="ml-auto truncate text-muted-foreground">
                          {formatAltitude(a.baroAltM, a.onGround)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </Section>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">No airport with code {code}.</p>
        )}
      </CardContent>
    </Card>
  )
}
