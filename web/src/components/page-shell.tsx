import { IconArrowLeft, IconPlaneInflight } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { SiteFooter } from "@/components/site-footer"
import { ThemeMenu } from "@/components/theme-menu"
import { Button } from "@/components/ui/button"
import type { Icon } from "@/lib/labels"

type Props = {
  icon: Icon
  title: string
  lead?: string
  children: ReactNode
}

export function PageShell({ icon: Icon, title, lead, children }: Props) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="flex items-center gap-2 font-heading font-semibold text-base"
          >
            <IconPlaneInflight className="size-5 text-primary" />
            Flightpath
          </Link>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link to="/" />}
          >
            <IconArrowLeft data-icon="inline-start" />
            Back to the map
          </Button>
          <div className="ml-auto">
            <ThemeMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <h1 className="flex items-center gap-3 font-heading font-semibold text-2xl tracking-tight">
          <Icon className="size-7 text-primary" />
          {title}
        </h1>
        {lead && (
          <p className="mt-3 text-muted-foreground text-sm/relaxed">{lead}</p>
        )}
        <div className="mt-8 flex flex-col gap-8 text-sm/relaxed">
          {children}
        </div>
      </main>
      <footer className="mx-auto flex w-full max-w-2xl justify-start px-4 pb-8">
        <SiteFooter />
      </footer>
    </div>
  )
}

export function PageSection({
  icon: Icon,
  title,
  children,
}: {
  icon: Icon
  title: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 font-heading font-medium text-base">
        <Icon className="size-4 text-primary" />
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-muted-foreground">
        {children}
      </div>
    </section>
  )
}
