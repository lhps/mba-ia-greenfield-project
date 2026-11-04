import { Injectable } from '@nestjs/common';
import { VideoNotReadyException } from '../common/exceptions/domain.exception';
import { StorageService } from '../storage/storage.service';
import type { PresignedUrlResponseDto } from './dto/presigned-url-response.dto';
import type { VideoResponseDto } from './dto/video-response.dto';
import type { Video } from './entities/video.entity';
import { VideoAccessService } from './video-access.service';
import { PROCESSING_STATUS } from './videos.constants';

@Injectable()
export class VideosService {
  constructor(
    private readonly access: VideoAccessService,
    private readonly storage: StorageService,
  ) {}

  /** Public view by unique URL — never exposes internal ids, storage keys or upload_id. */
  async findPublic(publicId: string): Promise<VideoResponseDto> {
    const video = await this.access.findByPublicIdOrFail(publicId);
    const thumbnailUrl = video.thumbnail_key
      ? (await this.storage.presignGetObject(video.thumbnail_key)).url
      : null;

    return {
      public_id: video.public_id,
      file_name: video.file_name,
      processing_status: video.processing_status,
      publication_status: video.publication_status,
      duration_seconds: video.duration_seconds,
      width: video.width,
      height: video.height,
      thumbnail_url: thumbnailUrl,
      created_at: video.created_at.toISOString(),
    };
  }

  /** Open by unique URL in Phase 03 (TD-08 revision); only ready videos. */
  async getStreamUrl(publicId: string): Promise<PresignedUrlResponseDto> {
    const video = this.assertReady(
      await this.access.findByPublicIdOrFail(publicId),
    );
    const { url, expiresAt } = await this.storage.presignGetObject(
      video.video_key!,
    );
    return { url, expires_at: expiresAt.toISOString() };
  }

  /** Owner-only download of the processed MP4 (TD-08 revision). */
  async getDownloadUrl(
    userId: string,
    publicId: string,
  ): Promise<PresignedUrlResponseDto> {
    const video = this.assertReady(
      await this.access.findOwnedOrFail(publicId, userId),
    );
    const baseName = video.file_name.replace(/\.[^./\\]+$/, '') || 'video';
    const { url, expiresAt } = await this.storage.presignGetObject(
      video.video_key!,
      {
        downloadFileName: `${baseName}.mp4`,
      },
    );
    return { url, expires_at: expiresAt.toISOString() };
  }

  private assertReady(video: Video): Video {
    if (
      video.processing_status !== PROCESSING_STATUS.READY ||
      !video.video_key
    ) {
      throw new VideoNotReadyException();
    }
    return video;
  }
}
