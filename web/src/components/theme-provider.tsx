import { ScriptOnce } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { createContext, useContext, useEffect, useState } from "react"
import {
  isMode,
  isScheme,
  type Mode,
  modeKey,
  type Scheme,
  schemeIds,
  schemeKey,
} from "@/lib/schemes"

type ThemeState = {
  mode: Mode
  scheme: Scheme
  setMode: (mode: Mode) => void
  setScheme: (scheme: Scheme) => void
}

const ThemeContext = createContext<ThemeState>({
  mode: "system",
  scheme: "lime",
  setMode: () => {},
  setScheme: () => {},
})

// Runs before hydration so the first paint already has the stored theme.
const bootScript = `(function(){try{var e=document.documentElement;var m=localStorage.getItem(${JSON.stringify(modeKey)});if(m!=="light"&&m!=="dark"&&m!=="system")m="system";var r=m==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):m;e.classList.add(r);e.style.colorScheme=r;var s=localStorage.getItem(${JSON.stringify(schemeKey)});if(${JSON.stringify(schemeIds)}.indexOf(s)>=0)e.dataset.scheme=s}catch(err){}})();`

function applyMode(mode: Mode) {
  const root = document.documentElement
  const resolved =
    mode === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : mode
  root.classList.remove("light", "dark")
  root.classList.add(resolved)
  root.style.colorScheme = resolved
}

function applyScheme(scheme: Scheme) {
  document.documentElement.dataset.scheme = scheme
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>("system")
  const [scheme, setSchemeState] = useState<Scheme>("lime")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const m = localStorage.getItem(modeKey)
    const s = localStorage.getItem(schemeKey)
    if (isMode(m)) setModeState(m)
    if (isScheme(s)) setSchemeState(s)
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    applyMode(mode)
    if (mode !== "system") return
    const media = matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => applyMode("system")
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [mode, mounted])

  useEffect(() => {
    if (mounted) applyScheme(scheme)
  }, [scheme, mounted])

  const setMode = (next: Mode) => {
    localStorage.setItem(modeKey, next)
    setModeState(next)
  }

  const setScheme = (next: Scheme) => {
    localStorage.setItem(schemeKey, next)
    setSchemeState(next)
  }

  return (
    <ThemeContext value={{ mode, scheme, setMode, setScheme }}>
      <ScriptOnce>{bootScript}</ScriptOnce>
      {children}
    </ThemeContext>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
