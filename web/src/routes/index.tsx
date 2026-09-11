import { createFileRoute } from "@tanstack/react-router"
import { WorldMap } from "@/components/world-map"

export const Route = createFileRoute("/")({ component: Index })

function Index() {
  return (
    <main className="h-svh w-full">
      <WorldMap />
    </main>
  )
}
