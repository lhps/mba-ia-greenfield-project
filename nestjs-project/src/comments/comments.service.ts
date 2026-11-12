import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import {
  CommentAccessDeniedException,
  CommentNotFoundException,
  VideoNotReadyException,
} from '../common/exceptions/domain.exception';
import { Video } from '../videos/entities/video.entity';
import { VideoAccessService } from '../videos/video-access.service';
import {
  PROCESSING_STATUS,
  type ReactionValue,
} from '../videos/videos.constants';
import { CommentAccessService } from './comment-access.service';
import {
  decodeCommentCursor,
  encodeCommentCursor,
} from './comment-cursor.util';
import type { CommentDto, CommentPageDto } from './dto/comment.dto';
import { Comment } from './entities/comment.entity';

export interface CreateCommentInput {
  body: string;
  parent_id?: string;
}

export interface CommentPageQuery {
  cursor?: string;
  limit: number;
}

interface CommentRow {
  id: string;
  parent_id: string | null;
  body: string | null;
  deleted_at: Date | null;
  like_count: number;
  reply_count: number;
  created_at: Date;
  author_nickname: string | null;
  author_name: string | null;
}

/** Columns of a `Comment` read model; `ch` is the author's channel. */
const COMMENT_COLUMNS = `
  c."id", c."parent_id", c."body", c."deleted_at", c."like_count",
  c."reply_count", c."created_at",
  ch."nickname" AS "author_nickname", ch."name" AS "author_name"
  FROM "comments" c
  LEFT JOIN "channels" ch ON ch."user_id" = c."user_id"`;

