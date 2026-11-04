export const QUEUES = {
  VIDEO_PROCESSING: 'video-processing',
  VIDEO_MAINTENANCE: 'video-maintenance',
} as const;

export const JOBS = {
  PROCESS_VIDEO: 'process-video',
  RECONCILE_STALE_UPLOADS: 'reconcile-stale-uploads',
} as const;

export const PROCESS_VIDEO_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: true,
  removeOnFail: 1000,
} as const;

export interface ProcessVideoJobData {
  video_id: string;
}
