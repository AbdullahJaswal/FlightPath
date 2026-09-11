import {
  IconCode,
  IconInfoCircle,
  IconSatellite,
  IconScale,
  IconShieldLock,
} from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"

const linkClass =
  "flex shrink-0 items-center gap-1 transition-colors hover:text-foreground [&_svg]:size-3.5"

export function SiteFooter({ attribution }: { attribution?: string }) {
  return (
    <nav className="flex max-w-[calc(100vw-1.5rem)] items-center gap-3 overflow-hidden whitespace-nowrap rounded-lg bg-card/90 px-3 py-1.5 text-muted-foreground text-xs ring-1 ring-foreground/10 backdrop-blur">
      <a
        href="https://abdullahjaswal.dev/"
        target="_blank"
        rel="noreferrer"
        className={linkClass}
      >
        <IconCode />
        Made by Abdullah Jaswal
      </a>
      <Link to="/about" className={linkClass}>
        <IconInfoCircle />
        About
      </Link>
      <Link to="/terms" className={linkClass}>
        <IconScale />
        Terms
      </Link>
      <Link to="/privacy" className={linkClass}>
        <IconShieldLock />
        Privacy
      </Link>
      <a
        href="https://opensky-network.org"
        target="_blank"
        rel="noreferrer"
        className={linkClass}
      >
        <IconSatellite />
        OpenSky Network
      </a>
      {attribution && <span className="min-w-0 truncate">{attribution}</span>}
    </nav>
  )
}
