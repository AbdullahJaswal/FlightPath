import { QueryClient } from "@tanstack/react-query"
import { createRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
import { routeTree } from "./routeTree.gen"

// every search param is a plain string, so skip the JSON quoting
function parseSearch(search: string) {
  return Object.fromEntries(new URLSearchParams(search))
}

function stringifySearch(search: Record<string, unknown>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    if (value != null && value !== "") params.set(key, String(value))
  }
  const s = params.toString()
  return s ? `?${s}` : ""
}

export function getRouter() {
  const queryClient = new QueryClient()
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    parseSearch,
    stringifySearch,
  })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
