import { useSyncExternalStore } from "react"
import type { AircraftList } from "@/lib/api/schemas"

export type Viewport = {
  west: number
  south: number
  east: number
  north: number
}

export type LiveStatus = "idle" | "connecting" | "open" | "reconnecting"

export type LiveState = {
  status: LiveStatus
  frame: AircraftList | null
  receivedAt: number
  // client clock minus server clock
  clockOffsetMs: number
  pollIntervalSeconds: number
}

type Hello = {
  type: "hello"
  instance: string
  serverTime: string
  pollIntervalSeconds: number
}

type Frame = Hello | ({ type: "snapshot" } & AircraftList)

const initial: LiveState = {
  status: "idle",
  frame: null,
  receivedAt: 0,
  clockOffsetMs: 0,
  pollIntervalSeconds: 0,
}

const viewportDelayMs = 200
const maxBackoffMs = 30_000
export const maxAircraft = 3000

export function liveUrl() {
  const proto = location.protocol === "https:" ? "wss" : "ws"
  return `${proto}://${location.host}/bff/live`
}

class LiveClient {
  private state = initial
  private listeners = new Set<() => void>()
  private ws: WebSocket | null = null
  private viewport: (Viewport & { limit: number }) | null = null
  private lastSent = ""
  private attempts = 0
  private reconnectTimer = 0
  private viewportTimer = 0
  private users = 0

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  get = () => this.state

  open() {
    this.users++
    if (this.users === 1) this.connect()
  }

  close() {
    this.users = Math.max(0, this.users - 1)
    if (this.users > 0) return
    clearTimeout(this.reconnectTimer)
    clearTimeout(this.viewportTimer)
    const ws = this.ws
    this.ws = null
    ws?.close()
    this.attempts = 0
    this.set({ status: "idle" })
  }

  setViewport(v: Viewport, limit = maxAircraft) {
    this.viewport = { ...v, limit }
    clearTimeout(this.viewportTimer)
    this.viewportTimer = window.setTimeout(() => this.flush(), viewportDelayMs)
  }

  private set(patch: Partial<LiveState>) {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l()
  }

  private flush() {
    const v = this.viewport
    if (!v || this.ws?.readyState !== WebSocket.OPEN) return
    const msg = JSON.stringify({
      type: "viewport",
      west: round(v.west),
      south: round(v.south),
      east: round(v.east),
      north: round(v.north),
      limit: v.limit,
    })
    if (msg === this.lastSent) return
    this.lastSent = msg
    this.ws.send(msg)
  }

  private connect() {
    this.set({ status: this.attempts ? "reconnecting" : "connecting" })
    const ws = new WebSocket(liveUrl())
    this.ws = ws
    ws.onopen = () => {
      this.attempts = 0
      this.lastSent = ""
      this.set({ status: "open" })
      this.flush()
    }
    ws.onmessage = (e) => this.receive(String(e.data))
    ws.onerror = () => ws.close()
    ws.onclose = () => {
      if (this.ws !== ws) return
      this.ws = null
      this.attempts++
      const delay = Math.min(maxBackoffMs, 1000 * 2 ** (this.attempts - 1))
      this.set({ status: "reconnecting" })
      this.reconnectTimer = window.setTimeout(() => this.connect(), delay)
    }
  }

  private receive(data: string) {
    let f: Frame
    try {
      f = JSON.parse(data) as Frame
    } catch {
      return
    }
    const now = Date.now()
    if (f.type === "hello") {
      this.set({
        clockOffsetMs: now - Date.parse(f.serverTime),
        pollIntervalSeconds: f.pollIntervalSeconds,
      })
      return
    }
    if (f.type === "snapshot") {
      const { type: _type, ...frame } = f
      const serverNow = Date.parse(frame.time) + frame.ageSeconds * 1000
      this.set({ frame, receivedAt: now, clockOffsetMs: now - serverNow })
    }
  }
}

const round = (n: number) => Math.round(n * 100) / 100

export const live = new LiveClient()

export function useLive(): LiveState {
  return useSyncExternalStore(live.subscribe, live.get, () => initial)
}
