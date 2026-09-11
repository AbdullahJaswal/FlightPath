import { IconMountain } from "@tabler/icons-react"
import { legendGradient, legendMaxFeet, legendTicks } from "@/lib/altitude"
import { useSettings } from "@/lib/map-settings"

export function AltitudeLegend() {
  const settings = useSettings()
  if (settings.colorBy !== "altitude") return null
  return (
    <div className="pointer-events-auto flex animate-fade-up flex-col gap-1.5 rounded-lg bg-card/90 px-3 py-2 text-[0.625rem] text-muted-foreground shadow-sm ring-1 ring-foreground/10 backdrop-blur">
      <div className="flex items-center gap-1 font-medium">
        <IconMountain className="size-3 text-primary" />
        Altitude
        <span className="ml-auto flex items-center gap-1">
          <span className="size-2 rounded-full bg-muted-foreground" />
          on ground
        </span>
      </div>
      <div
        className="h-1.5 w-44 rounded-full"
        style={{ background: legendGradient }}
      />
      <div className="relative h-3 w-44">
        {legendTicks.map((ft) => (
          <span
            key={ft}
            className="absolute -translate-x-1/2"
            style={{ left: `${(ft / legendMaxFeet) * 100}%` }}
          >
            {ft === 0 ? "0" : `${ft / 1000}k`}
          </span>
        ))}
        <span className="absolute right-0">ft</span>
      </div>
    </div>
  )
}
