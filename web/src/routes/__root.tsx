import { TanStackDevtools } from "@tanstack/react-devtools"
import type { QueryClient } from "@tanstack/react-query"
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools"
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import type { ReactNode } from "react"
import appCss from "@/styles.css?url"

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Flightpath" },
      { name: "description", content: "Live aircraft on a world map." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <TanStackDevtools
          config={{ position: "bottom-right" }}
          plugins={[
            { name: "Router", render: <TanStackRouterDevtoolsPanel /> },
            { name: "Query", render: <ReactQueryDevtoolsPanel /> },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}

function NotFound() {
  return (
    <main className="container mx-auto p-4 pt-16">
      <h1 className="font-heading text-2xl">404</h1>
      <p className="text-muted-foreground">Nothing at this address.</p>
    </main>
  )
}
