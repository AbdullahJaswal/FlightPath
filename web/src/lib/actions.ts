import type { Icon } from "./labels"

export type Action = {
  id: string
  label: string
  group: string
  icon: Icon
  // display and binding, for example ["t"] or ["mod", "k"]
  keys?: string[]
  run: () => void
  // shown as a check mark in the palette
  checked?: boolean
  disabled?: boolean
  // bound to a key but kept out of the palette
  hidden?: boolean
  keywords?: string
}

export const actionGroups = [
  "Navigate",
  "Layers",
  "Tools",
  "Map style",
  "Appearance",
  "Help",
]

export function matchesQuery(action: Action, q: string) {
  if (!q) return true
  const hay =
    `${action.label} ${action.group} ${action.keywords ?? ""}`.toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((part) => hay.includes(part))
}
