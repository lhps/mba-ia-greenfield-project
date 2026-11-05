import { Injectable } from '@nestjs/common';
import { VideoNotReadyException } from '../common/exceptions/domain.exception';
import { StorageService } from '../storage/storage.service';
import type { PresignedUrlResponseDto } from './dto/presigned-url-response.dto';
import type { VideoDetailDto } from './dto/video-detail.dto';
import type { Video } from './entities/video.entity';
import { ThumbnailUrlResolver } from './thumbnail-url.resolver';
import { VideoAccessService } from './video-access.service';
import { PROCESSING_STATUS } from './videos.constants';

@Injectable()
export class VideosService {
  constructor(
    private readonly access: VideoAccessService,
    private readonly storage: StorageService,
    private readonly thumbnails: ThumbnailUrlResolver,
  ) {}

  /** Read by unique URL (TD-04): published for anyone, drafts owner-only. */
  async findReadable(
    publicId: string,
    userId?: string,
  ): Promise<VideoDetailDto> {
    const video = await this.access.findReadableOrFail(publicId, userId);
    return this.toVideoDetail(video);
  }

  /**
   * Maps a video (with `category` loaded) to the shared `VideoDetail` shape —
   * never exposes internal ids, storage keys or upload_id.
   */
  async toVideoDetail(video: Video): Promise<VideoDetailDto> {
    const thumbnailUrl = await this.thumbnails.resolve(video.thumbnail_key);

    return {
      public_id: video.public_id,
      title: video.title,
      description: video.description,
      category: video.category
        ? { slug: video.category.slug, name: video.category.name }
        : null,
      file_name: video.file_name,
      processing_status: video.processing_status,
      publication_status: video.publication_status,
      visibility: video.visibility,
      published_at: video.published_at
        ? video.published_at.toISOString()
        : null,
      duration_seconds: video.duration_seconds,
      width: video.width,
      height: video.height,
      thumbnail_url: thumbnailUrl,
      created_at: video.created_at.toISOString(),
    };
  }

  /** Same read rule as `findReadable` (TD-04); only ready videos. */
  async getStreamUrl(
    publicId: string,
    userId?: string,
  ): Promise<PresignedUrlResponseDto> {
    const video = this.assertReady(
      await this.access.findReadableOrFail(publicId, userId),
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
