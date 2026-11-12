import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { VideoNotReadyException } from '../common/exceptions/domain.exception';
import type { ReactionStateDto } from './dto/reaction-state.dto';
import type { Video } from './entities/video.entity';
import { VIDEO_REACTION_TARGET, writeReaction } from './reaction-writer';
import { VideoAccessService } from './video-access.service';
import { PROCESSING_STATUS, type ReactionValue } from './videos.constants';

@Injectable()
export class VideoReactionsService {
  constructor(
    private readonly access: VideoAccessService,
    private readonly dataSource: DataSource,
  ) {}

  async set(
    publicId: string,
    userId: string,
    value: ReactionValue,
  ): Promise<ReactionStateDto> {
    return this.write(publicId, userId, value);
  }

  async clear(publicId: string, userId: string): Promise<ReactionStateDto> {
    return this.write(publicId, userId, null);
  }

  private async write(
    publicId: string,
    userId: string,
    value: ReactionValue | null,
  ): Promise<ReactionStateDto> {
    const video = await this.findWritableOrFail(publicId, userId);
    return this.dataSource.transaction((manager) =>
      writeReaction(manager, VIDEO_REACTION_TARGET, userId, video.id, value),
    );
  }

  /**
   * Write rule (phase-06 TD-03 revision): the read rule (other users' drafts →
   * VIDEO_NOT_FOUND) plus `ready`; the channel owner may react to their own video.
   */
  private async findWritableOrFail(
    publicId: string,
    userId: string,
  ): Promise<Video> {
    const video = await this.access.findReadableOrFail(publicId, userId);
    if (video.processing_status !== PROCESSING_STATUS.READY) {
      throw new VideoNotReadyException();
    }
    return video;
  }
}
