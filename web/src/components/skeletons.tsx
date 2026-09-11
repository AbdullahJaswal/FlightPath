import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

// widths are relative so every skeleton fits the box it is placed in
const labelWidths = ["w-1/3", "w-2/5", "w-1/4", "w-1/3", "w-2/5", "w-1/5"]
const valueWidths = ["w-2/5", "w-1/3", "w-1/2", "w-1/4", "w-2/5", "w-1/3"]
const rowIds = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"]

export function Line({ className = "w-1/3" }: { className?: string }) {
  return <Skeleton className={`h-3 max-w-full ${className}`} />
}

export function IconBox() {
  return <Skeleton className="size-3.5 shrink-0 rounded-sm" />
}

export function RowSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <IconBox />
      <Line className={labelWidths[index % labelWidths.length]} />
      <Line className={`ml-auto ${valueWidths[index % valueWidths.length]}`} />
    </div>
  )
}

export function SectionSkeleton({
  rows = 4,
  title = "w-1/5",
}: {
  rows?: number
  title?: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-center gap-1.5">
        <IconBox />
        <Skeleton className={`h-2.5 bg-muted/70 ${title}`} />
      </div>
      {rowIds.slice(0, rows).map((id, i) => (
        <RowSkeleton key={id} index={i} />
      ))}
    </div>
  )
}

function EndpointSkeleton({ align }: { align?: "right" }) {
  const side = align === "right" ? "items-end" : "items-start"
  return (
    <div className={`flex min-w-0 flex-1 flex-col gap-1.5 ${side}`}>
      <div className="flex items-center gap-1.5">
        <IconBox />
        <Skeleton className="h-5 w-12" />
      </div>
      <Line className="w-full" />
      <Skeleton className="h-2.5 w-3/4 bg-muted/70" />
    </div>
  )
}

export function RouteSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-start gap-3">
        <EndpointSkeleton />
        <Skeleton className="mt-1 size-4 shrink-0 rounded-full" />
        <EndpointSkeleton align="right" />
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
      <div className="flex justify-between gap-4">
        <Line className="w-1/3" />
        <Line className="w-1/4" />
      </div>
      <RowSkeleton index={4} />
    </div>
  )
}

export function ScheduleSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex gap-1.5">
        <Skeleton className="h-5 w-1/4 rounded-full" />
        <Skeleton className="h-5 w-1/5 rounded-full" />
        <Skeleton className="h-5 w-1/3 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((col) => (
          <div key={col} className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <IconBox />
              <Line className="w-1/2" />
            </div>
            {[0, 1, 2].map((row) => (
              <RowSkeleton key={row} index={row + col} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function PanelHeaderSkeleton() {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Skeleton className="size-5 shrink-0 rounded-md" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-1/4" />
          <Line className="w-1/3 bg-muted/70" />
        </div>
        <Skeleton className="h-2.5 w-1/2 bg-muted/70" />
      </div>
      <Skeleton className="size-6 shrink-0 rounded-md" />
      <Skeleton className="size-6 shrink-0 rounded-md" />
    </div>
  )
}

export function AircraftPanelSkeleton() {
  return (
    <Card
      size="sm"
      className="w-[min(100vw-1.5rem,23rem)] gap-0 py-0 shadow-md"
      aria-busy
    >
      <CardHeader className="border-b py-3">
        <PanelHeaderSkeleton />
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5 py-3">
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-1/4 rounded-full" />
          <Skeleton className="h-5 w-1/6 rounded-full" />
          <Skeleton className="h-5 w-1/5 rounded-full" />
        </div>
        <SectionSkeleton rows={0} title="w-1/6" />
        <RouteSkeleton />
        <SectionSkeleton rows={6} title="w-1/6" />
        <SectionSkeleton rows={4} title="w-1/5" />
      </CardContent>
    </Card>
  )
}

export function AirportPanelSkeleton() {
  return (
    <Card
      size="sm"
      className="w-[min(100vw-1.5rem,23rem)] gap-0 py-0 shadow-md"
      aria-busy
    >
      <CardHeader className="border-b py-3">
        <PanelHeaderSkeleton />
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-2.5 py-3">
        {rowIds.slice(0, 5).map((id, i) => (
          <RowSkeleton key={id} index={i} />
        ))}
      </CardContent>
    </Card>
  )
}

export function SearchSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-2 p-2" aria-busy>
      {[0, 1].map((group) => (
        <div key={group} className="flex min-w-0 flex-col gap-2">
          <Skeleton className="ml-1 h-2.5 w-1/5 bg-muted/70" />
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex min-w-0 items-center gap-2 px-1">
              <IconBox />
              <Skeleton className="h-4 w-10 shrink-0 rounded-full" />
              <Line
                className={labelWidths[(row + group) % labelWidths.length]}
              />
              <Line className="ml-auto w-1/5 bg-muted/70" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function TooltipRouteSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-2" aria-busy>
      <div className="flex items-center gap-3">
        <EndpointSkeleton />
        <Skeleton className="size-4 shrink-0 rounded-full" />
        <EndpointSkeleton align="right" />
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
      <Line className="w-1/2" />
    </div>
  )
}

export function StatusSkeleton() {
  return (
    <div className="flex items-center gap-3" aria-busy>
      <div className="flex items-center gap-1">
        <IconBox />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="flex items-center gap-1">
        <IconBox />
        <Skeleton className="h-3 w-12" />
      </div>
      <IconBox />
    </div>
  )
}
