import { useEffect, useState } from "react"

const labels: Record<string, string> = {
  esc: "Esc",
  mod: "Ctrl",
}

export function Keys({
  keys,
  className = "",
}: {
  keys: string[]
  className?: string
}) {
  const [mac, setMac] = useState(false)
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/i.test(navigator.platform))
  }, [])
  return (
    <span className={`ml-auto flex items-center gap-0.5 ${className}`}>
      {keys.map((k) => (
        <kbd
          key={k}
          className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[0.625rem] text-muted-foreground"
        >
          {k === "mod" && mac ? "⌘" : (labels[k] ?? k.toUpperCase())}
        </kbd>
      ))}
    </span>
  )
}
