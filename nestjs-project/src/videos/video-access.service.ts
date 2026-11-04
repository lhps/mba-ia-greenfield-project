import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsRelations, Repository } from 'typeorm';
import {
  VideoAccessDeniedException,
  VideoNotFoundException,
} from '../common/exceptions/domain.exception';
import { Video } from './entities/video.entity';
import { isPublicId } from './public-id.util';
import { PUBLICATION_STATUS } from './videos.constants';

@Injectable()
export class VideoAccessService {
  constructor(
    @InjectRepository(Video) private readonly videos: Repository<Video>,
  ) {}

  async findByPublicIdOrFail(publicId: string): Promise<Video> {
    return this.loadOrFail(publicId, { channel: true });
  }

  /**
   * Read access by publication state (TD-04): published videos (public or
   * unlisted) are readable by anyone with the link; a draft is readable only
   * by its owner and is reported as not found to everyone else, so its
   * existence is not revealed. Loads `category` for the `VideoDetail` shape.
   */
  async findReadableOrFail(publicId: string, userId?: string): Promise<Video> {
    const video = await this.loadOrFail(publicId, {
      channel: true,
      category: true,
    });
    if (
      video.publication_status === PUBLICATION_STATUS.DRAFT &&
      video.channel.user_id !== userId
    ) {
      throw new VideoNotFoundException();
    }
    return video;
  }

  /**
   * Existence is checked before ownership (404 before 403). `relations` adds
   * to the always-loaded `channel` (e.g. `category` for the `VideoDetail` shape).
   */
  async findOwnedOrFail(
    publicId: string,
    userId: string,
    relations: FindOptionsRelations<Video> = {},
  ): Promise<Video> {
    const video = await this.loadOrFail(publicId, {
      ...relations,
      channel: true,
    });
    if (video.channel.user_id !== userId)
      throw new VideoAccessDeniedException();
    return video;
  }

  private async loadOrFail(
    publicId: string,
    relations: FindOptionsRelations<Video>,
  ): Promise<Video> {
    if (!isPublicId(publicId)) throw new VideoNotFoundException();
    const video = await this.videos.findOne({
      where: { public_id: publicId },
      relations,
    });
    if (!video) throw new VideoNotFoundException();
    return video;
  }
}
