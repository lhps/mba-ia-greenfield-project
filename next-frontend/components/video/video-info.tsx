import type { ReactNode } from "react"
import Link from "next/link"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

type VideoInfoProps = {
  title: string
  channel: { nickname: string; name: string }
  actions?: ReactNode
  className?: string
}

function channelInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("")
}

// Info block under the player (Figma 152:2441): title, channel and the action row slot.
function VideoInfo({ title, channel, actions, className }: VideoInfoProps) {
  return (
    <div data-slot="video-info" className={cn("flex flex-col gap-3.5", className)}>
      <h1 className="text-h1 text-foreground">{title}</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar size="md" aria-hidden="true">
            <AvatarFallback>{channelInitials(channel.name)}</AvatarFallback>
          </Avatar>
          <Link
            href={`/channels/${channel.nickname}`}
            className="text-h3 text-foreground hover:underline focus-visible:underline"
          >
            {channel.name}
          </Link>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}

export { VideoInfo }
export type { VideoInfoProps }
