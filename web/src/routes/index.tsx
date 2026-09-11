import { IconCommand } from "@tabler/icons-react"
import { keepPreviousData } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { z } from "zod"
import { EmergencyChip } from "@/components/emergency-chip"
import { FiltersMenu } from "@/components/filters-menu"
import { AircraftPanel } from "@/components/flight/aircraft-panel"
import { AirlineChip } from "@/components/flight/airline-chip"
import { AirportPanel } from "@/components/flight/airport-panel"
import { FilterChip } from "@/components/flight/filter-chip"
import { Hint } from "@/components/hint"
import { InsightsMenu } from "@/components/insights-menu"
import { LoadingBar } from "@/components/loading-bar"
import { AltitudeLegend } from "@/components/map/altitude-legend"
import {
  baseMapUrl,
  defaultView,
  LiveMap,
  type MapView,
  maxZoom,
  minZoom,
} from "@/components/map/live-map"
import { MapControls } from "@/components/map/map-controls"
import {
  createMapStore,
  globeMaxZoom,
  globeMinZoom,
  type MapStore,
} from "@/components/map/map-store"
import { OverviewMap } from "@/components/map/overview-map"
import type { HoverTarget } from "@/components/map/planes-layer"
import { ReplayBar } from "@/components/map/replay-bar"
import { ScaleBar } from "@/components/map/scale-bar"
import { WeatherChip } from "@/components/map/weather-chip"
import { SearchBox } from "@/components/search/search-box"
import { SiteFooter } from "@/components/site-footer"
import { StatusBar } from "@/components/status-bar"
import { ThemeMenu } from "@/components/theme-menu"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { useGetAircraft, useGetHistory } from "@/lib/api/aircraft/aircraft"
import { useListAirports } from "@/lib/api/airports/airports"
import { useGetFlight } from "@/lib/api/flights/flights"
import type { Aircraft, Airline, Airport } from "@/lib/api/schemas"
import { getGetStatsQueryOptions } from "@/lib/api/stats/stats"
import {
  activeFilterCount,
  applyFilters,
  defaultFilters,
  type Filters,
} from "@/lib/filters"
import { livePosition } from "@/lib/flight-progress"
import { useFlyTo } from "@/lib/fly-to"
import { live, maxAircraft, useLive, type Viewport } from "@/lib/live"
import { buildActions } from "@/lib/map-actions"
import {
  loadSettings,
  setSetting,
  toggleSetting,
  useSettings,
} from "@/lib/map-settings"
import { loadMapStyle, mapStyles, useMapStyle } from "@/lib/map-styles"
import {
  parseTracks,
  positionsAt,
  replayLimit,
  replayMinutes,
  trackUntil,
} from "@/lib/replay"
import { useShortcuts } from "@/lib/use-shortcuts"

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

// heavy or rarely used pieces load on first use
const GlobeMap = lazy(() => import("@/components/map/globe-map"))
const CommandPalette = lazy(() =>
  import("@/components/command-palette").then((m) => ({
    default: m.CommandPalette,
  }))
)
const ShortcutsDialog = lazy(() =>
  import("@/components/shortcuts-dialog").then((m) => ({
    default: m.ShortcutsDialog,
  }))
)

const aircraftZoom = 40
const airportZoom = 96
const locateZoom = 16
// map zoom from which airport markers are fetched, matching the layer
const airportLayerZoom = 6
const replayFps = 20
const noAirports: Airport[] = []

// grows a box to whole degrees so small pans reuse the cached airports
function coarse(b: Viewport): Viewport {
  return {
    west: Math.floor(b.west),
    south: Math.max(-90, Math.floor(b.south)),
    east: Math.ceil(b.east),
    north: Math.min(90, Math.ceil(b.north)),
  }
}

