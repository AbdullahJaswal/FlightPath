import {
  IconArrowUpRight,
  IconBuildingSkyscraper,
  IconChartBar,
  IconFlag,
  IconGauge,
  IconMountain,
  IconPlane,
  IconPlaneOff,
} from "@tabler/icons-react"
import { useQueries } from "@tanstack/react-query"
import { useMemo } from "react"
import { Hint } from "@/components/hint"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { getGetAirlineQueryOptions } from "@/lib/api/airlines/airlines"
import type { Aircraft } from "@/lib/api/schemas"
import { categoryGroups } from "@/lib/filters"
import {
  formatAltitude,
  formatInt,
  formatSpeed,
  metersToFeet,
} from "@/lib/format"
import type { Icon } from "@/lib/labels"

type Props = {
  aircraft: Aircraft[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (aircraft: Aircraft) => void
}

const altitudeBands = [
  ["Below 10k ft", 0, 10000],
  ["10k to 20k", 10000, 20000],
  ["20k to 30k", 20000, 30000],
  ["30k to 40k", 30000, 40000],
  ["Above 40k", 40000, Number.POSITIVE_INFINITY],
] as const

type Row = { label: string; count: number }

function top(counts: Map<string, number>, n: number): Row[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, count]) => ({ label, count }))
}

function summarise(aircraft: Aircraft[]) {
  const airborne = aircraft.filter((a) => !a.onGround)
  const bands = altitudeBands.map(([label, lo, hi]) => ({
    label,
    count: airborne.filter((a) => {
      const ft = metersToFeet(a.baroAltM ?? 0)
      return ft >= lo && ft < hi
    }).length,
  }))
  const groups = new Map<string, number>()
  for (const g of categoryGroups) groups.set(g.label, 0)
  const countries = new Map<string, number>()
  const airlines = new Map<string, number>()
  let highest: Aircraft | null = null
  let fastest: Aircraft | null = null
  for (const a of aircraft) {
    const g = categoryGroups.find((g) => g.categories.includes(a.category))
    if (g) groups.set(g.label, (groups.get(g.label) ?? 0) + 1)
    if (a.country) countries.set(a.country, (countries.get(a.country) ?? 0) + 1)
    const prefix = a.callsign?.match(/^[A-Z]{3}(?=[0-9A-Z])/)?.[0]
    if (prefix && !a.onGround) {
      airlines.set(prefix, (airlines.get(prefix) ?? 0) + 1)
    }
    if (!a.onGround && (a.baroAltM ?? -1) > (highest?.baroAltM ?? -1)) {
      highest = a
    }
    if (!a.onGround && (a.velocityMs ?? -1) > (fastest?.velocityMs ?? -1)) {
      fastest = a
    }
  }
  return {
    total: aircraft.length,
    airborne: airborne.length,
    ground: aircraft.length - airborne.length,
    bands,
    groups: top(groups, 5).filter((r) => r.count > 0),
    countries: top(countries, 5),
    airlines: top(airlines, 5),
    highest,
    fastest,
  }
}

export function InsightsMenu({ aircraft, open, onOpenChange, onPick }: Props) {
  const stats = useMemo(
    () => (open ? summarise(aircraft) : null),
    [open, aircraft]
  )
  const airlines = useQueries({
    queries: (stats?.airlines ?? []).map((r) => ({
      ...getGetAirlineQueryOptions(r.label),
      staleTime: 3600_000,
      retry: false,
    })),
  })
  const airlineName = (icao: string) =>
    airlines.find((q) => q.data?.icao === icao)?.data?.name
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Hint label="Insights for aircraft in view" keys={["i"]} side="bottom">
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              aria-label="Insights"
              className="bg-card shadow-sm hover:bg-accent dark:bg-card dark:hover:bg-accent"
            />
          }
        >
          <IconChartBar />
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="end" className="w-80">
        {stats && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <IconPlane className="size-4 text-primary" />
              <span className="font-heading font-medium text-sm">
                {formatInt(stats.total)} in view
              </span>
              <span className="ml-auto flex items-center gap-2 text-muted-foreground">
                <span className="flex items-center gap-1">
                  <IconArrowUpRight className="size-3" />
                  {formatInt(stats.airborne)}
                </span>
                <span className="flex items-center gap-1">
                  <IconPlaneOff className="size-3" />
                  {formatInt(stats.ground)}
                </span>
              </span>
            </div>
            <Bars icon={IconMountain} title="Altitude" rows={stats.bands} />
            <Bars icon={IconPlane} title="Types" rows={stats.groups} />
            <Bars
              icon={IconFlag}
              title="Registered in"
              rows={stats.countries}
            />
            <Bars
              icon={IconBuildingSkyscraper}
              title="Airlines"
              rows={stats.airlines.map((r) => ({
                ...r,
                label: airlineName(r.label) ?? r.label,
              }))}
            />
            {(stats.highest || stats.fastest) && (
              <div className="flex flex-col gap-1">
                {stats.highest && (
                  <Record
                    icon={IconMountain}
                    label="Highest"
                    aircraft={stats.highest}
                    value={formatAltitude(stats.highest.baroAltM)}
                    onPick={onPick}
                  />
                )}
                {stats.fastest && (
                  <Record
                    icon={IconGauge}
                    label="Fastest"
                    aircraft={stats.fastest}
                    value={formatSpeed(stats.fastest.velocityMs)}
                    onPick={onPick}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function Bars({
  icon: Icon,
  title,
  rows,
}: {
  icon: Icon
  title: string
  rows: Row[]
}) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  if (rows.length === 0) return null
  return (
    <section className="flex flex-col gap-1">
      <h3 className="flex items-center gap-1.5 font-heading font-medium text-[0.625rem] text-muted-foreground uppercase tracking-wide">
        <Icon className="size-3 text-primary" />
        {title}
      </h3>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate">{r.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-muted-foreground">
            {formatInt(r.count)}
          </span>
        </div>
      ))}
    </section>
  )
}

function Record({
  icon: Icon,
  label,
  aircraft,
  value,
  onPick,
}: {
  icon: Icon
  label: string
  aircraft: Aircraft
  value: string
  onPick: (aircraft: Aircraft) => void
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-muted"
      onClick={() => onPick(aircraft)}
    >
      <Icon className="size-3.5 shrink-0 text-primary" />
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate font-medium">
        {aircraft.callsign || aircraft.icao24.toUpperCase()}
      </span>
      <span className="ml-auto shrink-0 text-muted-foreground">{value}</span>
    </button>
  )
}
