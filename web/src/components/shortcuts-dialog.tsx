import { IconKeyboard } from "@tabler/icons-react"
import { Keys } from "@/components/keys"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { type Action, actionGroups } from "@/lib/actions"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: Action[]
}

export function ShortcutsDialog({ open, onOpenChange, actions }: Props) {
  // actions sharing a label, like the four pans, become one row
  const bound: Action[] = []
  for (const a of actions) {
    if (!a.keys || a.keys.length === 0) continue
    const same = bound.find((b) => b.label === a.label && b.group === a.group)
    if (same) same.keys = [...(same.keys ?? []), ...a.keys]
    else bound.push({ ...a })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconKeyboard className="size-4 text-primary" />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            Shortcuts work anywhere on the map except while typing.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {actionGroups.map((group) => {
            const items = bound.filter((a) => a.group === group)
            if (items.length === 0) return null
            return (
              <section key={group} className="flex flex-col gap-1">
                <h3 className="font-heading font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {group}
                </h3>
                {items.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 text-xs/relaxed"
                  >
                    <a.icon className="size-3.5 shrink-0 text-primary" />
                    <span className="truncate">{a.label}</span>
                    {a.keys && <Keys keys={a.keys} />}
                  </div>
                ))}
              </section>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
