import {
  IconCookieOff,
  IconDeviceFloppy,
  IconServer,
  IconShieldLock,
  IconWorld,
} from "@tabler/icons-react"
import { createFileRoute } from "@tanstack/react-router"
import { PageSection, PageShell } from "@/components/page-shell"

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy, Flightpath" }] }),
  component: Privacy,
})

function Privacy() {
  return (
    <PageShell
      icon={IconShieldLock}
      title="Privacy"
      lead="No accounts, no analytics, no advertising. Here is everything the site touches."
    >
      <PageSection icon={IconCookieOff} title="No cookies or tracking">
        <p>
          The site sets no cookies and loads no analytics or advertising
          scripts. Nothing identifies you between visits.
        </p>
      </PageSection>

      <PageSection icon={IconDeviceFloppy} title="Stored in your browser">
        <p>
          Your appearance choices, the light or dark mode and the accent colour,
          are kept in your browser's local storage so they survive a reload.
          They never leave your device.
        </p>
      </PageSection>

      <PageSection icon={IconServer} title="Server logs">
        <p>
          The server keeps short-lived request logs that include your IP
          address. They are used for rate limiting and to diagnose problems, and
          they are not shared with anyone.
        </p>
      </PageSection>

      <PageSection icon={IconWorld} title="Third parties">
        <p>
          Your browser only talks to this site. Requests to the data providers,
          The OpenSky Network, adsbdb, aviationstack and Planespotters.net, are
          made by the server and do not include anything about you. The
          exceptions are images: with a tile map style your browser loads tiles
          directly from Esri or NASA GIBS, the weather layer loads radar tiles
          from RainViewer, and aircraft photos load from Planespotters.net.
          Those services see your IP address and, for tiles, the areas you look
          at. If you use the locate button, your position is read by your
          browser to move the map and is not sent to the server.
        </p>
      </PageSection>
    </PageShell>
  )
}
