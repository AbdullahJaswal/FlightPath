import { IconMapPinOff } from "@tabler/icons-react"
import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router"
import { lazy, type ReactNode, Suspense } from "react"
import { PageShell } from "@/components/page-shell"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import appCss from "@/styles.css?url"

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "FlightPath" },
      {
        name: "description",
        content:
          "Live aircraft on a world map with flight, airport and airline details.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

// dev only, kept out of the production bundle
const Devtools = import.meta.env.DEV
  ? lazy(() => import("@/components/devtools"))
  : null

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
        {Devtools && (
          <Suspense fallback={null}>
            <Devtools />
          </Suspense>
        )}
        <Scripts />
      </body>
    </html>
  )
}

function NotFound() {
  return (
    <PageShell
      icon={IconMapPinOff}
      title="Nothing at this address"
      lead="The page you asked for does not exist. The map is one click away."
    >
      <div />
    </PageShell>
  )
}