function Landing() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const go = useNavigate()
  const state = useLive()
  const theme = useTheme()
  const settings = useSettings()
  const [mapStyle, setMapStyle] = useMapStyle()
  const mapStore = useMemo(() => createMapStore(), [])
  const [globeStore, setGlobeStore] = useState<MapStore | null>(null)
  const globe = settings.globe
  const store = (globe && globeStore) || mapStore

  useEffect(() => {
    loadMapStyle()
    loadSettings()
    live.open()
    return () => live.close()
  }, [])
  const attribution = mapStyles.find((s) => s.id === mapStyle)?.tiles
    ?.attribution

  const [view, setView] = useState<MapView>(defaultView)
  const { flyTo, cancel: cancelFlight } = useFlyTo(view, setView)
  const [highlight, setHighlight] = useState<Airline | null>(null)
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [follow, setFollow] = useState(false)
  const [measuring, setMeasuring] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteSeen, setPaletteSeen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [shortcutsSeen, setShortcutsSeen] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [replay, setReplay] = useState(false)
  const [replayBounds, setReplayBounds] = useState<Viewport | null>(null)
  const [replayOffset, setReplayOffset] = useState(0)
  const [replayPlaying, setReplayPlaying] = useState(true)
  const [replaySpeed, setReplaySpeed] = useState(120)
  const [airportBounds, setAirportBounds] = useState<Viewport | null>(null)
  const boundsRef = useRef<Viewport | null>(null)
  const [pendingFocus, setPendingFocus] = useState<string | null>(
    () => search.aircraft?.toLowerCase() ?? null
  )
  const [pendingAirport, setPendingAirport] = useState<string | null>(
    () => search.airport?.toUpperCase() ?? null
  )

  const allAircraft = useMemo(() => state.frame?.aircraft ?? [], [state.frame])
  const aircraft = useMemo(
    () => applyFilters(allAircraft, filters),
    [allAircraft, filters]
  )
  const activeFilters = activeFilterCount(filters)
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
        ? (allAircraft.find((a) => a.icao24 === selectedId) ?? null)
        : null,
    [allAircraft, selectedId]
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

  // keep the camera on the followed aircraft, dead reckoned like the icon
  useEffect(() => {
    if (!follow || !inView) return
    const tick = () =>
      setView((v) => ({
        center: livePosition(inView, Date.now() - state.clockOffsetMs),
        zoom: v.zoom,
      }))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [follow, inView, state.clockOffsetMs])

  const select = useCallback(
    (a: Aircraft | null) => {
      setFollow(false)
      navigate({
        search: (prev) => ({ ...prev, aircraft: a?.icao24 }),
        replace: true,
      })
    },
    [navigate]
  )
  const showAirport = useCallback(
    (code: string | null) => {
      setFollow(false)
      navigate({
        search: (prev) => ({
          ...prev,
          airport: code ?? undefined,
          aircraft: code ? undefined : prev.aircraft,
        }),
        replace: true,
      })
    },
    [navigate]
  )
  const onSelect = useCallback(
    (target: HoverTarget | null) => {
      if (target?.kind === "airport") showAirport(target.airport.icao)
      else select(target?.aircraft ?? null)
    },
    [select, showAirport]
  )
  const zoomedForAirports = view.zoom * (globe ? 1.6 : 1) >= airportLayerZoom
  const onBounds = useCallback(
    (b: Viewport) => {
      boundsRef.current = b
      // zoomed out, icons overlap anyway, so a thinner snapshot is enough
      live.setViewport(b, store.get().k < 2 ? 2000 : maxAircraft)
      const next = coarse(b)
      setAirportBounds((prev) =>
        prev &&
        prev.west === next.west &&
        prev.east === next.east &&
        prev.south === next.south &&
        prev.north === next.north
          ? prev
          : next
      )
    },
    [store]
  )
  const airportList = useListAirports(
    { ...airportBounds, limit: 300 },
    {
      query: {
        enabled:
          settings.airports && zoomedForAirports && airportBounds !== null,
        staleTime: 300_000,
        retry: false,
        placeholderData: keepPreviousData,
      },
    }
  )
  const airports =
    settings.airports && zoomedForAirports
      ? (airportList.data?.airports ?? noAirports)
      : noAirports

  const history = useGetHistory(
    { ...replayBounds, minutes: replayMinutes, limit: replayLimit },
    {
      query: {
        enabled: replay && replayBounds !== null,
        staleTime: 60_000,
        retry: false,
      },
    }
  )
  const tracks = useMemo(
    () => parseTracks(history.data?.tracks),
    [history.data]
  )
  const replayFrom = history.data ? Date.parse(history.data.from) : 0
  const replayTo = history.data ? Date.parse(history.data.to) : 0
  const replayTime = replayFrom + replayOffset
  useEffect(() => {
    if (!replay || !replayPlaying || replayTo <= replayFrom) return
    const span = replayTo - replayFrom
    let last = performance.now()
    const t = setInterval(() => {
      const now = performance.now()
      const dt = now - last
      last = now
      setReplayOffset((o) => (o + dt * replaySpeed) % span)
    }, 1000 / replayFps)
    return () => clearInterval(t)
  }, [replay, replayPlaying, replaySpeed, replayFrom, replayTo])
  const replayAircraft = useMemo(
    () => (replay ? positionsAt(tracks, replayTime) : null),
    [replay, tracks, replayTime]
  )
  const toggleReplay = () => {
    if (replay) {
      setReplay(false)
      return
    }
    setFollow(false)
    setReplayBounds(boundsRef.current)
    setReplayOffset(0)
    setReplayPlaying(true)
    setReplay(true)
  }
  const onUserView = useCallback(
    (v: MapView) => {
      cancelFlight()
      setFollow(false)
      setView(v)
    },
    [cancelFlight]
  )
  const onControlView = useCallback(
    (v: MapView) => {
      cancelFlight()
      setView(v)
    },
    [cancelFlight]
  )

  const focus = (lon: number, lat: number, zoom: number) => {
    setFollow(false)
    flyTo({ center: [lon, lat], zoom })
  }
  const centerOn = (a: Aircraft) => {
    const [lon, lat] = livePosition(a, Date.now() - state.clockOffsetMs)
    focus(lon, lat, Math.max(view.zoom, aircraftZoom))
  }
  const pickAircraft = (a: Aircraft) => {
    select(a)
    centerOn(a)
  }
  const pickAirport = (a: Airport) => {
    showAirport(a.icao)
    focus(a.lon, a.lat, airportZoom)
  }
  const zoomBy = (factor: number) =>
    onControlView({
      ...view,
      zoom: globe
        ? Math.min(globeMaxZoom, Math.max(globeMinZoom, view.zoom * factor))
        : Math.min(maxZoom, Math.max(minZoom, view.zoom * factor)),
    })
  const locate = () =>
    navigator.geolocation?.getCurrentPosition((pos) =>
      focus(pos.coords.longitude, pos.coords.latitude, locateZoom)
    )
  const pan = (dx: number, dy: number) => {
    const s = store.get()
    const c = store.unproject(
      s.width / 2 + dx * s.width,
      s.height / 2 + dy * s.height
    )
    if (c)
      onUserView({
        center: [c[0], Math.max(-85, Math.min(85, c[1]))],
        zoom: view.zoom,
      })
  }
  const closeTopmost = () => {
    if (paletteOpen || shortcutsOpen || insightsOpen) {
      setPaletteOpen(false)
      setShortcutsOpen(false)
      setInsightsOpen(false)
      return
    }
    if (measuring) setMeasuring(false)
    else if (selectedId) select(null)
    else if (airportCode) showAirport(null)
    else if (highlight) setHighlight(null)
  }

  const openPalette = (open = true) => {
    if (open) setPaletteSeen(true)
    setPaletteOpen(open)
  }
  const openShortcuts = (open = true) => {
    if (open) setShortcutsSeen(true)
    setShortcutsOpen(open)
  }

  const actions = buildActions({
    zoomBy,
    reset: () => {
      setFollow(false)
      flyTo(defaultView)
    },
    locate,
    pan,
    focusSearch: () => document.getElementById("search-input")?.focus(),
    selected,
    centerOn: () => selected && centerOn(selected),
    follow,
    toggleFollow: () => selected && setFollow((f) => !f),
    escape: closeTopmost,
    settings,
    toggle: toggleSetting,
    toggleAltitude: () =>
      setSetting(
        "colorBy",
        settings.colorBy === "altitude" ? "accent" : "altitude"
      ),
    measuring,
    toggleMeasure: () => setMeasuring((m) => !m),
    replay,
    toggleReplay,
    openInsights: () => setInsightsOpen((o) => !o),
    openShortcuts: () => openShortcuts(),
    clearFilters: () => setFilters(defaultFilters),
    filtersActive: activeFilters > 0,
    mapStyle,
    setMapStyle,
    mode: theme.mode,
    setMode: theme.setMode,
    scheme: theme.scheme,
    setScheme: theme.setScheme,
    go: (to) => go({ to }),
  })
  const shortcuts = [
    ...actions,
    {
      id: "palette",
      label: "Command palette",
      group: "Help",
      icon: IconCommand,
      keys: ["mod", "k"],
      hidden: true,
      run: () => openPalette(!paletteOpen),
    },
  ]
  useShortcuts(shortcuts)

  const highlightCount = highlight
    ? aircraft.filter((a) => a.callsign?.startsWith(highlight.icao)).length
    : 0

  // the selected aircraft stays on the map even when a filter hides it
  const shown = useMemo(() => {
    if (replayAircraft) return replayAircraft
    if (!inView || aircraft.includes(inView)) return aircraft
    return [...aircraft, inView]
  }, [aircraft, inView, replayAircraft])
  const trail =
    replay && selectedId
      ? trackUntil(tracks, selectedId, replayTime)
      : (detail.data?.trail ?? null)

  return (
    <main className="relative h-svh w-full overflow-hidden">
      <LoadingBar active={!state.frame} />
      {globe ? (
        <Suspense fallback={null}>
          <GlobeMap
            onStore={setGlobeStore}
            aircraft={shown}
            airports={airports}
            clockOffsetMs={state.clockOffsetMs}
            selectedId={selectedId}
            selectedPosition={
              selected ? [selected.lon, selected.lat] : undefined
            }
            route={flight.data?.route}
            trail={trail}
            highlightPrefix={highlight?.icao ?? null}
            view={view}
            onViewChange={onUserView}
            onBounds={onBounds}
            onSelect={onSelect}
          />
        </Suspense>
      ) : (
        <LiveMap
          store={mapStore}
          measuring={measuring}
          aircraft={shown}
          airports={airports}
          clockOffsetMs={state.clockOffsetMs}
          selectedId={selectedId}
          selectedPosition={selected ? [selected.lon, selected.lat] : undefined}
          route={flight.data?.route}
          trail={trail}
          highlightPrefix={highlight?.icao ?? null}
          view={view}
          onViewChange={onUserView}
          onBounds={onBounds}
          onSelect={onSelect}
        />
      )}
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
            <EmergencyChip aircraft={aircraft} onPick={pickAircraft} />
            <StatusBar />
            <InsightsMenu
              aircraft={aircraft}
              open={insightsOpen}
              onOpenChange={setInsightsOpen}
              onPick={pickAircraft}
            />
            <FiltersMenu filters={filters} onChange={setFilters} />
            <Hint label="Command palette" keys={["mod", "k"]} side="bottom">
              <Button
                variant="outline"
                size="icon"
                aria-label="Command palette"
                className="bg-card shadow-sm hover:bg-accent dark:bg-card dark:hover:bg-accent"
                onClick={() => openPalette()}
              >
                <IconCommand />
              </Button>
            </Hint>
            <ThemeMenu />
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
          <div className="pointer-events-auto flex min-w-0 flex-col items-start gap-2">
            {activeFilters > 0 && (
              <FilterChip
                shown={aircraft.length}
                total={allAircraft.length}
                active={activeFilters}
                onClear={() => setFilters(defaultFilters)}
              />
            )}
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
                following={follow}
                onFollow={() => setFollow((f) => !f)}
              />
            ) : airportCode ? (
              <AirportPanel
                code={airportCode}
                aircraft={allAircraft}
                onClose={() => showAirport(null)}
                onCenter={(a) => focus(a.lon, a.lat, airportZoom)}
                onLoaded={(a) => {
                  if (!pendingAirport) return
                  setPendingAirport(null)
                  focus(a.lon, a.lat, airportZoom)
                }}
                onPickAircraft={pickAircraft}
              />
            ) : null}
          </div>
          <div className="pointer-events-none flex flex-wrap items-end justify-center gap-2 sm:self-end">
            {replay ? (
              <ReplayBar
                from={replayFrom}
                to={replayTo}
                time={replayTime}
                playing={replayPlaying}
                speed={replaySpeed}
                count={replayAircraft?.length ?? 0}
                loading={history.isLoading}
                empty={!history.isLoading && tracks.length === 0}
                onSeek={(t) => setReplayOffset(t - replayFrom)}
                onPlay={() => setReplayPlaying((p) => !p)}
                onSpeed={setReplaySpeed}
                onClose={() => setReplay(false)}
              />
            ) : (
              <>
                {!globe && <ScaleBar store={mapStore} />}
                {!globe && <WeatherChip />}
                <AltitudeLegend />
              </>
            )}
          </div>
          <div className="pointer-events-auto flex flex-col items-end gap-2">
            {!globe && (
              <OverviewMap
                store={mapStore}
                onJump={(center) => onControlView({ center, zoom: view.zoom })}
              />
            )}
            <MapControls
              view={view}
              onViewChange={onControlView}
              onLocate={locate}
              measuring={measuring}
              onMeasure={() => setMeasuring((m) => !m)}
              onShortcuts={() => openShortcuts()}
              globe={globe}
              onGlobe={() => {
                setMeasuring(false)
                toggleSetting("globe")
              }}
              replay={replay}
              onReplay={toggleReplay}
            />
            <SiteFooter
              attribution={globe ? undefined : attribution}
              weather={!globe && settings.weather}
            />
          </div>
        </div>
      </div>
      {paletteSeen && (
        <Suspense fallback={null}>
          <CommandPalette
            open={paletteOpen}
            onOpenChange={openPalette}
            actions={actions}
            onPickAircraft={pickAircraft}
            onPickAirport={pickAirport}
            onPickAirline={setHighlight}
          />
        </Suspense>
      )}
      {shortcutsSeen && (
        <Suspense fallback={null}>
          <ShortcutsDialog
            open={shortcutsOpen}
            onOpenChange={openShortcuts}
            actions={shortcuts}
          />
        </Suspense>
      )}
    </main>
  )
}
