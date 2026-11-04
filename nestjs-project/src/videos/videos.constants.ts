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
} as const;

export type PublicationStatus =
  (typeof PUBLICATION_STATUS)[keyof typeof PUBLICATION_STATUS];

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

export const STORAGE_KEYS = {
  original: (videoId: string) => `videos/${videoId}/original`,
  video: (videoId: string) => `videos/${videoId}/video.mp4`,
  thumbnail: (videoId: string) => `videos/${videoId}/thumbnail.jpg`,
} as const;
