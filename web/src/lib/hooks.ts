import { useEffect, useState } from "react"

export function useDebounced<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

// Wall clock that re-renders on an interval, for ages and countdowns.
export function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

// Keeps a loading state visible for a minimum time so content never flashes in.
export function useSettled(pending: boolean, minMs = 500) {
  const [show, setShow] = useState(pending)
  const [since, setSince] = useState(() => (pending ? Date.now() : 0))
  useEffect(() => {
    if (pending) {
      setSince(Date.now())
      setShow(true)
      return
    }
    const wait = Math.max(0, minMs - (Date.now() - since))
    const t = setTimeout(() => setShow(false), wait)
    return () => clearTimeout(t)
  }, [pending, minMs, since])
  return show
}
