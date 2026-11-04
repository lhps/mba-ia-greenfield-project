import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  JOBS,
  PROCESS_VIDEO_JOB_OPTIONS,
  QUEUES,
  type ProcessVideoJobData,
} from '../queue/queue.constants';

@Injectable()
export class VideoProcessingQueue {
  constructor(
    @InjectQueue(QUEUES.VIDEO_PROCESSING)
    private readonly queue: Queue<ProcessVideoJobData>,
  ) {}

  /** Idempotent per video: jobId = videoId, so re-enqueueing a pending job is a no-op. */
  async enqueue(videoId: string): Promise<void> {
    await this.queue.add(
      JOBS.PROCESS_VIDEO,
      { video_id: videoId },
      { ...PROCESS_VIDEO_JOB_OPTIONS, jobId: videoId },
    );
  }
}
