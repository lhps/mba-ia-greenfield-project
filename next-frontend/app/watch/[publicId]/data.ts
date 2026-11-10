import "server-only"

import { cache } from "react"

import type { PresignedUrl, PublicVideo, VideoDetail } from "@/lib/api/contracts"
import { sessionAuthHeader } from "@/lib/api/forwarding"
import { upstream } from "@/lib/api/upstream"
import { getSession } from "@/lib/auth/session"

// Server-side reads for /watch/[publicId] — uncached, per viewer (per phase-05-video-watch-frontend/TD-02).
// No refresh here: Server Components cannot write the session cookie, so an expired access token
// degrades the read to anonymous (known gap accepted at /plan-build 2026-11-09).

async function authHeaders() {
  return sessionAuthHeader(await getSession())
}

// Memoized per request so generateMetadata and the page share one upstream call.
// Returns null when the caller cannot read the video (404 → not-found.tsx).
export const getVideoDetail = cache(async (publicId: string): Promise<VideoDetail | null> => {
  const { data, error, response } = await upstream.GET("/videos/{id}", {
    params: { path: { id: publicId } },
    headers: await authHeaders(),
    cache: "no-store",
  })
  if (response.status === 404) return null
  if (error) throw new Error(`GET /videos/${publicId} failed with ${response.status}`)
  return data
})

export async function getSuggestions(publicId: string): Promise<PublicVideo[]> {
  const { data, error, response } = await upstream.GET("/videos/{id}/suggestions", {
    params: { path: { id: publicId } },
    headers: await authHeaders(),
    cache: "no-store",
  })
  if (error) throw new Error(`GET /videos/${publicId}/suggestions failed with ${response.status}`)
  return data.items
}

// Initial stream URL; only requested for a ready video. null lets the player show "Video unavailable".
export async function getStreamUrl(publicId: string): Promise<PresignedUrl | null> {
  const { data, error } = await upstream.GET("/videos/{id}/stream", {
    params: { path: { id: publicId } },
    headers: await authHeaders(),
    cache: "no-store",
  })
  return error ? null : data
}
