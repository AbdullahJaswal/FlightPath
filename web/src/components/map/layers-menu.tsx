import {
  IconBuildingAirport,
  IconCloudRain,
  IconFlame,
  IconMap,
  IconMountain,
  IconPalette,
  IconPlaneTilt,
  IconStack2,
  IconSunMoon,
} from "@tabler/icons-react"
import { Hint } from "@/components/hint"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Icon } from "@/lib/labels"
import {
  type MapSettings,
  setSetting,
  type ToggleKey,
  toggleSetting,
  useSettings,
} from "@/lib/map-settings"

const overlays: { key: ToggleKey; label: string; icon: Icon }[] = [
  { key: "terminator", label: "Day and night", icon: IconSunMoon },
  { key: "weather", label: "Weather radar", icon: IconCloudRain },
  { key: "heatmap", label: "Density glow", icon: IconFlame },
  { key: "airports", label: "Airports", icon: IconBuildingAirport },
  { key: "overview", label: "Overview map", icon: IconMap },
]

export function LayersMenu() {
  const settings = useSettings()
  return (
    <DropdownMenu>
      <Hint label="Layers and aircraft colours" side="left">
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label="Layers" />}
        >
          <IconStack2 />
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" side="left" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Layers</DropdownMenuLabel>
          {overlays.map((o) => (
            <DropdownMenuCheckboxItem
              key={o.key}
              checked={settings[o.key]}
              onCheckedChange={() => toggleSetting(o.key)}
            >
              <o.icon />
              {o.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Aircraft</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={settings.shapes}
            onCheckedChange={() => toggleSetting("shapes")}
          >
            <IconPlaneTilt />
            Shapes by type
          </DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup
            value={settings.colorBy}
            onValueChange={(v) =>
              setSetting("colorBy", v as MapSettings["colorBy"])
            }
          >
            <DropdownMenuRadioItem value="accent">
              <IconPalette />
              Accent colour
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="altitude">
              <IconMountain />
              Colour by altitude
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
