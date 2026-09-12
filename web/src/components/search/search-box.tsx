import {
  IconBuildingAirport,
  IconBuildingSkyscraper,
  IconLiveView,
  IconMoodEmpty,
  IconPlane,
  IconPlaneInflight,
} from "@tabler/icons-react"
import { keepPreviousData } from "@tanstack/react-query"
import { useState } from "react"
import { SearchSkeleton } from "@/components/skeletons"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import type { Aircraft, Airline, Airport } from "@/lib/api/schemas"
import { useSearch } from "@/lib/api/search/search"
import { formatAltitude } from "@/lib/format"
import { useDebounced, useSettled } from "@/lib/hooks"

type Props = {
  onPickAircraft: (aircraft: Aircraft) => void
  onPickAirport: (airport: Airport) => void
  onPickAirline: (airline: Airline) => void
}

export function SearchBox({
  onPickAircraft,
  onPickAirport,
  onPickAirline,
}: Props) {
  const [text, setText] = useState("")
  const q = useDebounced(text.trim(), 300)
  const enabled = q.length >= 2
  const results = useSearch(
    { q },
    {
      query: {
        enabled,
        staleTime: 60_000,
        retry: false,
        placeholderData: keepPreviousData,
      },
    }
  )
  const searching = useSettled(results.isLoading, 400)
  const data = enabled && !searching ? results.data : undefined
  const total =
    (data?.aircraft?.length ?? 0) +
    (data?.airports?.length ?? 0) +
    (data?.airlines?.length ?? 0)

  const pick = (fn: () => void) => {
    fn()
    setText("")
  }

  return (
    <Card
      size="sm"
      className="w-[min(100vw-1.5rem,23rem)] gap-1 py-2 shadow-md"
    >
      <div className="flex items-center gap-2 px-3">
        <IconPlaneInflight className="size-5 text-primary" />
        <span className="font-heading font-semibold text-base tracking-tight">
          FlightPath
        </span>
        <span className="ml-auto flex items-center gap-1 text-[0.625rem] text-muted-foreground uppercase">
          <IconLiveView className="size-3 text-primary" />
          live
        </span>
      </div>
      <Command shouldFilter={false} className="rounded-none bg-transparent p-0">
        <CommandInput
          id="search-input"
          value={text}
          onValueChange={setText}
          placeholder="Callsign, registration, airport or airline"
        />
        {enabled && (
          <CommandList className="animate-fade-up text-sm">
            {searching && <SearchSkeleton />}
            {data && total === 0 && (
              <CommandEmpty>
                <span className="flex items-center justify-center gap-2 text-muted-foreground">
                  <IconMoodEmpty className="size-4" />
                  Nothing matches {q}
                </span>
              </CommandEmpty>
            )}
            {data?.aircraft?.length ? (
              <CommandGroup heading="Aircraft in the air">
                {data.aircraft.map((a) => (
                  <CommandItem
                    key={a.icao24}
                    value={`aircraft:${a.icao24}`}
                    onSelect={() => pick(() => onPickAircraft(a))}
                  >
                    <IconPlane className="text-primary" />
                    <span className="font-medium">
                      {a.callsign || a.icao24}
                    </span>
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
          </CommandList>
        )}
      </Command>
    </Card>
  )
}
