import { IconStack2 } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { type MapStyleId, mapStyles, useMapStyle } from "@/lib/map-styles"

export function MapStyleMenu() {
  const [style, setStyle] = useMapStyle()
  const active = mapStyles.find((s) => s.id === style) ?? mapStyles[0]
  const ActiveIcon = active?.icon ?? IconStack2

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="Map style" />}
      >
        <ActiveIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="left" className="w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Map style</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={style}
            onValueChange={(v) => setStyle(v as MapStyleId)}
          >
            {mapStyles.map((s) => (
              <DropdownMenuRadioItem key={s.id} value={s.id}>
                <s.icon />
                {s.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
