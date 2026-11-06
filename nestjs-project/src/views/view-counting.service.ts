import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VideoNotReadyException } from '../common/exceptions/domain.exception';
import { Video } from '../videos/entities/video.entity';
import { VideoAccessService } from '../videos/video-access.service';
import { PROCESSING_STATUS } from '../videos/videos.constants';
import { ViewDedupStore } from './view-dedup.store';

export interface Viewer {
  userId?: string;
  ip: string;
  userAgent: string;
}

@Injectable()
export class ViewCountingService {
  constructor(
    private readonly access: VideoAccessService,
    private readonly dedup: ViewDedupStore,
    @InjectRepository(Video) private readonly videos: Repository<Video>,
  ) {}

  /**
   * Counts a playback start at most once per viewer per dedup window (TD-01).
   * Same read rule as `GET /videos/:id`; the channel owner's views never count.
   */
  async record(publicId: string, viewer: Viewer): Promise<void> {
    const video = await this.access.findReadableOrFail(publicId, viewer.userId);
    if (video.processing_status !== PROCESSING_STATUS.READY) {
      throw new VideoNotReadyException();
    }
    if (viewer.userId && video.channel.user_id === viewer.userId) return;

    const isFirstView = await this.dedup.markFirstView(
      video.public_id,
      viewerKey(viewer),
    );
    if (!isFirstView) return;

    // Atomic `view_count = view_count + 1` — never read-modify-write.
    await this.videos.increment({ id: video.id }, 'view_count', 1);
  }
}

function viewerKey({ userId, ip, userAgent }: Viewer): string {
  if (userId) return `user:${userId}`;
  const digest = createHash('sha256')
    .update(`${ip}|${userAgent}`)
    .digest('hex');
  return `anon:${digest}`;
}
