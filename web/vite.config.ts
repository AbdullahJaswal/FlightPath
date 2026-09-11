import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { apiUrl } from "./src/lib/server/api-url.ts"

export default defineConfig(({ command }) => ({
  server: {
    port: 3000,
    proxy: {
      // websocket upgrades cannot go through a server route
      "/bff/live": {
        target: apiUrl,
        ws: true,
        rewrite: (path) => path.replace(/^\/bff/, ""),
      },
    },
  },
  resolve: { tsconfigPaths: true },
  // bundle the server so the runtime image needs no node_modules
  ssr: { noExternal: command === "build" ? true : undefined },
  plugins: [
    command === "serve" && devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
}))
