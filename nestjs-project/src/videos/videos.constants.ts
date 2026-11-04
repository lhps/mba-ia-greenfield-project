import { randomBytes } from 'node:crypto';
import { PUBLIC_READ_PREFIX } from '../storage/storage.constants';

export const PROCESSING_STATUS = {
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed',
} as const;

export type ProcessingStatus =
  (typeof PROCESSING_STATUS)[keyof typeof PROCESSING_STATUS];

export const PUBLICATION_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
} as const;

export type PublicationStatus =
  (typeof PUBLICATION_STATUS)[keyof typeof PUBLICATION_STATUS];

export const VISIBILITY = {
  PUBLIC: 'public',
  UNLISTED: 'unlisted',
} as const;

export type Visibility = (typeof VISIBILITY)[keyof typeof VISIBILITY];

export const FAILURE_REASON = {
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  NO_VIDEO_STREAM: 'NO_VIDEO_STREAM',
  PROCESSING_ERROR: 'PROCESSING_ERROR',
  UPLOAD_ABANDONED: 'UPLOAD_ABANDONED',
} as const;

export type FailureReason =
  (typeof FAILURE_REASON)[keyof typeof FAILURE_REASON];

export const PUBLIC_ID_LENGTH = 11;

export const PUBLIC_ID_MAX_ATTEMPTS = 5;

/** Declared MIME hint only — ffprobe in the worker is the authoritative format check (TD-09). */
export const ALLOWED_VIDEO_CONTENT_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
  'video/x-msvideo',
] as const;

/** 12 random bytes → 16-char base64url thumbnail version token. */
export const THUMBNAIL_VERSION_BYTES = 12;

export const STORAGE_KEYS = {
  original: (videoId: string) => `videos/${videoId}/original`,
  video: (videoId: string) => `videos/${videoId}/video.mp4`,
  /** Versioned public-read key: a fresh crypto-random version per write gives a new URL (TD-07). */
  thumbnail: (videoId: string) =>
    `${PUBLIC_READ_PREFIX}${videoId}/${randomBytes(THUMBNAIL_VERSION_BYTES).toString('base64url')}.jpg`,
} as const;

/** Video description limit, validated in the DTO (TD-02). */
export const VIDEO_DESCRIPTION_MAX_LENGTH = 5000;

/** Fields editable through `PATCH /videos/:id`; at least one is required. */
export const UPDATABLE_VIDEO_FIELDS = [
  'title',
  'description',
  'category',
  'visibility',
] as const;

/** Custom thumbnail upload cap enforced by Multer (TD-05): 2 MiB. */
export const THUMBNAIL_MAX_BYTES = 2_097_152;

/** Multipart field carrying the custom thumbnail image. */
export const THUMBNAIL_UPLOAD_FIELD = 'file';

/** Offset pagination bounds of `GET /channels/me/videos` (TD-09). */
export const PANEL_PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PER_PAGE: 20,
  MAX_PER_PAGE: 50,
} as const;

/** Keyset pagination bounds of public listings such as `GET /channels/:nickname/videos` (TD-09). */
export const PUBLIC_LISTING_PAGINATION = {
  DEFAULT_LIMIT: 24,
  MAX_LIMIT: 50,
} as const;

/** Every stored thumbnail is a re-encoded JPEG (TD-06). */
export const THUMBNAIL_CONTENT_TYPE = 'image/jpeg';
