import {
  IconAirBalloon,
  IconAlertHexagon,
  IconAlertTriangle,
  IconAntenna,
  IconBroadcast,
  IconCircleCheck,
  IconCircleDot,
  IconClock,
  IconDrone,
  IconHelicopter,
  IconParachute,
  IconPlane,
  IconPlaneArrival,
  IconPlaneInflight,
  IconPlaneTilt,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlugConnectedX,
  IconQuestionMark,
  IconRadar,
  IconRadar2,
  IconRocket,
  IconRoute,
  IconSquareRoundedX,
  IconTools,
  IconUsers,
  IconWind,
} from "@tabler/icons-react"
import type {
  Category,
  FlightStatus,
  PollerMode,
  PositionSource,
} from "@/lib/api/schemas"

export type Icon = typeof IconPlane

type Info = { label: string; icon: Icon }

export const categoryInfo: Record<Category, Info> = {
  unknown: { label: "Unknown type", icon: IconPlane },
  light: { label: "Light aircraft", icon: IconPlaneTilt },
  small: { label: "Small aircraft", icon: IconPlane },
  large: { label: "Large aircraft", icon: IconPlaneInflight },
  high_vortex_large: { label: "Large, high vortex", icon: IconPlaneInflight },
  heavy: { label: "Heavy aircraft", icon: IconPlaneInflight },
  high_performance: { label: "High performance", icon: IconRocket },
  rotorcraft: { label: "Rotorcraft", icon: IconHelicopter },
  glider: { label: "Glider", icon: IconWind },
  lighter_than_air: { label: "Lighter than air", icon: IconAirBalloon },
  parachutist: { label: "Parachutist", icon: IconParachute },
  ultralight: { label: "Ultralight", icon: IconPlaneTilt },
  uav: { label: "Unmanned", icon: IconDrone },
  space: { label: "Space vehicle", icon: IconRocket },
  emergency_surface: { label: "Emergency vehicle", icon: IconAlertTriangle },
  service_surface: { label: "Service vehicle", icon: IconTools },
  obstacle: { label: "Obstacle", icon: IconAlertHexagon },
}

export const sourceInfo: Record<PositionSource, Info> = {
  adsb: { label: "ADS-B", icon: IconBroadcast },
  asterix: { label: "ASTERIX", icon: IconRadar },
  mlat: { label: "MLAT", icon: IconAntenna },
  flarm: { label: "FLARM", icon: IconRadar2 },
  unknown: { label: "Unknown source", icon: IconQuestionMark },
}

type StatusInfo = Info & {
  variant: "default" | "secondary" | "destructive" | "outline"
}

export const statusInfo: Record<FlightStatus, StatusInfo> = {
  scheduled: { label: "Scheduled", icon: IconClock, variant: "outline" },
  active: { label: "En route", icon: IconPlaneInflight, variant: "default" },
  landed: { label: "Landed", icon: IconPlaneArrival, variant: "secondary" },
  cancelled: {
    label: "Cancelled",
    icon: IconSquareRoundedX,
    variant: "destructive",
  },
  incident: {
    label: "Incident",
    icon: IconAlertTriangle,
    variant: "destructive",
  },
  diverted: { label: "Diverted", icon: IconRoute, variant: "destructive" },
  unknown: { label: "Unknown", icon: IconQuestionMark, variant: "outline" },
}

export const pollerModeInfo: Record<PollerMode, Info> = {
  active: { label: "Polling", icon: IconPlayerPlay },
  idle: { label: "Idle, no viewers", icon: IconPlayerPause },
  paused: { label: "Paused until tomorrow", icon: IconClock },
  follower: { label: "Following the leader", icon: IconUsers },
  disabled: { label: "Polling disabled", icon: IconPlugConnectedX },
}

export const emergencySquawks: Record<string, string> = {
  "7500": "Hijack",
  "7600": "Radio failure",
  "7700": "Emergency",
}

export { IconCircleCheck, IconCircleDot }
