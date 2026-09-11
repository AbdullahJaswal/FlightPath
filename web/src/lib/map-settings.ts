import { useSyncExternalStore } from "react"

export type MapSettings = {
  colorBy: "accent" | "altitude"
  shapes: boolean
  terminator: boolean
  weather: boolean
  heatmap: boolean
  airports: boolean
  overview: boolean
  globe: boolean
}

export type SettingKey = keyof MapSettings
export type ToggleKey = Exclude<SettingKey, "colorBy">

export const defaultSettings: MapSettings = {
  colorBy: "accent",
  shapes: true,
  terminator: true,
  weather: false,
  heatmap: false,
  airports: true,
  overview: true,
  globe: false,
}

export const settingsKey = "flightpath:layers"

let current = defaultSettings
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

export function getSettings() {
  return current
}

export function subscribeSettings(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setSetting<K extends SettingKey>(
  key: K,
  value: MapSettings[K]
) {
  if (current[key] === value) return
  current = { ...current, [key]: value }
  try {
    localStorage.setItem(settingsKey, JSON.stringify(current))
  } catch {}
  notify()
}

export function toggleSetting(key: ToggleKey) {
  setSetting(key, !current[key])
}

// Reads the stored choices once the client is up.
export function loadSettings() {
  try {
    const raw = localStorage.getItem(settingsKey)
    if (!raw) return
    const stored = JSON.parse(raw) as Record<string, unknown>
    const next: Record<string, unknown> = { ...defaultSettings }
    for (const key of Object.keys(defaultSettings)) {
      if (typeof stored[key] === typeof next[key]) next[key] = stored[key]
    }
    if (next.colorBy !== "accent" && next.colorBy !== "altitude") {
      next.colorBy = "accent"
    }
    current = next as MapSettings
    notify()
  } catch {}
}

export function useSettings() {
  return useSyncExternalStore(
    subscribeSettings,
    getSettings,
    () => defaultSettings
  )
}
