import {
  IconAlertTriangle,
  IconFilter,
  IconFilterOff,
  IconMountain,
  IconPlaneInflight,
} from "@tabler/icons-react"
import { Hint } from "@/components/hint"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  type AltitudeFilter,
  activeFilterCount,
  altitudeFilters,
  categoryGroups,
  defaultFilters,
  type Filters,
  type GroundFilter,
  type GroupId,
  groundFilters,
} from "@/lib/filters"

type Props = {
  filters: Filters
  onChange: (filters: Filters) => void
}

const allGroups = categoryGroups.map((g) => g.id)

export function FiltersMenu({ filters, onChange }: Props) {
  const active = activeFilterCount(filters)
  const groupChecked = (id: GroupId) =>
    filters.groups.length === 0 || filters.groups.includes(id)
  const toggleGroup = (id: GroupId) => {
    const current = filters.groups.length === 0 ? allGroups : filters.groups
    const next = current.includes(id)
      ? current.filter((g) => g !== id)
      : [...current, id]
    onChange({
      ...filters,
      groups: next.length === allGroups.length ? [] : next,
    })
  }

  return (
    <DropdownMenu>
      <Hint label="Filter aircraft" side="bottom">
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              aria-label="Filter aircraft"
              className="relative bg-card shadow-sm hover:bg-accent dark:bg-card dark:hover:bg-accent"
            />
          }
        >
          <IconFilter />
          {active > 0 && (
            <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary font-medium text-[0.625rem] text-primary-foreground">
              {active}
            </span>
          )}
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-1">
            <IconPlaneInflight className="size-3" />
            Aircraft types
          </DropdownMenuLabel>
          {categoryGroups.map((g) => (
            <DropdownMenuCheckboxItem
              key={g.id}
              checked={groupChecked(g.id)}
              onCheckedChange={() => toggleGroup(g.id)}
              closeOnClick={false}
            >
              <g.icon />
              {g.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-1">
            <IconMountain className="size-3" />
            Altitude
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={filters.altitude}
            onValueChange={(v) =>
              onChange({ ...filters, altitude: v as AltitudeFilter })
            }
          >
            {altitudeFilters.map((a) => (
              <DropdownMenuRadioItem
                key={a.id}
                value={a.id}
                closeOnClick={false}
              >
                {a.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuRadioGroup
            value={filters.ground}
            onValueChange={(v) =>
              onChange({ ...filters, ground: v as GroundFilter })
            }
          >
            {groundFilters.map((g) => (
              <DropdownMenuRadioItem
                key={g.id}
                value={g.id}
                closeOnClick={false}
              >
                {g.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={filters.emergency}
          onCheckedChange={(v) => onChange({ ...filters, emergency: v })}
          closeOnClick={false}
        >
          <IconAlertTriangle />
          Emergency squawks only
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={active === 0}
          onClick={() => onChange(defaultFilters)}
        >
          <IconFilterOff />
          Clear filters
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
