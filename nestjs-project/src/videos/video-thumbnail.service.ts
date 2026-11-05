import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Repository } from 'typeorm';
import {
  InvalidThumbnailException,
  VideoNotFoundException,
} from '../common/exceptions/domain.exception';
import { FfmpegService } from '../media/ffmpeg.service';
import { MediaProcessError } from '../media/process-runner';
import { StorageService } from '../storage/storage.service';
import type { ThumbnailResponseDto } from './dto/thumbnail-response.dto';
import { Video } from './entities/video.entity';
import { ThumbnailUrlResolver } from './thumbnail-url.resolver';
import { VideoAccessService } from './video-access.service';
import { STORAGE_KEYS, THUMBNAIL_CONTENT_TYPE } from './videos.constants';

/** The subset of Multer's in-memory file the thumbnail flow relies on. */
export interface UploadedImage {
  buffer: Buffer;
  size: number;
}

const WEBP_RIFF = Buffer.from('RIFF', 'ascii');
const WEBP_FORMAT = Buffer.from('WEBP', 'ascii');
const IMAGE_SIGNATURES: ReadonlyArray<(bytes: Buffer) => boolean> = [
  // JPEG: SOI marker followed by another marker.
  (bytes) => bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  // PNG: fixed 8-byte signature.
  (bytes) =>
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  // WebP: RIFF container whose form type is WEBP.
  (bytes) =>
    bytes.subarray(0, 4).equals(WEBP_RIFF) &&
    bytes.subarray(8, 12).equals(WEBP_FORMAT),
];

/** Owner-side custom thumbnail replacement (TD-05, TD-06, TD-07). */
@Injectable()
export class VideoThumbnailService {
  constructor(
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    private readonly access: VideoAccessService,
    private readonly storage: StorageService,
    private readonly ffmpeg: FfmpegService,
    private readonly thumbnails: ThumbnailUrlResolver,
  ) {}

  /**
   * Validates the image by content (JPEG/PNG/WebP signature), re-encodes it to
   * a 1280×720 JPEG, stores it under a new versioned public-read key and
   * points the row at it with `has_custom_thumbnail = true`. The previous
   * object is deleted only after the row references the new key; if the row
   * update fails, the new object is removed instead.
   */
  async replace(
    publicId: string,
    userId: string,
    file: UploadedImage | undefined,
  ): Promise<ThumbnailResponseDto> {
    const video = await this.access.findOwnedOrFail(publicId, userId);
    if (!file || !this.hasImageSignature(file.buffer)) {
      throw new InvalidThumbnailException();
    }

    const dir = await mkdtemp(join(tmpdir(), `thumbnail-${video.id}-`));
    try {
      const input = join(dir, 'input');
      const output = join(dir, 'thumbnail.jpg');
      await writeFile(input, file.buffer);
      await this.normalize(input, output);

      const key = STORAGE_KEYS.thumbnail(video.id);
      await this.storage.uploadFile(output, key, THUMBNAIL_CONTENT_TYPE);

      let previousKey: string | null;
      try {
        previousKey = await this.pointAtCustomThumbnail(video.id, key);
      } catch (error) {
        // The new versioned key is unreferenced if the row was not updated.
        await this.storage.deleteObject(key);
        throw error;
      }
      if (previousKey && previousKey !== key) {
        await this.storage.deleteObject(previousKey);
      }

      return { thumbnail_url: (await this.thumbnails.resolve(key))! };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private hasImageSignature(bytes: Buffer): boolean {
    return IMAGE_SIGNATURES.some((matches) => matches(bytes));
  }

  private async normalize(input: string, output: string): Promise<void> {
    try {
      await this.ffmpeg.normalizeThumbnail(input, output);
    } catch (error) {
      if (error instanceof MediaProcessError) {
        throw new InvalidThumbnailException();
      }
      throw error;
    }
  }

  /**
   * Swaps `thumbnail_key` under a row lock and returns the key it replaced, so
   * a processing worker that re-pointed the row concurrently is accounted for
   * (its auto thumbnail becomes the previous object and is deleted).
   */
  private async pointAtCustomThumbnail(
    videoId: string,
    key: string,
  ): Promise<string | null> {
    return this.videos.manager.transaction(async (manager) => {
      const current = await manager.findOne(Video, {
        where: { id: videoId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) throw new VideoNotFoundException();
      await manager.update(Video, videoId, {
        thumbnail_key: key,
        has_custom_thumbnail: true,
      });
      return current.thumbnail_key;
    });
  }
}
