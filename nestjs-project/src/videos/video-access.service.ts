import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  VideoAccessDeniedException,
  VideoNotFoundException,
} from '../common/exceptions/domain.exception';
import { Video } from './entities/video.entity';
import { isPublicId } from './public-id.util';

@Injectable()
export class VideoAccessService {
  constructor(
    @InjectRepository(Video) private readonly videos: Repository<Video>,
  ) {}

  async findByPublicIdOrFail(publicId: string): Promise<Video> {
    if (!isPublicId(publicId)) throw new VideoNotFoundException();
    const video = await this.videos.findOne({
      where: { public_id: publicId },
      relations: { channel: true },
    });
    if (!video) throw new VideoNotFoundException();
    return video;
  }

  /** Existence is checked before ownership (404 before 403). */
  async findOwnedOrFail(publicId: string, userId: string): Promise<Video> {
    const video = await this.findByPublicIdOrFail(publicId);
    if (video.channel.user_id !== userId)
      throw new VideoAccessDeniedException();
    return video;
  }
}
