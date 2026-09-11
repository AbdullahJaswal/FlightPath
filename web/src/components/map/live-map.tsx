import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  ComposableMap,
  ZoomableGroup,
  type ZoomPanCallbackProps,
} from "react-simple-maps"
import countries50 from "world-atlas/countries-50m.json?url"
import countries110 from "world-atlas/countries-110m.json?url"
import type { Aircraft, Route, TrailPoint } from "@/lib/api/schemas"
import type { Viewport } from "@/lib/live"
import { BaseLayer } from "./base-layer"
import { BaseMapSync } from "./base-map-sync"
import { createMapStore } from "./map-store"
import { MapSync } from "./map-sync"
import { PlanesOverlay } from "./planes-overlay"
import { RouteLayer } from "./route-layer"

export type MapView = { center: [number, number]; zoom: number }

export const defaultView: MapView = { center: [10, 30], zoom: 1 }
export const minZoom = 1
export const maxZoom = 160
export const baseMapUrl = countries110
const detailZoom = 5

type Props = {
  aircraft: Aircraft[]
  clockOffsetMs: number
  selectedId: string | null
  selectedPosition?: [number, number]
  route?: Route
  trail: TrailPoint[] | null
  highlightPrefix: string | null
  view: MapView
  onViewChange: (view: MapView) => void
  onBounds: (bounds: Viewport) => void
  onSelect: (aircraft: Aircraft | null) => void
}

export function LiveMap({
  aircraft,
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
  const store = useMemo(() => createMapStore(), [])
  const [size, setSize] = useState({ width: 1280, height: 720 })
  const [detail, setDetail] = useState(false)

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
        clockOffsetMs={clockOffsetMs}
        selectedId={selectedId}
        highlightPrefix={highlightPrefix}
        trail={trail}
        onSelect={onSelect}
        width={size.width}
        height={size.height}
      />
    </div>
  )
}
