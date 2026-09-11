import {
  IconDeviceDesktop,
  IconMoon,
  IconPalette,
  IconSun,
} from "@tabler/icons-react"
import { Hint } from "@/components/hint"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { schemes } from "@/lib/schemes"

const modes = [
  { id: "light", label: "Light", icon: IconSun },
  { id: "dark", label: "Dark", icon: IconMoon },
  { id: "system", label: "System", icon: IconDeviceDesktop },
] as const

export function ThemeMenu() {
  const { mode, scheme, setMode, setScheme } = useTheme()
  const ModeIcon = modes.find((m) => m.id === mode)?.icon ?? IconDeviceDesktop

  return (
    <DropdownMenu>
      <Hint label="Theme and accent colour" side="bottom">
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              aria-label="Appearance"
              className="bg-card shadow-sm hover:bg-accent dark:bg-card dark:hover:bg-accent"
            />
          }
        >
          <ModeIcon />
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as typeof mode)}
          >
            {modes.map((m) => (
              <DropdownMenuRadioItem key={m.id} value={m.id}>
                <m.icon />
                {m.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-1">
            <IconPalette className="size-3" />
            Accent
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={scheme}
            onValueChange={(v) => setScheme(v as typeof scheme)}
          >
            {schemes.map((s) => (
              <DropdownMenuRadioItem key={s.id} value={s.id}>
                <span
                  className="size-3.5 rounded-full ring-1 ring-foreground/20"
                  style={{ background: s.swatch }}
                />
                {s.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
