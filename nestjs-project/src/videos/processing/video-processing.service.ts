import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UnrecoverableError } from 'bullmq';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Not, Repository, type QueryDeepPartialEntity } from 'typeorm';
import { FfmpegService } from '../../media/ffmpeg.service';
import { StorageService } from '../../storage/storage.service';
import { Video } from '../entities/video.entity';
import {
  FAILURE_REASON,
  PROCESSING_STATUS,
  STORAGE_KEYS,
  THUMBNAIL_CONTENT_TYPE,
} from '../videos.constants';

const THUMBNAIL_POSITION = 0.1;

@Injectable()
export class VideoProcessingService {
  constructor(
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    private readonly storage: StorageService,
    private readonly ffmpeg: FfmpegService,
  ) {}

  /** Idempotent: skips videos already ready; the MP4 key is overwritten on retries, the thumbnail gets a new versioned key. */
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

      // A custom thumbnail is never overwritten by the auto-generated frame.
      const thumbnailKey = video.has_custom_thumbnail
        ? null
        : await this.uploadAutoThumbnail(
            videoId,
            output,
            join(dir, 'thumbnail.jpg'),
            (probe.duration_seconds ?? 0) * THUMBNAIL_POSITION,
          );

      const metadata: QueryDeepPartialEntity<Video> = {
        processing_status: PROCESSING_STATUS.READY,
        video_key: videoKey,
        duration_seconds: probe.duration_seconds,
        width: probe.width,
        height: probe.height,
        video_codec: probe.video_codec,
        audio_codec: probe.audio_codec,
        failure_reason: null,
      };
      if (thumbnailKey) {
        await this.persistWithAutoThumbnail(video, thumbnailKey, metadata);
      } else {
        await this.videos.update(videoId, metadata);
      }
      await this.storage.deleteObject(video.original_key);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /**
   * Writes the metadata and points the row at the auto thumbnail only while no
   * custom thumbnail exists. The custom flag was read at job start, so an owner
   * upload landing mid-processing is detected here by the conditional update
   * (0 rows): the custom thumbnail wins, the auto object is discarded and the
   * custom one is never deleted.
   */
  private async persistWithAutoThumbnail(
    video: Video,
    thumbnailKey: string,
    metadata: QueryDeepPartialEntity<Video>,
  ): Promise<void> {
    let pointed: boolean;
    try {
      const { affected } = await this.videos
        .createQueryBuilder()
        .update(Video)
        .set({ ...metadata, thumbnail_key: thumbnailKey })
        .where('id = :id', { id: video.id })
        .andWhere('has_custom_thumbnail = false')
        .execute();
      pointed = (affected ?? 0) > 0;
      if (!pointed) await this.videos.update(video.id, metadata);
    } catch (error) {
      // The versioned key is unreferenced if the row was not updated.
      await this.storage.deleteObject(thumbnailKey);
      throw error;
    }

    if (!pointed) {
      await this.storage.deleteObject(thumbnailKey);
      return;
    }
    // Previous thumbnail is removed only once the row points at the new key (TD-07).
    if (video.thumbnail_key) {
      await this.storage.deleteObject(video.thumbnail_key);
    }
  }

  /** Extracts a frame and stores it under a fresh versioned public-read key. */
  private async uploadAutoThumbnail(
    videoId: string,
    videoPath: string,
    thumbnailPath: string,
    atSeconds: number,
  ): Promise<string> {
    await this.ffmpeg.extractThumbnail(videoPath, thumbnailPath, atSeconds);
    const key = STORAGE_KEYS.thumbnail(videoId);
    await this.storage.uploadFile(thumbnailPath, key, THUMBNAIL_CONTENT_TYPE);
    return key;
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
