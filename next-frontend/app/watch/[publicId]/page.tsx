import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { DownloadButton } from "@/components/video/download-button"
import { SuggestedVideos } from "@/components/video/suggested-videos"
import { SuggestedVideosSkeleton } from "@/components/video/suggested-videos-skeleton"
import { VideoDescription } from "@/components/video/video-description"
import { VideoInfo } from "@/components/video/video-info"
import { VideoPlayer } from "@/components/video/video-player"
import { VideoStatusPlaceholder } from "@/components/video/video-status-placeholder"
import { getSession } from "@/lib/auth/session"
import { formatDuration, formatRelativeDate, formatViews } from "@/lib/format"

import { getStreamUrl, getSuggestions, getVideoDetail } from "./data"

type WatchPageProps = { params: Promise<{ publicId: string }> }

export async function generateMetadata({ params }: WatchPageProps): Promise<Metadata> {
  const { publicId } = await params
  const video = await getVideoDetail(publicId)
  return { title: video ? `${video.title} — StreamTube` : "Video not available — StreamTube" }
}

function metaLabel(viewCount: number, publishedAt: string | null) {
  const date = formatRelativeDate(publishedAt)
  return date ? `${formatViews(viewCount)} • ${date}` : formatViews(viewCount)
}

// Streamed separately so the player never waits on the suggestions query
// (per phase-05-video-watch-frontend/TD-02).
async function Suggestions({ publicId }: { publicId: string }) {
  const items = await getSuggestions(publicId)
  return (
    <SuggestedVideos
      items={items.map((item) => ({
        publicId: item.public_id,
        title: item.title,
        thumbnailUrl: item.thumbnail_url,
        durationLabel: formatDuration(item.duration_seconds),
        metaLabel: metaLabel(item.view_count, item.published_at),
      }))}
    />
  )
}

export default async function WatchPage({ params }: WatchPageProps) {
  const { publicId } = await params
  const video = await getVideoDetail(publicId)
  if (!video) notFound()

  const session = await getSession()
  // Owner-only Download (per phase-05-video-watch/TD-03 Note).
  const isOwner = Boolean(session.isLoggedIn && session.channelSlug === video.channel.nickname)
  const ready = video.processing_status === "ready"
  const stream = ready ? await getStreamUrl(publicId) : null

  return (
    <main className="flex flex-1 flex-col gap-6 bg-background p-6 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        {ready ? (
          <VideoPlayer
            publicId={video.public_id}
            src={stream?.url ?? null}
            poster={video.thumbnail_url ?? undefined}
          />
        ) : (
          // Owner's draft not playable yet: no stream fetch, no view (per phase-05-video-watch-frontend/TD-03 revision).
          <VideoStatusPlaceholder status={video.processing_status === "failed" ? "failed" : "processing"} />
        )}
        <div className="flex flex-col gap-4">
          <VideoInfo
            title={video.title}
            channel={video.channel}
            actions={isOwner && ready ? <DownloadButton publicId={video.public_id} /> : undefined}
          />
          <VideoDescription
            metaLabel={metaLabel(video.view_count, video.published_at)}
            description={video.description ?? ""}
          />
        </div>
      </div>
      <aside className="flex w-full flex-col lg:w-103 lg:shrink-0">
        <Suspense fallback={<SuggestedVideosSkeleton />}>
          <Suggestions publicId={video.public_id} />
        </Suspense>
      </aside>
    </main>
  )
}
