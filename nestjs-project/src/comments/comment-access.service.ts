import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import {
  CommentNotFoundException,
  VideoNotFoundException,
} from '../common/exceptions/domain.exception';
import { VideoAccessService } from '../videos/video-access.service';
import { Comment } from './entities/comment.entity';

@Injectable()
export class CommentAccessService {
  constructor(
    private readonly access: VideoAccessService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Loads a comment (with its `video`) whose video passes the read rule; an
   * unknown id or an unreadable video is reported as COMMENT_NOT_FOUND, so a
   * hidden draft's comments are not revealed.
   */
  async findReadableOrFail(
    commentId: string,
    viewerId: string | undefined,
  ): Promise<Comment> {
    if (!isUUID(commentId)) throw new CommentNotFoundException();
    const comment = await this.dataSource.getRepository(Comment).findOne({
      where: { id: commentId },
      relations: { video: true },
    });
    if (!comment) throw new CommentNotFoundException();
    try {
      await this.access.findReadableOrFail(comment.video.public_id, viewerId);
    } catch (err) {
      if (err instanceof VideoNotFoundException) {
        throw new CommentNotFoundException();
      }
      throw err;
    }
    return comment;
  }
}
