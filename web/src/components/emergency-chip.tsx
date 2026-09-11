import { IconAlertTriangle, IconPlane } from "@tabler/icons-react"
import { useMemo } from "react"
import { Hint } from "@/components/hint"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Aircraft } from "@/lib/api/schemas"
import { isEmergency } from "@/lib/filters"
import { emergencySquawks } from "@/lib/labels"

type Props = {
  aircraft: Aircraft[]
  onPick: (aircraft: Aircraft) => void
}

export function EmergencyChip({ aircraft, onPick }: Props) {
  const emergencies = useMemo(() => aircraft.filter(isEmergency), [aircraft])
  if (emergencies.length === 0) return null
  return (
    <DropdownMenu>
      <Hint
        label="Aircraft squawking an emergency, click to list them"
        side="bottom"
      >
        <DropdownMenuTrigger
          render={
            <Button
              variant="destructive"
              size="sm"
              className="animate-fade-up bg-destructive text-white shadow-sm hover:bg-destructive/90 dark:bg-destructive"
            />
          }
        >
          <IconAlertTriangle
            data-icon="inline-start"
            className="animate-pulse"
          />
          {emergencies.length}{" "}
          {emergencies.length === 1 ? "emergency" : "emergencies"}
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Emergency squawks in view</DropdownMenuLabel>
          {emergencies.map((a) => (
            <DropdownMenuItem key={a.icao24} onClick={() => onPick(a)}>
              <IconPlane className="text-destructive" />
              <span className="font-medium">
                {a.callsign || a.icao24.toUpperCase()}
              </span>
              <span className="ml-auto text-muted-foreground">
                {a.squawk} {emergencySquawks[a.squawk ?? ""]}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
