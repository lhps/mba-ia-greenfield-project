"use client"

import * as React from "react"

import { DownloadIcon } from "@/components/icons/download-icon"
import { Button } from "@/components/ui/button"
import type { ApiErrorEnvelope, PresignedUrl } from "@/lib/api/contracts"

type DownloadButtonProps = {
  publicId: string
}

// UX for the download error codes (per the watch-page UI Contract → Error Catalog mapping).
const errorMessages: Record<string, string> = {
  UNAUTHORIZED: "Session expired — log in again",
  VIDEO_ACCESS_DENIED: "You can't download this video",
  VIDEO_NOT_FOUND: "This video isn't available",
  VIDEO_NOT_READY: "This video isn't ready yet",
}
const fallbackMessage = "Download failed — try again"

// Owner-only Download (rendered only when the session channelSlug matches the video channel).
// Fetches a presigned attachment URL through the BFF and navigates to it.
function DownloadButton({ publicId }: DownloadButtonProps) {
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleClick() {
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/videos/${publicId}/download`)
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiErrorEnvelope | null
        setError((body && errorMessages[body.error]) ?? fallbackMessage)
        return
      }
      const { url } = (await res.json()) as PresignedUrl
      window.location.assign(url)
    } catch {
      setError(fallbackMessage)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="md" onClick={handleClick} disabled={pending}>
        <DownloadIcon />
        Download
      </Button>
      {error ? (
        <p role="alert" className="text-body-md text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export { DownloadButton }
export type { DownloadButtonProps }
