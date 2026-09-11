import { IconBuildingSkyscraper, IconPlane, IconX } from "@tabler/icons-react"
import { Hint } from "@/components/hint"
import { Button } from "@/components/ui/button"
import type { Airline } from "@/lib/api/schemas"

type Props = {
  airline: Airline
  count: number
  onClear: () => void
}

export function AirlineChip({ airline, count, onClear }: Props) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-card py-1 pr-1 pl-3 text-xs shadow-sm ring-1 ring-foreground/10">
      <IconBuildingSkyscraper className="size-3.5 text-primary" />
      <span className="font-medium">{airline.name}</span>
      <span className="text-muted-foreground">{airline.icao}</span>
      <span className="flex items-center gap-1 text-muted-foreground">
        <IconPlane className="size-3.5" />
        {count} in view
      </span>
      <Hint label="Show all airlines again">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Clear airline filter"
          onClick={onClear}
        >
          <IconX />
        </Button>
      </Hint>
    </div>
  )
}
