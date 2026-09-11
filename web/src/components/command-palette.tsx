import {
  IconBuildingAirport,
  IconBuildingSkyscraper,
  IconCheck,
  IconMoodEmpty,
  IconPlane,
} from "@tabler/icons-react"
import { keepPreviousData } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Keys } from "@/components/keys"
import { SearchSkeleton } from "@/components/skeletons"
import { Badge } from "@/components/ui/badge"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { type Action, actionGroups, matchesQuery } from "@/lib/actions"
import type { Aircraft, Airline, Airport } from "@/lib/api/schemas"
import { useSearch } from "@/lib/api/search/search"
import { formatAltitude } from "@/lib/format"
import { useDebounced, useSettled } from "@/lib/hooks"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: Action[]
  onPickAircraft: (aircraft: Aircraft) => void
  onPickAirport: (airport: Airport) => void
  onPickAirline: (airline: Airline) => void
}

export function CommandPalette({
  open,
  onOpenChange,
  actions,
  onPickAircraft,
  onPickAirport,
  onPickAirline,
}: Props) {
  const [text, setText] = useState("")
  useEffect(() => {
    if (open) setText("")
  }, [open])
  const q = useDebounced(text.trim(), 250)
  const searchable = q.length >= 2
  const results = useSearch(
    { q },
    {
      query: {
        enabled: open && searchable,
        staleTime: 60_000,
        retry: false,
        placeholderData: keepPreviousData,
      },
    }
  )
  const searching = useSettled(searchable && results.isLoading, 300)
  const data = searchable && !searching ? results.data : undefined
  const hits =
    (data?.aircraft?.length ?? 0) +
    (data?.airports?.length ?? 0) +
    (data?.airlines?.length ?? 0)
  const visible = actions.filter(
    (a) => !a.hidden && matchesQuery(a, text.trim())
  )
  const close = () => onOpenChange(false)
  const pick = (fn: () => void) => {
    close()
    fn()
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Search flights or run a command"
      className="sm:max-w-lg"
    >
      <Command shouldFilter={false}>
        <CommandInput
          value={text}
          onValueChange={setText}
          placeholder="Search flights or type a command"
        />
        <CommandList className="max-h-96">
          {searching && <SearchSkeleton />}
          {data?.aircraft?.length ? (
            <CommandGroup heading="Aircraft in the air">
              {data.aircraft.map((a) => (
                <CommandItem
                  key={a.icao24}
                  value={`aircraft:${a.icao24}`}
                  onSelect={() => pick(() => onPickAircraft(a))}
                >
                  <IconPlane className="text-primary" />
                  <span className="font-medium">{a.callsign || a.icao24}</span>
                  <span className="truncate text-muted-foreground">
                    {[a.country, formatAltitude(a.baroAltM, a.onGround)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {data?.airports?.length ? (
            <CommandGroup heading="Airports">
              {data.airports.map((a) => (
                <CommandItem
                  key={a.icao}
                  value={`airport:${a.icao}`}
                  onSelect={() => pick(() => onPickAirport(a))}
                >
                  <IconBuildingAirport className="text-primary" />
                  <Badge variant="secondary">{a.iata ?? a.icao}</Badge>
                  <span className="truncate font-medium">{a.name}</span>
                  <span className="truncate text-muted-foreground">
                    {[a.municipality, a.country].filter(Boolean).join(", ")}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {data?.airlines?.length ? (
            <CommandGroup heading="Airlines">
              {data.airlines.map((a) => (
                <CommandItem
                  key={a.icao}
                  value={`airline:${a.icao}`}
                  onSelect={() => pick(() => onPickAirline(a))}
                >
                  <IconBuildingSkyscraper className="text-primary" />
                  <Badge variant="secondary">{a.icao}</Badge>
                  <span className="truncate font-medium">{a.name}</span>
                  <span className="truncate text-muted-foreground">
                    {a.country}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {actionGroups.map((group) => {
            const items = visible.filter((a) => a.group === group)
            if (items.length === 0) return null
            return (
              <CommandGroup key={group} heading={group}>
                {items.map((a) => (
                  <CommandItem
                    key={a.id}
                    value={a.id}
                    disabled={a.disabled}
                    onSelect={() => pick(a.run)}
                  >
                    <a.icon className="text-primary" />
                    <span>{a.label}</span>
                    {a.checked && (
                      <IconCheck className="size-3.5 text-muted-foreground" />
                    )}
                    {a.keys && <Keys keys={a.keys} />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )
          })}
          {visible.length === 0 && !searching && hits === 0 && (
            <CommandEmpty>
              <span className="flex items-center justify-center gap-2 text-muted-foreground">
                <IconMoodEmpty className="size-4" />
                Nothing matches {text.trim()}
              </span>
            </CommandEmpty>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
