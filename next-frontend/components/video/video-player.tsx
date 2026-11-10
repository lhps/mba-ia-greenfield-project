"use client"

import * as React from "react"

import { PauseIcon } from "@/components/icons/pause-icon"
import { PlayIcon } from "@/components/icons/play-icon"
import { VolumeIcon } from "@/components/icons/volume-icon"
import { VolumeOffIcon } from "@/components/icons/volume-off-icon"
import { IconButton } from "@/components/ui/icon-button"
import { Slider } from "@/components/ui/slider"
import type { PresignedUrl } from "@/lib/api/contracts"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"

type VideoPlayerProps = {
  publicId: string
  // Initial presigned URL from the server render; null when it could not be obtained.
  src: string | null
  poster?: string
  className?: string
}

// Fresh presigned URL through the BFF (per phase-05-video-watch-frontend/TD-04).
async function fetchFreshStreamUrl(publicId: string): Promise<string> {
  const res = await fetch(`/api/videos/${publicId}/stream`)
  if (!res.ok) throw new Error(`stream refresh failed: ${res.status}`)
  const { url } = (await res.json()) as PresignedUrl
  return url
}

function formatTime(seconds: number) {
  return formatDuration(Number.isFinite(seconds) ? seconds : 0)
}

// Native <video> with custom controls: play/pause, mute + volume, progress, timestamp
// (Figma 152:2323; per phase-05-video-watch-frontend/TD-03). No next/chapter/right-side controls.
function VideoPlayer({ publicId, src: initialSrc, poster, className }: VideoPlayerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const seekingRef = React.useRef(false)
  const viewRecordedRef = React.useRef(false)
  const playingRef = React.useRef(false)
  const refreshAttemptedRef = React.useRef(false)
  const resumeRef = React.useRef<{ time: number; play: boolean } | null>(null)
  const [src, setSrc] = React.useState<string | null>(initialSrc)
  const [unavailable, setUnavailable] = React.useState(false)
  const [playing, setPlaying] = React.useState(false)
  const [muted, setMuted] = React.useState(false)
  const [volume, setVolume] = React.useState(1)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [duration, setDuration] = React.useState(0)
  const [buffered, setBuffered] = React.useState(0)

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play()
    } else {
      video.pause()
    }
  }

  function toggleMute() {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
  }

  function handleVolumeChange([value]: number[]) {
    const video = videoRef.current
    if (!video || value === undefined) return
    video.volume = value / 100
    video.muted = value === 0
  }

  function handleSeekChange([value]: number[]) {
    if (value === undefined) return
    seekingRef.current = true
    setCurrentTime(value)
  }

  function handleSeekCommit([value]: number[]) {
    const video = videoRef.current
    seekingRef.current = false
    if (!video || value === undefined) return
    video.currentTime = value
  }

  function handleProgress() {
    const video = videoRef.current
    if (!video || video.buffered.length === 0) return
    setBuffered(video.buffered.end(video.buffered.length - 1))
  }

  // One view per page load, on the first play (per phase-05-video-watch/TD-01). Fire-and-forget.
  function handlePlay() {
    setPlaying(true)
    if (viewRecordedRef.current) return
    viewRecordedRef.current = true
    void fetch(`/api/videos/${publicId}/views`, { method: "POST" }).catch(() => {})
  }

  // The presigned URL expired (or never loaded): fetch a fresh one once, then resume
  // from the saved position (per phase-05-video-watch-frontend/TD-04).
  const refreshStream = React.useCallback(async () => {
    if (refreshAttemptedRef.current) {
      setUnavailable(true)
      return
    }
    refreshAttemptedRef.current = true
    const video = videoRef.current
    resumeRef.current = video
      ? { time: video.currentTime, play: !video.paused || playingRef.current }
      : null
    try {
      setSrc(await fetchFreshStreamUrl(publicId))
    } catch {
      setUnavailable(true)
    }
  }, [publicId])

  React.useEffect(() => {
    playingRef.current = playing
  }, [playing])

  // The server render had no URL: try once on mount (state is only set from the async result).
  React.useEffect(() => {
    if (initialSrc) return
    let cancelled = false
    refreshAttemptedRef.current = true
    fetchFreshStreamUrl(publicId)
      .then((url) => {
        if (!cancelled) setSrc(url)
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true)
      })
    return () => {
      cancelled = true
    }
  }, [initialSrc, publicId])

  function handleLoadedMetadata(event: React.SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget
    setDuration(video.duration)
    const resume = resumeRef.current
    if (!resume) return
    resumeRef.current = null
    video.currentTime = resume.time
    if (resume.play) void video.play()
  }

  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0

  return (
    <div
      data-slot="video-player"
      className={cn(
        "group/player relative aspect-video w-full overflow-hidden rounded-[var(--radius-4)] bg-neutral-1000 shadow-card",
        className
      )}
    >
      <video
        ref={videoRef}
        src={src ?? undefined}
        poster={poster}
        preload="metadata"
        playsInline
        onClick={togglePlay}
        onPlay={handlePlay}
        onPause={() => setPlaying(false)}
        onVolumeChange={(event) => {
          setMuted(event.currentTarget.muted)
          setVolume(event.currentTarget.volume)
        }}
        onLoadedMetadata={handleLoadedMetadata}
        onError={() => void refreshStream()}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => {
          if (!seekingRef.current) setCurrentTime(event.currentTarget.currentTime)
        }}
        onProgress={handleProgress}
        className="size-full object-contain"
      />

      {unavailable ? (
        <p
          role="alert"
          className="absolute inset-0 flex items-center justify-center text-label-lg text-primary-foreground"
        >
          Video unavailable
        </p>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2.5 px-2 pb-2.5 text-primary-foreground">
        <div className="relative">
          <div
            aria-hidden="true"
            data-slot="video-player-buffered"
            className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full"
          >
            <div
              className="h-full bg-muted-foreground"
              style={{ width: `${bufferedPercent}%` }}
            />
          </div>
          <Slider
            variant="timeline"
            aria-label="Seek"
            min={0}
            // min === max makes Radix compute a NaN thumb offset; keep a non-empty range until metadata loads.
            max={duration > 0 ? duration : 1}
            step={0.1}
            value={[currentTime]}
            onValueChange={handleSeekChange}
            onValueCommit={handleSeekCommit}
            disabled={!duration}
          />
        </div>

        <div className="flex items-center gap-4 px-5">
          <IconButton
            size="md"
            aria-label={playing ? "Pause" : "Play"}
            onClick={togglePlay}
            className="text-primary-foreground hover:bg-transparent"
          >
            {playing ? <PauseIcon className="size-9" /> : <PlayIcon className="size-9" />}
          </IconButton>

          <div className="group/volume flex items-center gap-1">
            <IconButton
              size="md"
              aria-label={muted ? "Unmute" : "Mute"}
              onClick={toggleMute}
              className="text-primary-foreground hover:bg-transparent"
            >
              {muted ? <VolumeOffIcon className="size-9" /> : <VolumeIcon className="size-9" />}
            </IconButton>
            <Slider
              variant="timeline"
              aria-label="Volume"
              min={0}
              max={100}
              step={1}
              value={[muted ? 0 : Math.round(volume * 100)]}
              onValueChange={handleVolumeChange}
              className="w-0 opacity-0 transition-all group-hover/volume:w-20 group-hover/volume:opacity-100 group-focus-within/volume:w-20 group-focus-within/volume:opacity-100"
            />
          </div>

          <span className="text-overlay tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  )
}

export { VideoPlayer }
export type { VideoPlayerProps }
