import {
  IconBuildingAirport,
  IconCurrentLocation,
  IconFlag,
  IconMapPin,
  IconMountain,
  IconPlane,
  IconWorldLatitude,
  IconX,
} from "@tabler/icons-react"
import { useEffect } from "react"
import { AirportPanelSkeleton } from "@/components/skeletons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { useGetAirport } from "@/lib/api/airports/airports"
import type { Aircraft, Airport } from "@/lib/api/schemas"
import { formatCoords, formatInt, titleCase } from "@/lib/format"
import { haversineKm } from "@/lib/geo"
import { useSettled } from "@/lib/hooks"
import { DetailRow } from "./detail-row"

type Props = {
  code: string
  aircraft: Aircraft[]
  onClose: () => void
  onCenter: (airport: Airport) => void
  onLoaded?: (airport: Airport) => void
}

const nearbyKm = 150

export function AirportPanel({
  code,
  aircraft,
  onClose,
  onCenter,
  onLoaded,
}: Props) {
  const airport = useGetAirport(code, {
    query: { staleTime: 3600_000, retry: false },
  })
  const loading = useSettled(airport.isLoading)
  const data = airport.data
  useEffect(() => {
    if (data) onLoaded?.(data)
  }, [data, onLoaded])
  const nearby = data
    ? aircraft.filter(
        (a) => haversineKm(a.lat, a.lon, data.lat, data.lon) <= nearbyKm
      ).length
    : 0

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
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Center on airport"
              onClick={() => onCenter(data)}
            >
              <IconCurrentLocation />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={onClose}
          >
            <IconX />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 py-3">
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
              {formatInt(nearby)} aircraft within {nearbyKm} km
            </DetailRow>
          </>
        ) : (
          <p className="text-muted-foreground">No airport with code {code}.</p>
        )}
      </CardContent>
    </Card>
  )
}
