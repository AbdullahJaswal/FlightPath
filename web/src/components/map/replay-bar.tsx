import {
  IconHistory,
  IconPlayerPause,
  IconPlayerPlay,
  IconX,
} from "@tabler/icons-react"
import { Hint } from "@/components/hint"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatInt } from "@/lib/format"
import { replaySpeeds } from "@/lib/replay"

type Props = {
  from: number
  to: number
  time: number
  playing: boolean
  speed: number
  count: number
  loading: boolean
  empty: boolean
  onSeek: (time: number) => void
  onPlay: () => void
  onSpeed: (speed: number) => void
  onClose: () => void
}

const clock = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
})

export function ReplayBar({
  from,
  to,
  time,
  playing,
  speed,
  count,
  loading,
  empty,
  onSeek,
  onPlay,
  onSpeed,
  onClose,
}: Props) {
  const span = Math.max(1, to - from)
  return (
    <div className="pointer-events-auto flex w-[min(100vw-1.5rem,32rem)] animate-fade-up flex-col gap-2 rounded-lg bg-card px-3 py-2 text-xs shadow-md ring-1 ring-foreground/10">
      <div className="flex items-center gap-2">
        <IconHistory className="size-4 text-primary" />
        <span className="font-heading font-medium text-sm">Replay</span>
        <span className="text-muted-foreground">last hour in this area</span>
        <span className="ml-auto text-muted-foreground">
          {loading ? "" : `${formatInt(count)} aircraft`}
        </span>
        <Hint label="Back to live" keys={["r"]}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close replay"
            onClick={onClose}
          >
            <IconX />
          </Button>
        </Hint>
      </div>
      {loading ? (
        <div className="flex items-center gap-2" aria-busy>
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="h-2 flex-1 rounded-full" />
          <Skeleton className="h-3 w-16" />
        </div>
      ) : empty ? (
        <p className="text-muted-foreground">
          No stored tracks here yet. Tracks build up while aircraft are watched.
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <Hint label={playing ? "Pause" : "Play"}>
            <Button
              variant="outline"
              size="icon"
              aria-label={playing ? "Pause" : "Play"}
              onClick={onPlay}
            >
              {playing ? <IconPlayerPause /> : <IconPlayerPlay />}
            </Button>
          </Hint>
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(((time - from) / span) * 1000)}
            onChange={(e) =>
              onSeek(from + (Number(e.target.value) / 1000) * span)
            }
            aria-label="Replay position"
            className="h-1.5 flex-1 cursor-pointer accent-primary"
          />
          <span className="w-16 text-right font-medium">
            {clock.format(new Date(time))}
          </span>
          <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
            {replaySpeeds.map((s) => (
              <button
                key={s}
                type="button"
                className={`rounded px-1.5 py-0.5 text-[0.625rem] ${s === speed ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => onSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
