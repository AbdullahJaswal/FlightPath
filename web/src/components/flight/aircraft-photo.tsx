import { IconCamera } from "@tabler/icons-react"
import { useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { useGetAircraftPhoto } from "@/lib/api/aircraft/aircraft"
import { useSettled } from "@/lib/hooks"

type Props = {
  icao24: string
  enabled?: boolean
  size?: "banner" | "thumb"
}

// Planespotters photo with the credit and link back its terms ask for.
export function AircraftPhoto({
  icao24,
  enabled = true,
  size = "banner",
}: Props) {
  const photo = useGetAircraftPhoto(icao24, {
    query: {
      enabled: enabled && icao24.length === 6,
      staleTime: 3600_000,
      retry: false,
    },
  })
  const [loaded, setLoaded] = useState<string | null>(null)
  const loading = useSettled(photo.isLoading, 400)
  const data = photo.data
  const banner = size === "banner"
  const box = banner ? "h-36 w-full" : "h-24 w-full"
  if (loading) {
    return (
      <Skeleton
        className={`${box} shrink-0 rounded-none ${banner ? "rounded-t-lg" : "rounded-md"}`}
      />
    )
  }
  if (!data) return null
  const src = banner ? data.large.src : data.thumbnail.src
  return (
    <a
      href={data.link}
      target="_blank"
      rel="noreferrer"
      className={`group relative block ${box} shrink-0 overflow-hidden bg-muted ${banner ? "rounded-t-lg" : "rounded-md"}`}
      title={`Photo by ${data.photographer} on Planespotters.net`}
    >
      <img
        src={src}
        alt={`Aircraft ${icao24.toUpperCase()}`}
        loading="lazy"
        onLoad={() => setLoaded(src)}
        className={`size-full object-cover transition-opacity duration-300 ${loaded === src ? "opacity-100" : "opacity-0"}`}
      />
      <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-linear-to-t from-black/70 to-transparent px-2 pt-4 pb-1 text-[0.625rem] text-white/90">
        <IconCamera className="size-3" />
        <span className="truncate">
          {data.photographer} · Planespotters.net
        </span>
      </span>
    </a>
  )
}
