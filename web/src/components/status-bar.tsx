import {
  IconAlertTriangle,
  IconClock,
  IconLoader2,
  IconPlane,
  IconUsers,
  IconWifi,
  IconWifiOff,
} from "@tabler/icons-react"
import { StatusSkeleton } from "@/components/skeletons"
import { useGetStats } from "@/lib/api/stats/stats"
import { formatAge, formatInt } from "@/lib/format"
import { useNow } from "@/lib/hooks"
import { pollerModeInfo } from "@/lib/labels"
import { useLive } from "@/lib/live"

export function StatusBar() {
  const live = useLive()
  const stats = useGetStats({
    query: { refetchInterval: 15_000, staleTime: 5_000 },
  })
  const now = useNow(1000)
  const frame = live.frame
  const age = frame ? frame.ageSeconds + (now - live.receivedAt) / 1000 : null
  const stale = frame?.stale ?? false
  const mode = stats.data ? pollerModeInfo[stats.data.poller.mode] : null
  const ConnectionIcon =
    live.status === "open"
      ? IconWifi
      : live.status === "reconnecting"
        ? IconWifiOff
        : IconLoader2

  if (!frame) {
    return (
      <div className="flex items-center rounded-lg bg-card px-3 py-2 shadow-sm ring-1 ring-foreground/10">
        <StatusSkeleton />
      </div>
    )
  }

  return (
    <div className="flex animate-fade-up flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-card px-3 py-1.5 text-muted-foreground text-sm shadow-sm ring-1 ring-foreground/10">
      <span
        className="flex items-center gap-1"
        title="Aircraft in view and tracked worldwide"
      >
        <IconPlane className="size-3.5 text-primary" />
        {`${formatInt(frame.total)} in view`}
        {stats.data && (
          <span className="hidden sm:inline">
            {" · "}
            {formatInt(stats.data.aircraftCount)} tracked
          </span>
        )}
      </span>
      {age != null && (
        <span
          className={`flex items-center gap-1 ${stale ? "text-destructive" : ""}`}
          title="Age of the latest position snapshot"
        >
          {stale ? (
            <IconAlertTriangle className="size-3.5" />
          ) : (
            <IconClock className="size-3.5" />
          )}
          {stale ? "stale, " : ""}
          {formatAge(age)}
        </span>
      )}
      {stats.data && (
        <span
          className="hidden items-center gap-1 md:flex"
          title="Viewers connected"
        >
          <IconUsers className="size-3.5" />
          {formatInt(stats.data.viewers)}
        </span>
      )}
      {mode && (
        <span className="hidden items-center gap-1 lg:flex" title={mode.label}>
          <mode.icon className="size-3.5" />
          {stats.data?.poller.mode === "active"
            ? `every ${stats.data.poller.intervalSeconds}s`
            : mode.label}
        </span>
      )}
      <span
        className="flex items-center gap-1"
        title={`Live stream ${live.status}`}
      >
        <ConnectionIcon
          className={`size-3.5 ${live.status === "open" ? "text-primary" : ""} ${live.status === "connecting" ? "animate-spin" : ""}`}
        />
      </span>
    </div>
  )
}
