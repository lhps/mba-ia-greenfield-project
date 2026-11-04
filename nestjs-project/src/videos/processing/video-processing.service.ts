import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UnrecoverableError } from 'bullmq';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Not, Repository } from 'typeorm';
import { FfmpegService } from '../../media/ffmpeg.service';
import { StorageService } from '../../storage/storage.service';
import { Video } from '../entities/video.entity';
import {
  FAILURE_REASON,
  PROCESSING_STATUS,
  STORAGE_KEYS,
} from '../videos.constants';

const THUMBNAIL_POSITION = 0.1;

@Injectable()
export class VideoProcessingService {
  constructor(
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    private readonly storage: StorageService,
    private readonly ffmpeg: FfmpegService,
  ) {}

  /** Idempotent: skips videos already ready; output keys are overwritten on retries. */
  async process(videoId: string): Promise<void> {
    const video = await this.videos.findOneBy({ id: videoId });
    if (!video || video.processing_status === PROCESSING_STATUS.READY) return;

    const dir = await mkdtemp(join(tmpdir(), `video-${videoId}-`));
    try {
      const original = join(dir, 'original');
      await this.storage.downloadToFile(video.original_key, original);

      const probe = await this.ffmpeg.probe(original);
      if (!probe.has_video) {
        await this.videos.update(videoId, {
          processing_status: PROCESSING_STATUS.FAILED,
          failure_reason: FAILURE_REASON.NO_VIDEO_STREAM,
        });
        throw new UnrecoverableError(`Video ${videoId} has no video stream`);
      }

      const output = join(dir, 'video.mp4');
      await this.ffmpeg.toFaststartMp4(original, output, {
        transcode: !this.ffmpeg.isBrowserPlayable(probe),
      });
      const videoKey = STORAGE_KEYS.video(videoId);
      await this.storage.uploadFile(output, videoKey, 'video/mp4');

      const thumbnail = join(dir, 'thumbnail.jpg');
      await this.ffmpeg.extractThumbnail(
        output,
        thumbnail,
        (probe.duration_seconds ?? 0) * THUMBNAIL_POSITION,
      );
      const thumbnailKey = STORAGE_KEYS.thumbnail(videoId);
      await this.storage.uploadFile(thumbnail, thumbnailKey, 'image/jpeg');

      await this.videos.update(videoId, {
        processing_status: PROCESSING_STATUS.READY,
        video_key: videoKey,
        thumbnail_key: thumbnailKey,
        duration_seconds: probe.duration_seconds,
        width: probe.width,
        height: probe.height,
        video_codec: probe.video_codec,
        audio_codec: probe.audio_codec,
        failure_reason: null,
      });
      await this.storage.deleteObject(video.original_key);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** Called once retries are exhausted; keeps a more specific failure reason if already set. */
  async markProcessingFailed(videoId: string): Promise<void> {
    await this.videos.update(
      { id: videoId, processing_status: Not(PROCESSING_STATUS.FAILED) },
      {
        processing_status: PROCESSING_STATUS.FAILED,
        failure_reason: FAILURE_REASON.PROCESSING_ERROR,
      },
    );
  }
}
