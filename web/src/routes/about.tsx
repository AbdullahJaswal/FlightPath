import {
  IconBrandGolang,
  IconBrandReact,
  IconDatabase,
  IconExternalLink,
  IconInfoCircle,
  IconMap2,
  IconSatellite,
  IconStack2,
  IconUserCircle,
} from "@tabler/icons-react"
import { createFileRoute } from "@tanstack/react-router"
import { PageSection, PageShell } from "@/components/page-shell"

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [{ title: "About Flightpath" }] }),
  component: About,
})

const site = "https://abdullahjaswal.dev/"

function About() {
  return (
    <PageShell
      icon={IconInfoCircle}
      title="About Flightpath"
      lead="A live map of aircraft around the world with flight, airport and airline details. A personal, non-commercial project."
    >
      <PageSection icon={IconUserCircle} title="Who made it">
        <p>
          Flightpath is built and run by Abdullah Jaswal.{" "}
          <a
            href={site}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
          >
            abdullahjaswal.dev
            <IconExternalLink className="size-3.5" />
          </a>
        </p>
      </PageSection>

      <PageSection icon={IconMap2} title="What it does">
        <p>
          The map shows aircraft positions as they are reported, with routes,
          aircraft registry details and, on request, airline schedules. Hover an
          aircraft for a quick summary, click it for the full picture, or search
          for a callsign, registration, airport or airline.
        </p>
        <p>
          Positions between updates are extrapolated from the last known heading
          and speed, so the map keeps moving while the next report is on its
          way. The area you are looking at refreshes every few seconds; the rest
          of the world is swept in the background a little at a time. It is a
          hobby project and not a source for operational or navigational
          decisions.
        </p>
      </PageSection>

      <PageSection icon={IconSatellite} title="Data sources">
        <ul className="flex flex-col gap-1">
          <li>
            Positions: adsb.fi, community ADS-B data used under its
            non-commercial terms
          </li>
          <li>Routes: adsbdb</li>
          <li>Schedules: aviationstack</li>
          <li>Airports: OurAirports</li>
          <li>Airlines: OpenFlights</li>
          <li>Aircraft registry: the OpenSky aircraft database</li>
          <li>
            Aircraft photos: Planespotters.net, each credited to its
            photographer and linked to the photo page
          </li>
          <li>Weather radar: RainViewer</li>
          <li>
            Map imagery: Esri basemap tiles and NASA GIBS daily imagery,
            credited on the map when a tile style is active
          </li>
        </ul>
      </PageSection>

      <PageSection icon={IconStack2} title="How it is built">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <IconBrandGolang className="size-4" />
            Go, Gin and Huma
          </span>
          <span className="inline-flex items-center gap-1">
            <IconDatabase className="size-4" />
            PostgreSQL with PostGIS, Redis
          </span>
          <span className="inline-flex items-center gap-1">
            <IconBrandReact className="size-4" />
            TanStack Start, TanStack Query, shadcn/ui
          </span>
          <span className="inline-flex items-center gap-1">
            <IconMap2 className="size-4" />
            react-simple-maps
          </span>
        </p>
        <p>
          One poller fetches global positions on a credit-aware schedule and
          streams viewport slices to browsers over a WebSocket. Everything else
          is cached in memory and in Redis with bounded lifetimes so nothing
          outlives its source.
        </p>
      </PageSection>
    </PageShell>
  )
}
