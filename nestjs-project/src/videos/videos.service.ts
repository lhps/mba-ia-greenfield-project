import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { SubscriptionsService } from '../channels/subscriptions.service';
import { VideoNotReadyException } from '../common/exceptions/domain.exception';
import { StorageService } from '../storage/storage.service';
import type { PresignedUrlResponseDto } from './dto/presigned-url-response.dto';
import type { VideoDetailDto } from './dto/video-detail.dto';
import { VideoReaction } from './entities/video-reaction.entity';
import type { Video } from './entities/video.entity';
import { ThumbnailUrlResolver } from './thumbnail-url.resolver';
import { VideoAccessService } from './video-access.service';
import { PROCESSING_STATUS, type ReactionValue } from './videos.constants';

@Injectable()
export class VideosService {
  constructor(
    private readonly access: VideoAccessService,
    private readonly storage: StorageService,
    private readonly thumbnails: ThumbnailUrlResolver,
    private readonly subscriptions: SubscriptionsService,
    @InjectRepository(VideoReaction)
    private readonly reactions: Repository<VideoReaction>,
  ) {}

  /** Read by unique URL (TD-04): published for anyone, drafts owner-only. */
  async findReadable(
    publicId: string,
    userId?: string,
  ): Promise<VideoDetailDto> {
    const video = await this.access.findReadableOrFail(publicId, userId);
    return this.toVideoDetail(video, userId);
  }

  /**
   * Maps a video (with `channel` and `category` loaded) to the shared `VideoDetail` shape —
   * never exposes internal ids, storage keys or upload_id. Counts come from the
   * loaded rows; `my_reaction` / `is_subscribed` are the viewer's state
   * (`null` / `false` when anonymous, phase-06 TD-08).
   */
  async toVideoDetail(
    video: Video,
    viewerId?: string,
  ): Promise<VideoDetailDto> {
    const [thumbnailUrl, myReaction, isSubscribed] = await Promise.all([
      this.thumbnails.resolve(video.thumbnail_key),
      this.findViewerReaction(video.id, viewerId),
      this.subscriptions.isSubscribed(video.channel.id, viewerId),
    ]);

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
      view_count: video.view_count,
      like_count: video.like_count,
      comment_count: video.comment_count,
      my_reaction: myReaction,
      channel: {
        nickname: video.channel.nickname,
        name: video.channel.name,
        subscriber_count: video.channel.subscriber_count,
        is_subscribed: isSubscribed,
      },
    };
  }

  private async findViewerReaction(
    videoId: string,
    viewerId: string | undefined,
  ): Promise<ReactionValue | null> {
    if (!viewerId) return null;
    const reaction = await this.reactions.findOneBy({
      user_id: viewerId,
      video_id: videoId,
    });
    return reaction?.value ?? null;
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
