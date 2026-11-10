import Image from "next/image"
import Link from "next/link"

import { cn } from "@/lib/utils"

type VideoCardProps = {
  publicId: string
  title: string
  thumbnailUrl: string | null
  durationLabel: string
  metaLabel: string
  className?: string
}

// Horizontal "list" variant of the Figma VideoCard (158:3729), used by the watch-page sidebar.
// Display strings (duration, views • date) are formatted by the caller.
function VideoCard({
  publicId,
  title,
  thumbnailUrl,
  durationLabel,
  metaLabel,
  className,
}: VideoCardProps) {
  return (
    <Link
      href={`/watch/${publicId}`}
      data-slot="video-card"
      className={cn(
        "group flex gap-2.5 rounded-[var(--radius-2)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
    >
      <div className="relative aspect-video min-w-0 flex-1 overflow-hidden rounded-[var(--radius-2)] bg-muted">
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt=""
            fill
            sizes="170px"
            unoptimized
            className="object-cover"
          />
        ) : null}
        <span className="absolute right-1 bottom-1 rounded-[var(--radius-1)] bg-background px-1 text-caption text-foreground">
          {durationLabel}
        </span>
      </div>
      <div className="flex w-45 shrink-0 flex-col gap-1">
        <h3 className="line-clamp-2 text-body-md text-foreground">{title}</h3>
        <p className="text-body-md text-muted-foreground">{metaLabel}</p>
      </div>
    </Link>
  )
}

export { VideoCard }
export type { VideoCardProps }
