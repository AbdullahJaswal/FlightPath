export type Mode = "light" | "dark" | "system"

export const schemes = [
  { id: "lime", label: "Lime", swatch: "oklch(84.1% 0.238 128.85)" },
  { id: "sky", label: "Sky", swatch: "oklch(74.6% 0.16 232.661)" },
  { id: "violet", label: "Violet", swatch: "oklch(70.2% 0.183 293.541)" },
  { id: "rose", label: "Rose", swatch: "oklch(71.2% 0.194 13.428)" },
  { id: "amber", label: "Amber", swatch: "oklch(82.8% 0.189 84.429)" },
  { id: "emerald", label: "Emerald", swatch: "oklch(76.5% 0.177 163.223)" },
] as const

export type Scheme = (typeof schemes)[number]["id"]

export const schemeIds = schemes.map((s) => s.id) as Scheme[]

export const modeKey = "flightpath:mode"
export const schemeKey = "flightpath:scheme"

export function isMode(v: unknown): v is Mode {
  return v === "light" || v === "dark" || v === "system"
}

export function isScheme(v: unknown): v is Scheme {
  return typeof v === "string" && (schemeIds as string[]).includes(v)
}
