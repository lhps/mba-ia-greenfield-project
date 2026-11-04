import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QUEUES, type ProcessVideoJobData } from '../../queue/queue.constants';
import { VideoProcessingService } from './video-processing.service';

@Processor(QUEUES.VIDEO_PROCESSING, { concurrency: 1 })
export class VideoProcessingProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(VideoProcessingProcessor.name);

  constructor(private readonly processing: VideoProcessingService) {
    super();
  }

  async process(job: Job<ProcessVideoJobData>): Promise<void> {
    await this.processing.process(job.data.video_id);
  }

  onApplicationBootstrap(): void {
    this.worker.on('failed', (job, error) => {
      void this.handleFailed(job, error);
    });
  }

  /** Background context: log instead of rethrowing (would crash the worker). */
  async handleFailed(
    job: Job<ProcessVideoJobData> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job) return;
    this.logger.error(
      `process-video failed for ${job.data.video_id} (attempt ${job.attemptsMade}): ${error.message}`,
    );
    if (job.attemptsMade < (job.opts.attempts ?? 1)) return;
    try {
      await this.processing.markProcessingFailed(job.data.video_id);
    } catch (markError) {
      this.logger.error(
        `Could not mark ${job.data.video_id} as failed`,
        markError,
      );
    }
  }
}
