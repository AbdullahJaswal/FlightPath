export function LoadingBar({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-30 h-0.5 overflow-hidden bg-primary/20">
      <div className="h-full w-1/3 animate-loading rounded-full bg-primary" />
    </div>
  )
}
