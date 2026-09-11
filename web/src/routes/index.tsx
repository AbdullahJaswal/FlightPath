import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { z } from "zod"
import { AircraftPanel } from "@/components/flight/aircraft-panel"
import { AirlineChip } from "@/components/flight/airline-chip"
import { AirportPanel } from "@/components/flight/airport-panel"
import { LoadingBar } from "@/components/loading-bar"
import {
  baseMapUrl,
  defaultView,
  LiveMap,
  type MapView,
} from "@/components/map/live-map"
import { MapControls } from "@/components/map/map-controls"
import { SearchBox } from "@/components/search/search-box"
import { SiteFooter } from "@/components/site-footer"
import { StatusBar } from "@/components/status-bar"
import { ThemeMenu } from "@/components/theme-menu"
import { useGetAircraft } from "@/lib/api/aircraft/aircraft"
import { useGetFlight } from "@/lib/api/flights/flights"
import type { Aircraft, Airline, Airport } from "@/lib/api/schemas"
import { getGetStatsQueryOptions } from "@/lib/api/stats/stats"
import { livePosition } from "@/lib/flight-progress"
import { live, useLive, type Viewport } from "@/lib/live"
import { loadMapStyle, mapStyles, useMapStyle } from "@/lib/map-styles"

const searchSchema = z.object({
  aircraft: z
    .string()
    .regex(/^[0-9a-fA-F]{6}$/)
    .optional(),
  airport: z
    .string()
    .regex(/^[A-Za-z0-9]{3,4}$/)
    .optional(),
})

export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
  head: () => ({
    links: [
      {
        rel: "preload",
        href: baseMapUrl,
        as: "fetch",
        crossOrigin: "anonymous",
      },
    ],
  }),
  loader: ({ context }) =>
    context.queryClient.prefetchQuery(getGetStatsQueryOptions()),
  component: Landing,
})

const aircraftZoom = 40
const airportZoom = 96

function Landing() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const state = useLive()

  useEffect(() => {
    loadMapStyle()
    live.open()
    return () => live.close()
  }, [])
  const [mapStyle] = useMapStyle()
  const attribution = mapStyles.find((s) => s.id === mapStyle)?.tiles
    ?.attribution

  const [view, setView] = useState<MapView>(defaultView)
  const [highlight, setHighlight] = useState<Airline | null>(null)
  const [pendingFocus, setPendingFocus] = useState<string | null>(
    () => search.aircraft?.toLowerCase() ?? null
  )
  const [pendingAirport, setPendingAirport] = useState<string | null>(
    () => search.airport?.toUpperCase() ?? null
  )

  const aircraft = useMemo(() => state.frame?.aircraft ?? [], [state.frame])
  const selectedId = search.aircraft?.toLowerCase() ?? null
  const airportCode = search.airport?.toUpperCase() ?? null

  const detail = useGetAircraft(selectedId ?? "", {
    query: {
      enabled: selectedId !== null,
      refetchInterval: 30_000,
      retry: false,
    },
  })
  const inView = useMemo(
    () =>
      selectedId
        ? (aircraft.find((a) => a.icao24 === selectedId) ?? null)
        : null,
    [aircraft, selectedId]
  )
  const selected = inView ?? detail.data?.state ?? null
  const callsign = selected?.callsign ?? ""
  const flight = useGetFlight(callsign, {
    query: {
      enabled: callsign.length >= 2,
      staleTime: 10 * 60_000,
      retry: false,
    },
  })

  useEffect(() => {
    if (pendingFocus && selected?.icao24 === pendingFocus) {
      setView({
        center: livePosition(selected, Date.now() - state.clockOffsetMs),
        zoom: aircraftZoom,
      })
      setPendingFocus(null)
    }
  }, [pendingFocus, selected, state.clockOffsetMs])

  const select = useCallback(
    (a: Aircraft | null) =>
      navigate({
        search: (prev) => ({ ...prev, aircraft: a?.icao24 }),
        replace: true,
      }),
    [navigate]
  )
  const showAirport = useCallback(
    (code: string | null) =>
      navigate({
        search: (prev) => ({ ...prev, airport: code ?? undefined }),
        replace: true,
      }),
    [navigate]
  )
  const onBounds = useCallback((b: Viewport) => live.setViewport(b), [])

  const focus = (lon: number, lat: number, zoom: number) =>
    setView({ center: [lon, lat], zoom })
  const centerOn = (a: Aircraft) => {
    const [lon, lat] = livePosition(a, Date.now() - state.clockOffsetMs)
    focus(lon, lat, aircraftZoom)
  }
  const pickAircraft = (a: Aircraft) => {
    select(a)
    centerOn(a)
  }
  const pickAirport = (a: Airport) => {
    select(null)
    showAirport(a.icao)
    focus(a.lon, a.lat, airportZoom)
  }

  const highlightCount = highlight
    ? aircraft.filter((a) => a.callsign?.startsWith(highlight.icao)).length
    : 0

  return (
    <main className="relative h-svh w-full overflow-hidden">
      <LoadingBar active={!state.frame} />
      <LiveMap
        aircraft={aircraft}
        clockOffsetMs={state.clockOffsetMs}
        selectedId={selectedId}
        selectedPosition={selected ? [selected.lon, selected.lat] : undefined}
        route={flight.data?.route}
        trail={detail.data?.trail ?? null}
        highlightPrefix={highlight?.icao ?? null}
        view={view}
        onViewChange={setView}
        onBounds={onBounds}
        onSelect={select}
      />
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-3 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="pointer-events-auto">
            <SearchBox
              onPickAircraft={pickAircraft}
              onPickAirport={pickAirport}
              onPickAirline={setHighlight}
            />
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <StatusBar />
            <ThemeMenu />
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
          <div className="pointer-events-auto flex min-w-0 flex-col items-start gap-2">
            {highlight && (
              <AirlineChip
                airline={highlight}
                count={highlightCount}
                onClear={() => setHighlight(null)}
              />
            )}
            {selectedId ? (
              <AircraftPanel
                icao24={selectedId}
                live={selected}
                detail={detail.data}
                detailPending={detail.isLoading}
                flight={flight.data}
                flightPending={flight.isLoading}
                onClose={() => select(null)}
                onCenter={() => selected && centerOn(selected)}
              />
            ) : airportCode ? (
              <AirportPanel
                code={airportCode}
                aircraft={aircraft}
                onClose={() => showAirport(null)}
                onCenter={(a) => focus(a.lon, a.lat, airportZoom)}
                onLoaded={(a) => {
                  if (!pendingAirport) return
                  setPendingAirport(null)
                  focus(a.lon, a.lat, airportZoom)
                }}
              />
            ) : null}
          </div>
          <div className="pointer-events-auto flex flex-row items-end justify-end gap-2 sm:flex-col">
            <MapControls view={view} onViewChange={setView} />
            <SiteFooter attribution={attribution} />
          </div>
        </div>
      </div>
    </main>
  )
}
