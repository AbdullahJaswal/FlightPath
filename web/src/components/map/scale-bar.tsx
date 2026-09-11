import { useSyncExternalStore } from "react"
import { formatInt } from "@/lib/format"
import { type MapStore, worldWidth } from "./map-store"

const earthCircumferenceM = 40075016.686
const maxPx = 120

function niceLength(maxMetres: number) {
  const exp = 10 ** Math.floor(Math.log10(maxMetres))
  for (const m of [5, 2, 1]) {
    if (m * exp <= maxMetres) return m * exp
  }
  return exp
}

export function ScaleBar({ store }: { store: MapStore }) {
  const state = useSyncExternalStore(store.subscribe, store.get, store.get)
  const world = worldWidth(state)
  if (!state.projection || world <= 0) return null
  const centre = store.unproject(state.width / 2, state.height / 2)
  const lat = centre ? centre[1] : 0
  const metresPerPx =
    (earthCircumferenceM * Math.cos((lat * Math.PI) / 180)) / world
  const metres = niceLength(metresPerPx * maxPx)
  const px = metres / metresPerPx
  const label =
    metres >= 1000 ? `${formatInt(metres / 1000)} km` : `${metres} m`
  return (
    <div className="pointer-events-auto flex items-end gap-2 rounded-lg bg-card/90 px-2.5 py-1.5 text-[0.625rem] text-muted-foreground shadow-sm ring-1 ring-foreground/10 backdrop-blur">
      <div
        className="h-1.5 border-foreground/60 border-x border-b"
        style={{ width: px }}
      />
      <span className="leading-none">{label}</span>
    </div>
  )
}
