import {
  IconCurrentLocation,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { defaultView, type MapView, maxZoom, minZoom } from "./live-map"
import { MapStyleMenu } from "./map-style-menu"

type Props = {
  view: MapView
  onViewChange: (view: MapView) => void
}

export function MapControls({ view, onViewChange }: Props) {
  const zoomBy = (factor: number) =>
    onViewChange({
      ...view,
      zoom: Math.min(maxZoom, Math.max(minZoom, view.zoom * factor)),
    })

  const locate = () => {
    navigator.geolocation?.getCurrentPosition((pos) =>
      onViewChange({
        center: [pos.coords.longitude, pos.coords.latitude],
        zoom: 16,
      })
    )
  }

  return (
    <div className="flex flex-row items-center rounded-lg bg-card p-1 shadow-sm ring-1 ring-foreground/10 sm:flex-col">
      <MapStyleMenu />
      <div className="mx-1 h-5 w-px bg-border sm:mx-0 sm:my-1 sm:h-px sm:w-5" />
      <Button
        variant="ghost"
        size="icon"
        aria-label="Zoom in"
        onClick={() => zoomBy(2)}
      >
        <IconZoomIn />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Zoom out"
        onClick={() => zoomBy(0.5)}
      >
        <IconZoomOut />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Reset view"
        onClick={() => onViewChange(defaultView)}
      >
        <IconZoomReset />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Go to my location"
        onClick={locate}
      >
        <IconCurrentLocation />
      </Button>
    </div>
  )
}
