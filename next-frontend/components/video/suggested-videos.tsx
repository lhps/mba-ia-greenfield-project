import { cn } from "@/lib/utils"

import { VideoCard, type VideoCardProps } from "./video-card"

type SuggestedVideosProps = {
  items: Omit<VideoCardProps, "className">[]
  className?: string
}

// Sidebar list of suggestion cards (Figma 158:3801). An empty list renders no cards.
function SuggestedVideos({ items, className }: SuggestedVideosProps) {
  return (
    <section
      aria-label="Suggested videos"
      data-slot="suggested-videos"
      className={cn("flex flex-col gap-4", className)}
    >
      {items.map((item) => (
        <VideoCard key={item.publicId} {...item} />
      ))}
    </section>
  )
}

export { SuggestedVideos }
export type { SuggestedVideosProps }
