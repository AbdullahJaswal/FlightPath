import {
  IconArrowsMove,
  IconBuildingAirport,
  IconChartBar,
  IconCloudRain,
  IconCurrentLocation,
  IconDeviceDesktop,
  IconFilterOff,
  IconFlame,
  IconFocusCentered,
  IconHistory,
  IconInfoCircle,
  IconKeyboard,
  IconMap,
  IconMoon,
  IconMountain,
  IconPalette,
  IconPlaneTilt,
  IconRulerMeasure,
  IconScale,
  IconSearch,
  IconShieldLock,
  IconSun,
  IconSunMoon,
  IconTarget,
  IconWorld,
  IconX,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from "@tabler/icons-react"
import type { Action } from "./actions"
import type { Aircraft } from "./api/schemas"
import type { MapSettings, ToggleKey } from "./map-settings"
import { type MapStyleId, mapStyles } from "./map-styles"
import { type Mode, type Scheme, schemes } from "./schemes"

export type Page = "/about" | "/terms" | "/privacy"

export type ActionDeps = {
  zoomBy: (factor: number) => void
  reset: () => void
  locate: () => void
  pan: (dx: number, dy: number) => void
  focusSearch: () => void
  selected: Aircraft | null
  centerOn: () => void
  follow: boolean
  toggleFollow: () => void
  escape: () => void
  settings: MapSettings
  toggle: (key: ToggleKey) => void
  toggleAltitude: () => void
  measuring: boolean
  toggleMeasure: () => void
  replay: boolean
  toggleReplay: () => void
  openInsights: () => void
  openShortcuts: () => void
  clearFilters: () => void
  filtersActive: boolean
  mapStyle: MapStyleId
  setMapStyle: (id: MapStyleId) => void
  mode: Mode
  setMode: (mode: Mode) => void
  scheme: Scheme
  setScheme: (scheme: Scheme) => void
  go: (to: Page) => void
}

const modes: { id: Mode; label: string; icon: typeof IconSun }[] = [
  { id: "light", label: "Light theme", icon: IconSun },
  { id: "dark", label: "Dark theme", icon: IconMoon },
  { id: "system", label: "Follow the system theme", icon: IconDeviceDesktop },
]

const layers: {
  key: ToggleKey
  label: string
  icon: typeof IconSun
  k: string
}[] = [
  { key: "terminator", label: "Day and night", icon: IconSunMoon, k: "t" },
  { key: "weather", label: "Weather radar", icon: IconCloudRain, k: "w" },
  { key: "heatmap", label: "Density glow", icon: IconFlame, k: "h" },
  { key: "airports", label: "Airports", icon: IconBuildingAirport, k: "a" },
  { key: "overview", label: "Overview map", icon: IconMap, k: "o" },
  {
    key: "shapes",
    label: "Aircraft shapes by type",
    icon: IconPlaneTilt,
    k: "s",
  },
]

export function buildActions(d: ActionDeps): Action[] {
  const pans: [string, string, number, number][] = [
    ["pan-left", "←", -0.2, 0],
    ["pan-right", "→", 0.2, 0],
    ["pan-up", "↑", 0, -0.2],
    ["pan-down", "↓", 0, 0.2],
  ]
  return [
    {
      id: "search",
      label: "Search flights, airports and airlines",
      group: "Navigate",
      icon: IconSearch,
      keys: ["/"],
      run: d.focusSearch,
    },
    {
      id: "zoom-in",
      label: "Zoom in",
      group: "Navigate",
      icon: IconZoomIn,
      keys: ["+"],
      run: () => d.zoomBy(2),
    },
    {
      id: "zoom-out",
      label: "Zoom out",
      group: "Navigate",
      icon: IconZoomOut,
      keys: ["-"],
      run: () => d.zoomBy(0.5),
    },
    {
      id: "reset",
      label: "Reset the view",
      group: "Navigate",
      icon: IconZoomReset,
      keys: ["0"],
      run: d.reset,
    },
    {
      id: "locate",
      label: "Go to my location",
      group: "Navigate",
      icon: IconCurrentLocation,
      keys: ["l"],
      run: d.locate,
    },
    {
      id: "follow",
      label: "Follow the selected aircraft",
      group: "Navigate",
      icon: IconFocusCentered,
      keys: ["f"],
      checked: d.follow,
      disabled: !d.selected,
      run: d.toggleFollow,
    },
    {
      id: "center",
      label: "Center on the selected aircraft",
      group: "Navigate",
      icon: IconTarget,
      keys: ["c"],
      disabled: !d.selected,
      run: d.centerOn,
    },
    {
      id: "escape",
      label: "Close the panel or tool",
      group: "Navigate",
      icon: IconX,
      keys: ["esc"],
      run: d.escape,
    },
    ...pans.map(
      ([id, key, dx, dy]): Action => ({
        id,
        label: "Pan the map",
        group: "Navigate",
        icon: IconArrowsMove,
        keys: [key],
        hidden: true,
        run: () => d.pan(dx, dy),
      })
    ),
    {
      id: "globe",
      label: "Globe view",
      group: "Layers",
      icon: IconWorld,
      keys: ["g"],
      checked: d.settings.globe,
      run: () => d.toggle("globe"),
    },
    ...layers.map(
      (l): Action => ({
        id: `layer-${l.key}`,
        label: l.label,
        group: "Layers",
        icon: l.icon,
        keys: [l.k],
        checked: d.settings[l.key],
        run: () => d.toggle(l.key),
      })
    ),
    {
      id: "layer-altitude",
      label: "Colour aircraft by altitude",
      group: "Layers",
      icon: IconMountain,
      keys: ["x"],
      checked: d.settings.colorBy === "altitude",
      run: d.toggleAltitude,
    },
    {
      id: "measure",
      label: "Measure a distance",
      group: "Tools",
      icon: IconRulerMeasure,
      keys: ["m"],
      checked: d.measuring,
      disabled: d.settings.globe,
      run: d.toggleMeasure,
    },
    {
      id: "replay",
      label: "Replay the last hour",
      group: "Tools",
      icon: IconHistory,
      keys: ["r"],
      checked: d.replay,
      run: d.toggleReplay,
    },
    {
      id: "insights",
      label: "Insights for aircraft in view",
      group: "Tools",
      icon: IconChartBar,
      keys: ["i"],
      run: d.openInsights,
    },
    {
      id: "clear-filters",
      label: "Clear filters",
      group: "Tools",
      icon: IconFilterOff,
      disabled: !d.filtersActive,
      run: d.clearFilters,
    },
    ...mapStyles.map(
      (s): Action => ({
        id: `style-${s.id}`,
        label: `${s.label} map`,
        group: "Map style",
        icon: s.icon,
        checked: d.mapStyle === s.id,
        keywords: "style tiles imagery",
        run: () => d.setMapStyle(s.id),
      })
    ),
    ...modes.map(
      (m): Action => ({
        id: `mode-${m.id}`,
        label: m.label,
        group: "Appearance",
        icon: m.icon,
        checked: d.mode === m.id,
        keywords: "theme appearance",
        run: () => d.setMode(m.id),
      })
    ),
    ...schemes.map(
      (s): Action => ({
        id: `scheme-${s.id}`,
        label: `${s.label} accent`,
        group: "Appearance",
        icon: IconPalette,
        checked: d.scheme === s.id,
        keywords: "colour scheme accent",
        run: () => d.setScheme(s.id),
      })
    ),
    {
      id: "shortcuts",
      label: "Keyboard shortcuts",
      group: "Help",
      icon: IconKeyboard,
      keys: ["?"],
      run: d.openShortcuts,
    },
    {
      id: "about",
      label: "About Flightpath",
      group: "Help",
      icon: IconInfoCircle,
      run: () => d.go("/about"),
    },
    {
      id: "terms",
      label: "Terms",
      group: "Help",
      icon: IconScale,
      run: () => d.go("/terms"),
    },
    {
      id: "privacy",
      label: "Privacy",
      group: "Help",
      icon: IconShieldLock,
      run: () => d.go("/privacy"),
    },
  ]
}
