import type { ReactElement, ReactNode } from "react"
import { Keys } from "@/components/keys"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type Side = "top" | "bottom" | "left" | "right"

type Props = {
  label: ReactNode
  keys?: string[]
  side?: Side
  children: ReactElement
}

// Hover help for icon buttons, with the shortcut when there is one.
export function Hint({ label, keys, side = "top", children }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>
        {label}
        {keys && (
          <Keys
            keys={keys}
            className="[&_kbd]:border-background/20 [&_kbd]:bg-background/15 [&_kbd]:text-background/80"
          />
        )}
      </TooltipContent>
    </Tooltip>
  )
}
