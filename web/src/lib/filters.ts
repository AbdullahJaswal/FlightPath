import {
  IconAirBalloon,
  IconDrone,
  IconHelicopter,
  IconPlaneInflight,
  IconPlaneTilt,
  IconQuestionMark,
  IconRocket,
  IconTruck,
} from "@tabler/icons-react"
import type { Aircraft, Category } from "@/lib/api/schemas"
import { metersToFeet } from "./format"
import { emergencySquawks, type Icon } from "./labels"

export type GroupId =
  | "airliners"
  | "light"
  | "rotorcraft"
  | "gliders"
  | "military"
  | "drones"
  | "surface"
  | "unknown"

export type Group = {
  id: GroupId
  label: string
  icon: Icon
  categories: Category[]
}

export const categoryGroups: Group[] = [
  {
    id: "airliners",
    label: "Airliners",
    icon: IconPlaneInflight,
    categories: ["large", "high_vortex_large", "heavy"],
  },
  {
    id: "light",
    label: "Light aircraft",
    icon: IconPlaneTilt,
    categories: ["light", "small", "ultralight"],
  },
  {
    id: "rotorcraft",
    label: "Helicopters",
    icon: IconHelicopter,
    categories: ["rotorcraft"],
  },
  {
    id: "gliders",
    label: "Gliders and balloons",
    icon: IconAirBalloon,
    categories: ["glider", "lighter_than_air", "parachutist"],
  },
  {
    id: "military",
    label: "High performance",
    icon: IconRocket,
    categories: ["high_performance", "space"],
  },
  { id: "drones", label: "Drones", icon: IconDrone, categories: ["uav"] },
  {
    id: "surface",
    label: "Ground vehicles",
    icon: IconTruck,
    categories: ["emergency_surface", "service_surface", "obstacle"],
  },
  {
    id: "unknown",
    label: "Unknown type",
    icon: IconQuestionMark,
    categories: ["unknown"],
  },
]

export type GroundFilter = "any" | "air" | "ground"
export type AltitudeFilter = "any" | "low" | "mid" | "high"

export const altitudeFilters: { id: AltitudeFilter; label: string }[] = [
  { id: "any", label: "Any altitude" },
  { id: "low", label: "Below 10,000 ft" },
  { id: "mid", label: "10,000 to 30,000 ft" },
  { id: "high", label: "Above 30,000 ft" },
]

export const groundFilters: { id: GroundFilter; label: string }[] = [
  { id: "any", label: "Airborne and on ground" },
  { id: "air", label: "Airborne only" },
  { id: "ground", label: "On ground only" },
]

export type Filters = {
  // empty means every group
  groups: GroupId[]
  ground: GroundFilter
  altitude: AltitudeFilter
  emergency: boolean
}

export const defaultFilters: Filters = {
  groups: [],
  ground: "any",
  altitude: "any",
  emergency: false,
}

const groupOf = new Map<Category, GroupId>()
for (const g of categoryGroups) {
  for (const c of g.categories) groupOf.set(c, g.id)
}

export function isEmergency(a: Aircraft) {
  return a.squawk != null && a.squawk in emergencySquawks
}

export function activeFilterCount(f: Filters) {
  return (
    (f.groups.length > 0 ? 1 : 0) +
    (f.ground !== "any" ? 1 : 0) +
    (f.altitude !== "any" ? 1 : 0) +
    (f.emergency ? 1 : 0)
  )
}

export function matchesFilters(a: Aircraft, f: Filters) {
  if (f.groups.length > 0) {
    const g = groupOf.get(a.category) ?? "unknown"
    if (!f.groups.includes(g)) return false
  }
  if (f.ground === "air" && a.onGround) return false
  if (f.ground === "ground" && !a.onGround) return false
  if (f.altitude !== "any") {
    const ft = a.onGround ? 0 : metersToFeet(a.baroAltM ?? 0)
    if (f.altitude === "low" && ft >= 10000) return false
    if (f.altitude === "mid" && (ft < 10000 || ft >= 30000)) return false
    if (f.altitude === "high" && ft < 30000) return false
  }
  if (f.emergency && !isEmergency(a)) return false
  return true
}

export function applyFilters(list: Aircraft[], f: Filters) {
  if (activeFilterCount(f) === 0) return list
  return list.filter((a) => matchesFilters(a, f))
}
