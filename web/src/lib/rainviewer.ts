import { useSyncExternalStore } from "react"

export type RadarFrame = { time: number; path: string }

export type RadarState = {
  host: string
  frames: RadarFrame[]
  index: number
  loadedAt: number
}

export const radarUrl = "https://api.rainviewer.com/public/weather-maps.json"
export const radarSite = "https://www.rainviewer.com/"
export const radarAttribution = "Weather by RainViewer"
export const radarFrames = 7
export const radarRefreshMs = 5 * 60_000

const initial: RadarState = { host: "", frames: [], index: 0, loadedAt: 0 }
let state = initial
const listeners = new Set<() => void>()

function set(patch: Partial<RadarState>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

export function getRadar() {
  return state
}

export function subscribeRadar(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setRadarIndex(index: number) {
  if (index !== state.index) set({ index })
}

// Fetches the frame index, keeping the most recent past frames.
export async function loadRadar(signal?: AbortSignal) {
  const res = await fetch(radarUrl, { signal })
  if (!res.ok) throw new Error(`rainviewer ${res.status}`)
  const json = (await res.json()) as {
    host: string
    radar: { past: RadarFrame[] }
  }
  const frames = json.radar.past.slice(-radarFrames)
  // keep the frame on screen when it still exists, otherwise show the newest
  const current = state.frames[state.index]?.time
  const index = frames.findIndex((f) => f.time === current)
  set({
    host: json.host,
    frames,
    index: index >= 0 ? index : frames.length - 1,
    loadedAt: Date.now(),
  })
}

export function radarTile(
  host: string,
  path: string,
  z: number,
  x: number,
  y: number
) {
  return `${host}${path}/256/${z}/${x}/${y}/2/1_1.png`
}

export function useRadar() {
  return useSyncExternalStore(subscribeRadar, getRadar, () => initial)
}
