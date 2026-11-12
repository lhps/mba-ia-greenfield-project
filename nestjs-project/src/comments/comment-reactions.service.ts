import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CommentNotFoundException,
  VideoNotReadyException,
} from '../common/exceptions/domain.exception';
import type { ReactionStateDto } from '../videos/dto/reaction-state.dto';
import { type ReactionTarget, writeReaction } from '../videos/reaction-writer';
import {
  PROCESSING_STATUS,
  type ReactionValue,
} from '../videos/videos.constants';
import { CommentAccessService } from './comment-access.service';

export const COMMENT_REACTION_TARGET: ReactionTarget = {
  reactionTable: 'comment_reactions',
  targetColumn: 'comment_id',
  counterTable: 'comments',
};

@Injectable()
export class CommentReactionsService {
  constructor(
    private readonly commentAccess: CommentAccessService,
    private readonly dataSource: DataSource,
  ) {}

  async set(
    commentId: string,
    userId: string,
    value: ReactionValue,
  ): Promise<ReactionStateDto> {
    return this.write(commentId, userId, value);
  }

  async clear(commentId: string, userId: string): Promise<ReactionStateDto> {
    return this.write(commentId, userId, null);
  }

  /**
   * Write rule (phase-06 TD-03 revision) applied to the comment's video: readable
   * (else COMMENT_NOT_FOUND) and `ready` (else VIDEO_NOT_READY). Placeholders
   * cannot be reacted to.
   */
  private async write(
    commentId: string,
    userId: string,
    value: ReactionValue | null,
  ): Promise<ReactionStateDto> {
    const comment = await this.commentAccess.findReadableOrFail(
      commentId,
      userId,
    );
    if (comment.deleted_at) throw new CommentNotFoundException();
    if (comment.video.processing_status !== PROCESSING_STATUS.READY) {
      throw new VideoNotReadyException();
    }

    return this.dataSource.transaction(async (manager) => {
      // Lock the comment so a concurrent delete cannot remove it (or turn it
      // into a placeholder) between the check above and the reaction write.
      const rows = await manager.query<{ deleted_at: Date | null }[]>(
        `SELECT "deleted_at" FROM "comments" WHERE "id" = $1 FOR NO KEY UPDATE`,
        [comment.id],
      );
      if (rows.length === 0 || rows[0].deleted_at) {
        throw new CommentNotFoundException();
      }
      return writeReaction(
        manager,
        COMMENT_REACTION_TARGET,
        userId,
        comment.id,
        value,
      );
    });
  }
}
