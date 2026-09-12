import {
  IconAlertTriangle,
  IconCopyright,
  IconHeart,
  IconSatellite,
  IconScale,
} from "@tabler/icons-react"
import { createFileRoute } from "@tanstack/react-router"
import { PageSection, PageShell } from "@/components/page-shell"

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms, FlightPath" }] }),
  component: Terms,
})

function Terms() {
  return (
    <PageShell
      icon={IconScale}
      title="Terms of use"
      lead="Short and plain: this is a free personal project, offered as is."
    >
      <PageSection icon={IconHeart} title="Personal and non-commercial">
        <p>
          FlightPath is a hobby project. There is no account, no payment and no
          guarantee that it stays online. You may use it for personal,
          non-commercial purposes.
        </p>
      </PageSection>

      <PageSection icon={IconAlertTriangle} title="No warranty">
        <p>
          Positions, routes and schedules come from third parties and can be
          delayed, incomplete or wrong. Nothing here is suitable for
          operational, safety or navigational use. Use it at your own risk.
        </p>
      </PageSection>

      <PageSection icon={IconSatellite} title="Data providers">
        <p>
          Aircraft positions are provided by adsb.fi under its terms for
          personal, non-commercial use. Routes come from adsbdb, schedules from
          aviationstack, airports from OurAirports and airlines from
          OpenFlights. Aircraft photos are shown from Planespotters.net with the
          photographer credited and belong to their authors. Weather radar comes
          from RainViewer and daily imagery from NASA GIBS, both for personal
          use. Their data remains subject to their own terms.
        </p>
      </PageSection>

      <PageSection icon={IconCopyright} title="Fair use">
        <p>
          Please do not scrape or hammer the service. Requests are rate limited
          to keep it available for everyone and to stay within the free budgets
          of the data providers.
        </p>
      </PageSection>
    </PageShell>
  )
}
