import { useEffect } from "react"
import type { Action } from "./actions"

const keyNames: Record<string, string[]> = {
  esc: ["Escape"],
  "+": ["+", "="],
  "←": ["ArrowLeft"],
  "→": ["ArrowRight"],
  "↑": ["ArrowUp"],
  "↓": ["ArrowDown"],
}

function editable(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el?.tagName) return false
  const tag = el.tagName.toLowerCase()
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    el.isContentEditable
  )
}

export function matches(action: Action, e: KeyboardEvent) {
  const keys = action.keys
  if (!keys || keys.length === 0) return false
  const mod = keys.includes("mod")
  if (mod !== (e.metaKey || e.ctrlKey)) return false
  if (e.altKey) return false
  const last = keys[keys.length - 1] ?? ""
  const names = keyNames[last] ?? [last]
  return names.some((n) => n.toLowerCase() === e.key.toLowerCase())
}

// Global keyboard shortcuts, ignored while typing except for Escape.
export function useShortcuts(actions: Action[], enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      // open menus and dialogs handle their own keys
      const el = e.target as HTMLElement | null
      if (
        el?.closest?.("[role=menu],[role=dialog],[data-slot=popover-content]")
      ) {
        return
      }
      const typing = editable(e.target)
      for (const action of actions) {
        if (!matches(action, e)) continue
        if (typing && e.key !== "Escape" && !action.keys?.includes("mod")) {
          return
        }
        if (action.disabled) return
        e.preventDefault()
        action.run()
        return
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [actions, enabled])
}
