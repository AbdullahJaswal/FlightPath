import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  ComposableMap,
  ZoomableGroup,
  type ZoomPanCallbackProps,
} from "react-simple-maps"
import countries50 from "world-atlas/countries-50m.json?url"
import countries110 from "world-atlas/countries-110m.json?url"
import type { Aircraft, Airport, Route, TrailPoint } from "@/lib/api/schemas"
import type { Viewport } from "@/lib/live"
import { useSettings } from "@/lib/map-settings"
import { BaseLayer } from "./base-layer"
import { BaseMapSync } from "./base-map-sync"
import type { MapStore } from "./map-store"
import { MapSync } from "./map-sync"
import { MeasureLayer } from "./measure-layer"
import { OverlayLayer } from "./overlay-layer"
import type { HoverTarget } from "./planes-layer"
import { PlanesOverlay } from "./planes-overlay"
import { RadarLayer } from "./radar-layer"
import { RouteLayer } from "./route-layer"

export type MapView = { center: [number, number]; zoom: number }

export const defaultView: MapView = { center: [10, 30], zoom: 1 }
export const minZoom = 1
export const maxZoom = 160
export const baseMapUrl = countries110
const detailZoom = 5

type Props = {
  store: MapStore
  measuring: boolean
  aircraft: Aircraft[]
  airports: Airport[]
  clockOffsetMs: number
  selectedId: string | null
  selectedPosition?: [number, number]
  route?: Route
  trail: TrailPoint[] | null
  highlightPrefix: string | null
  view: MapView
  onViewChange: (view: MapView) => void
  onBounds: (bounds: Viewport) => void
  onSelect: (target: HoverTarget | null) => void
}

export function LiveMap({
  store,
  measuring,
  aircraft,
  airports,
  clockOffsetMs,
  selectedId,
  selectedPosition,
  route,
  trail,
  highlightPrefix,
  view,
  onViewChange,
  onBounds,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 1280, height: 720 })
  const [detail, setDetail] = useState(false)
  const settings = useSettings()

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect && rect.width > 0 && rect.height > 0) {
        setSize({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // world width equals the longer viewport side at zoom 1
  const scale = Math.max(size.width, size.height) / (2 * Math.PI)
  const projectionConfig = useMemo(() => ({ scale }), [scale])
  // wrap east to west freely, stop at the poles
  const extent = useMemo<[[number, number], [number, number]]>(() => {
    const half = Math.PI * scale
    const cy = size.height / 2
    return [
      [Number.NEGATIVE_INFINITY, cy - half],
      [Number.POSITIVE_INFINITY, cy + half],
    ]
  }, [scale, size])

  const onMoveEnd = useCallback(
    ({ coordinates, zoom }: ZoomPanCallbackProps) => {
      if (!coordinates || zoom == null) return
      onViewChange({ center: coordinates, zoom })
      setDetail(zoom >= detailZoom)
    },
    [onViewChange]
  )

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 touch-none select-none overflow-hidden bg-background"
    >
      <BaseLayer store={store} />
      <OverlayLayer store={store} aircraft={aircraft} />
      {settings.weather && <RadarLayer store={store} />}
      <ComposableMap
        width={size.width}
        height={size.height}
        projection="geoMercator"
        projectionConfig={projectionConfig}
        className="absolute inset-0 block h-full w-full"
      >
        <BaseMapSync
          store={store}
          geography={detail ? countries50 : countries110}
        />
        <ZoomableGroup
          center={view.center}
          zoom={view.zoom}
          minZoom={minZoom}
          maxZoom={maxZoom}
          translateExtent={extent}
          onMoveEnd={onMoveEnd}
        >
          <RouteLayer
            origin={route?.origin}
            destination={route?.destination}
            position={selectedPosition}
          />
          <MapSync store={store} onBounds={onBounds} />
        </ZoomableGroup>
      </ComposableMap>
      <PlanesOverlay
        containerRef={containerRef}
        store={store}
        aircraft={aircraft}
        airports={airports}
        clockOffsetMs={clockOffsetMs}
        selectedId={selectedId}
        highlightPrefix={highlightPrefix}
        trail={trail}
        interactive={!measuring}
        onSelect={onSelect}
        width={size.width}
        height={size.height}
      />
      <MeasureLayer store={store} active={measuring} />
    </div>
  )
}
