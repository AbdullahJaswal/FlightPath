import type { ReactNode } from "react"
import type { Icon } from "@/lib/labels"

type Props = {
  icon: Icon
  label: string
  children: ReactNode
  hint?: string
}

export function DetailRow({ icon: Icon, label, children, hint }: Props) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate text-foreground">
        {children}
        {hint && <span className="ml-1 text-muted-foreground">{hint}</span>}
      </span>
    </div>
  )
}

export function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: Icon
  title: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex items-center gap-1.5 font-heading font-medium text-muted-foreground text-xs uppercase tracking-wide">
        <Icon className="size-3.5 text-primary" />
        {title}
      </h3>
      {children}
    </section>
  )
}
