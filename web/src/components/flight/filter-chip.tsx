import { IconFilter, IconPlane, IconX } from "@tabler/icons-react"
import { Hint } from "@/components/hint"
import { Button } from "@/components/ui/button"
import { formatInt } from "@/lib/format"

type Props = {
  shown: number
  total: number
  active: number
  onClear: () => void
}

export function FilterChip({ shown, total, active, onClear }: Props) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-card py-1 pr-1 pl-3 text-xs shadow-sm ring-1 ring-foreground/10">
      <IconFilter className="size-3.5 text-primary" />
      <span className="font-medium">
        {active} {active === 1 ? "filter" : "filters"}
      </span>
      <span className="flex items-center gap-1 text-muted-foreground">
        <IconPlane className="size-3.5" />
        {formatInt(shown)} of {formatInt(total)} shown
      </span>
      <Hint label="Clear filters">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Clear filters"
          onClick={onClear}
        >
          <IconX />
        </Button>
      </Hint>
    </div>
  )
}
