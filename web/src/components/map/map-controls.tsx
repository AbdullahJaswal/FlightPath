import {
  IconCurrentLocation,
  IconHistory,
  IconKeyboard,
  IconMap2,
  IconRulerMeasure,
  IconWorld,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from "@tabler/icons-react"
import { Hint } from "@/components/hint"
import { Button } from "@/components/ui/button"
import { LayersMenu } from "./layers-menu"
import { defaultView, type MapView, maxZoom, minZoom } from "./live-map"
import { MapStyleMenu } from "./map-style-menu"

type Props = {
  view: MapView
  onViewChange: (view: MapView) => void
  onLocate: () => void
  measuring: boolean
  onMeasure: () => void
  onShortcuts: () => void
  globe: boolean
  onGlobe: () => void
  replay: boolean
  onReplay: () => void
}

const pressed = "bg-primary/15 text-primary"

export function MapControls({
  view,
  onViewChange,
  onLocate,
  measuring,
  onMeasure,
  onShortcuts,
  globe,
  onGlobe,
  replay,
  onReplay,
}: Props) {
  const zoomBy = (factor: number) =>
    onViewChange({
      ...view,
      zoom: Math.min(maxZoom, Math.max(minZoom, view.zoom * factor)),
    })

  return (
    <div className="flex flex-row items-center rounded-lg bg-card p-1 shadow-sm ring-1 ring-foreground/10 sm:flex-col">
      <Hint label={globe ? "Flat map" : "Globe view"} keys={["g"]} side="left">
        <Button
          variant="ghost"
          size="icon"
          aria-label={globe ? "Flat map" : "Globe view"}
          aria-pressed={globe}
          className={globe ? pressed : ""}
          onClick={onGlobe}
        >
          {globe ? <IconMap2 /> : <IconWorld />}
        </Button>
      </Hint>
      {!globe && <MapStyleMenu />}
      <LayersMenu />
      <div className="mx-1 h-5 w-px bg-border sm:mx-0 sm:my-1 sm:h-px sm:w-5" />
      <Hint label="Zoom in" keys={["+"]} side="left">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom in"
          onClick={() => zoomBy(2)}
        >
          <IconZoomIn />
        </Button>
      </Hint>
      <Hint label="Zoom out" keys={["-"]} side="left">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom out"
          onClick={() => zoomBy(0.5)}
        >
          <IconZoomOut />
        </Button>
      </Hint>
      <Hint label="Reset the view" keys={["0"]} side="left">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Reset view"
          onClick={() => onViewChange(defaultView)}
        >
          <IconZoomReset />
        </Button>
      </Hint>
      <Hint label="Go to my location" keys={["l"]} side="left">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Go to my location"
          onClick={onLocate}
        >
          <IconCurrentLocation />
        </Button>
      </Hint>
      <div className="mx-1 h-5 w-px bg-border sm:mx-0 sm:my-1 sm:h-px sm:w-5" />
      <Hint label="Measure a distance" keys={["m"]} side="left">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Measure distance"
          aria-pressed={measuring}
          className={measuring ? pressed : ""}
          disabled={globe}
          onClick={onMeasure}
        >
          <IconRulerMeasure />
        </Button>
      </Hint>
      <Hint label="Replay the last hour" keys={["r"]} side="left">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Replay the last hour"
          aria-pressed={replay}
          className={replay ? pressed : ""}
          onClick={onReplay}
        >
          <IconHistory />
        </Button>
      </Hint>
      <Hint label="Keyboard shortcuts" keys={["?"]} side="left">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Keyboard shortcuts"
          onClick={onShortcuts}
        >
          <IconKeyboard />
        </Button>
      </Hint>
    </div>
  )
}
