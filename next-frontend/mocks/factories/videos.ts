import type { PresignedUrl, PublicVideo, VideoDetail } from "@/lib/api/contracts";

export const FIXTURE_CHANNEL = { nickname: "pixel_point", name: "Pixel Point" };
export const FIXTURE_STORAGE_URL = "https://storage.test";

const FIXTURE_DESCRIPTION = [
  "In this video we build a full watch page from scratch.",
  "We cover the player controls, the info block and the suggestions sidebar.",
  "Timestamps:",
  "0:00 Intro",
  "1:20 Player",
  "3:45 Sidebar",
].join("\n");

const baseVideoDetail: VideoDetail = {
  public_id: "abcDEF12345",
  title: "Building a video watch page",
  description: FIXTURE_DESCRIPTION,
  category: { slug: "tecnologia", name: "Tecnologia" },
  file_name: "watch-page.mp4",
  processing_status: "ready",
  publication_status: "published",
  visibility: "public",
  published_at: "2026-10-20T12:00:00.000Z",
  duration_seconds: 296,
  width: 1920,
  height: 1080,
  thumbnail_url: `${FIXTURE_STORAGE_URL}/thumbnails/abcDEF12345.jpg`,
  created_at: "2026-10-19T09:00:00.000Z",
  view_count: 10_000,
  channel: FIXTURE_CHANNEL,
};

export const buildVideoDetail = (overrides: Partial<VideoDetail> = {}): VideoDetail => ({
  ...baseVideoDetail,
  ...overrides,
});

// Owner's draft that is not playable yet (processing or failed).
export const buildDraftVideoDetail = (
  publicId: string,
  processingStatus: "processing" | "failed"
): VideoDetail =>
  buildVideoDetail({
    public_id: publicId,
    title: "My upcoming video",
    processing_status: processingStatus,
    publication_status: "draft",
    published_at: null,
    duration_seconds: null,
    width: null,
    height: null,
    thumbnail_url: null,
    view_count: 0,
  });

const basePublicVideo: PublicVideo = {
  public_id: "suggest0001",
  title: "Suggested video 1",
  thumbnail_url: `${FIXTURE_STORAGE_URL}/thumbnails/suggest0001.jpg`,
  duration_seconds: 157,
  published_at: "2026-10-01T12:00:00.000Z",
  view_count: 1_200,
};

export const buildPublicVideo = (overrides: Partial<PublicVideo> = {}): PublicVideo => ({
  ...basePublicVideo,
  ...overrides,
});

// Deterministic sidebar list (12 = upstream list size).
export const buildSuggestionList = (count = 12): PublicVideo[] =>
  Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const id = `suggest${n.toString().padStart(4, "0")}`;
    return buildPublicVideo({
      public_id: id,
      title: `Suggested video ${n}`,
      thumbnail_url: `${FIXTURE_STORAGE_URL}/thumbnails/${id}.jpg`,
      duration_seconds: 120 + n * 37,
      view_count: 1_200 * n,
    });
  });

export const buildPresignedUrl = (
  publicId: string,
  kind: "videos" | "downloads" = "videos",
  overrides: Partial<PresignedUrl> = {}
): PresignedUrl => ({
  url: `${FIXTURE_STORAGE_URL}/${kind}/${publicId}.mp4?X-Amz-Signature=fixture`,
  expires_at: "2026-12-31T23:59:59.000Z",
  ...overrides,
});
