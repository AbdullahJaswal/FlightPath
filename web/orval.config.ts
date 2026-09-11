import { defineConfig } from "orval"

const input = process.env.OPENAPI ?? "http://localhost:8080/api/v1/openapi.json"

export default defineConfig({
  flightpath: {
    input,
    output: {
      target: "src/lib/api",
      schemas: "src/lib/api/schemas",
      client: "react-query",
      httpClient: "fetch",
      mode: "tags-split",
      clean: true,
      formatter: "biome",
      override: {
        mutator: {
          path: "./src/lib/server/bff-fetch.ts",
          name: "bffFetch",
        },
        fetch: {
          includeHttpResponseReturnType: false,
        },
        query: {
          useQuery: true,
          useMutation: true,
          useInfinite: true,
          usePrefetch: true,
          useInvalidate: true,
          signal: true,
        },
      },
    },
  },
  flightpathZod: {
    input,
    output: {
      target: "src/lib/api/zod",
      client: "zod",
      mode: "tags-split",
      clean: true,
      formatter: "biome",
      override: {
        zod: {
          generate: {
            param: true,
            body: true,
            response: true,
            query: true,
            header: true,
          },
        },
      },
    },
  },
})
