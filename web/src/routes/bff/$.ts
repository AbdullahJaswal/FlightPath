import { createFileRoute } from "@tanstack/react-router"
import { apiUrl } from "@/lib/server/api-url"

const requestHeaders = [
  "accept",
  "accept-language",
  "if-none-match",
  "x-forwarded-for",
  "x-real-ip",
]
const responseHeaders = [
  "content-type",
  "cache-control",
  "etag",
  "vary",
  "retry-after",
]

export const Route = createFileRoute("/bff/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const base = new URL(`${apiUrl}/`)
        const search = new URL(request.url).search
        const target = new URL(`${params._splat ?? ""}${search}`, base)
        if (!target.pathname.startsWith(base.pathname)) {
          return new Response(null, { status: 404 })
        }

        const headers = new Headers()
        for (const name of requestHeaders) {
          const value = request.headers.get(name)
          if (value) headers.set(name, value)
        }

        let upstream: Response
        try {
          upstream = await fetch(target, { headers, signal: request.signal })
        } catch (err) {
          // the browser gave up on the request, nobody is waiting for the answer
          if (request.signal.aborted) return new Response(null, { status: 204 })
          throw err
        }

        const out = new Headers()
        for (const name of responseHeaders) {
          const value = upstream.headers.get(name)
          if (value) out.set(name, value)
        }
        return new Response(upstream.body, {
          status: upstream.status,
          headers: out,
        })
      },
    },
  },
})
