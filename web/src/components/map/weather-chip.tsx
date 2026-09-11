import { IconCloudRain } from "@tabler/icons-react"
import { useSettings } from "@/lib/map-settings"
import { useRadar } from "@/lib/rainviewer"

const time = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
})

export function WeatherChip() {
  const settings = useSettings()
  const radar = useRadar()
  if (!settings.weather) return null
  const frame = radar.frames[radar.index]
  return (
    <div className="pointer-events-auto flex animate-fade-up items-center gap-2 rounded-lg bg-card/90 px-2.5 py-1.5 text-[0.625rem] text-muted-foreground shadow-sm ring-1 ring-foreground/10 backdrop-blur">
      <IconCloudRain className="size-3 text-primary" />
      <span className="font-medium text-foreground">Radar</span>
      <span>
        {frame ? time.format(new Date(frame.time * 1000)) : "loading"}
      </span>
      <span className="flex items-center gap-0.5">
        {radar.frames.map((f, i) => (
          <span
            key={f.time}
            className={`size-1 rounded-full ${i === radar.index ? "bg-primary" : "bg-muted-foreground/40"}`}
          />
        ))}
      </span>
    </div>
  )
}