@Injectable()
export class CommentsService {
  constructor(
    private readonly access: VideoAccessService,
    private readonly commentAccess: CommentAccessService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Comments on a video or answers a comment. The video follows the write rule
   * (read rule + `ready`, phase-06 TD-06 revision); a reply to a reply is
   * attached to its root (one reply level, TD-04). The comment and its counters
   * (`videos.comment_count`, root `reply_count`, TD-02) are written together.
   */
  async create(
    publicId: string,
    userId: string,
    input: CreateCommentInput,
  ): Promise<CommentDto> {
    const video = await this.access.findReadableOrFail(publicId, userId);
    if (video.processing_status !== PROCESSING_STATUS.READY) {
      throw new VideoNotReadyException();
    }

    const id = await this.dataSource.transaction(async (manager) => {
      const rootId = input.parent_id
        ? await this.lockRootForReply(manager, video.id, input.parent_id)
        : null;
      const inserted = await manager.insert(Comment, {
        video_id: video.id,
        user_id: userId,
        parent_id: rootId,
        body: input.body,
      });
      await manager.increment(Video, { id: video.id }, 'comment_count', 1);
      if (rootId) {
        await manager.increment(Comment, { id: rootId }, 'reply_count', 1);
      }
      return (inserted.identifiers[0] as { id: string }).id;
    });

    const [row] = await this.dataSource.query<CommentRow[]>(
      `SELECT ${COMMENT_COLUMNS} WHERE c."id" = $1`,
      [id],
    );
    return toCommentDto(row, null);
  }

  /** Top-level comments, newest first; placeholders only while they still have replies (TD-05, TD-06). */
  async listRoots(
    publicId: string,
    viewerId: string | undefined,
    query: CommentPageQuery,
  ): Promise<CommentPageDto> {
    const video = await this.access.findReadableOrFail(publicId, viewerId);
    const params: unknown[] = [video.id];
    let keyset = '';
    if (query.cursor) {
      const cursor = decodeCommentCursor(query.cursor);
      params.push(cursor.created_at, cursor.id);
      keyset = `AND (c."created_at", c."id") < ($2, $3)`;
    }
    params.push(query.limit + 1);

    const rows = await this.dataSource.query<CommentRow[]>(
      `SELECT ${COMMENT_COLUMNS}
       WHERE c."video_id" = $1 AND c."parent_id" IS NULL
         AND NOT (c."deleted_at" IS NOT NULL AND c."reply_count" = 0)
         ${keyset}
       ORDER BY c."created_at" DESC, c."id" DESC
       LIMIT $${params.length}`,
      params,
    );
    return this.toPage(rows, query.limit, viewerId);
  }

  /** Replies of a top-level comment, oldest first (TD-05); the comment's video must be readable. */
  async listReplies(
    commentId: string,
    viewerId: string | undefined,
    query: CommentPageQuery,
  ): Promise<CommentPageDto> {
    const comment = await this.commentAccess.findReadableOrFail(
      commentId,
      viewerId,
    );
    if (comment.parent_id !== null) throw new CommentNotFoundException();
    const params: unknown[] = [commentId];
    let keyset = '';
    if (query.cursor) {
      const cursor = decodeCommentCursor(query.cursor);
      params.push(cursor.created_at, cursor.id);
      keyset = `AND (c."created_at", c."id") > ($2, $3)`;
    }
    params.push(query.limit + 1);

    const rows = await this.dataSource.query<CommentRow[]>(
      `SELECT ${COMMENT_COLUMNS}
       WHERE c."parent_id" = $1 ${keyset}
       ORDER BY c."created_at" ASC, c."id" ASC
       LIMIT $${params.length}`,
      params,
    );
    return this.toPage(rows, query.limit, viewerId);
  }

  /**
   * Author deletion (phase-06 TD-06): a root with replies becomes a placeholder,
   * anything else is removed (its reactions cascade). Counters follow the TD-02
   * rules; a placeholder root whose last reply goes is removed too. Existence is
   * checked before authorship (404 before 403).
   */
  async remove(commentId: string, userId: string): Promise<void> {
    const comment = await this.commentAccess.findReadableOrFail(
      commentId,
      userId,
    );
    if (comment.deleted_at) throw new CommentNotFoundException();
    if (comment.user_id !== userId) throw new CommentAccessDeniedException();

    await this.dataSource.transaction(async (manager) => {
      // Always lock the root first (as reply creation does), so a reply and its
      // root deleted concurrently are serialized instead of deadlocking.
      const rootId = comment.parent_id ?? comment.id;
      const root = await manager.findOne(Comment, {
        where: { id: rootId },
        lock: { mode: 'pessimistic_write' },
      });
      if (comment.parent_id === null) {
        if (!root || root.deleted_at) throw new CommentNotFoundException();
        if (root.reply_count > 0) {
          await manager.update(
            Comment,
            { id: root.id },
            { deleted_at: new Date(), body: null },
          );
        } else {
          await manager.delete(Comment, { id: root.id });
        }
      } else {
        const removed = await manager.delete(Comment, { id: comment.id });
        if (!root || !removed.affected) throw new CommentNotFoundException();
        if (root.deleted_at && root.reply_count <= 1) {
          await manager.delete(Comment, { id: root.id });
        } else {
          await manager.decrement(Comment, { id: root.id }, 'reply_count', 1);
        }
      }
      await manager.decrement(
        Video,
        { id: comment.video_id },
        'comment_count',
        1,
      );
    });
  }

  /**
   * Resolves the root a new reply attaches to and locks it, so the reply count
   * never races a concurrent delete of that root. The given parent must exist on
   * this video and not be a placeholder.
   */
  private async lockRootForReply(
    manager: EntityManager,
    videoId: string,
    parentId: string,
  ): Promise<string> {
    const parent = await manager.findOne(Comment, { where: { id: parentId } });
    if (!parent || parent.video_id !== videoId || parent.deleted_at) {
      throw new CommentNotFoundException();
    }
    const rootId = parent.parent_id ?? parent.id;
    const root = await manager.findOne(Comment, {
      where: { id: rootId },
      lock: { mode: 'pessimistic_write' },
    });
    // Re-checked under the lock: the root may have been deleted meanwhile.
    if (!root || (rootId === parentId && root.deleted_at)) {
      throw new CommentNotFoundException();
    }
    return rootId;
  }

  /** Trims the look-ahead row and fills `my_reaction` with one lookup per page (TD-08). */
  private async toPage(
    rows: CommentRow[],
    limit: number,
    viewerId: string | undefined,
  ): Promise<CommentPageDto> {
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const reactions = await this.findViewerReactions(
      viewerId,
      pageRows.map((row) => row.id),
    );
    const last = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map((row) =>
        toCommentDto(row, reactions.get(row.id) ?? null),
      ),
      next_cursor:
        hasMore && last
          ? encodeCommentCursor({
              created_at: last.created_at.toISOString(),
              id: last.id,
            })
          : null,
    };
  }

  private async findViewerReactions(
    viewerId: string | undefined,
    commentIds: string[],
  ): Promise<Map<string, ReactionValue>> {
    if (!viewerId || commentIds.length === 0) return new Map();
    const rows = await this.dataSource.query<
      { comment_id: string; value: ReactionValue }[]
    >(
      `SELECT "comment_id", "value" FROM "comment_reactions"
       WHERE "user_id" = $1 AND "comment_id" = ANY($2::uuid[])`,
      [viewerId, commentIds],
    );
    return new Map(rows.map((row) => [row.comment_id, row.value]));
  }
}

/** A placeholder hides its body and author (TD-06). */
function toCommentDto(
  row: CommentRow,
  myReaction: ReactionValue | null,
): CommentDto {
  const deleted = row.deleted_at !== null;
  return {
    id: row.id,
    parent_id: row.parent_id,
    body: deleted ? null : row.body,
    deleted,
    author:
      deleted || row.author_nickname === null
        ? null
        : { nickname: row.author_nickname, name: row.author_name ?? '' },
    like_count: row.like_count,
    reply_count: row.reply_count,
    my_reaction: myReaction,
    created_at: row.created_at.toISOString(),
  };
}
