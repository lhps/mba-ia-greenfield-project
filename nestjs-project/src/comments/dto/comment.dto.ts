import { ApiProperty } from '@nestjs/swagger';
import {
  REACTION_VALUE,
  type ReactionValue,
} from '../../videos/videos.constants';

/** The comment author's channel. */
export class CommentAuthorDto {
  @ApiProperty({ example: 'jane_doe' })
  nickname: string;

  @ApiProperty({ example: 'Jane Doe' })
  name: string;
}

export class CommentDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Root comment of a reply; null on top-level comments',
  })
  parent_id: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'null on a deleted placeholder',
  })
  body: string | null;

  @ApiProperty({
    description: 'true on a deleted top-level comment kept for its replies',
  })
  deleted: boolean;

  @ApiProperty({ type: CommentAuthorDto, nullable: true })
  author: CommentAuthorDto | null;

  @ApiProperty({ type: 'integer', example: 0 })
  like_count: number;

  @ApiProperty({ type: 'integer', example: 0 })
  reply_count: number;

  @ApiProperty({
    enum: Object.values(REACTION_VALUE),
    nullable: true,
    description: "Caller's reaction; null for anonymous callers",
  })
  my_reaction: ReactionValue | null;

  @ApiProperty({ format: 'date-time' })
  created_at: string;
}

/** Keyset-paginated page of comments (phase-06 TD-05). */
export class CommentPageDto {
  @ApiProperty({ type: [CommentDto] })
  items: CommentDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Opaque cursor for the next page; null on the last page',
  })
  next_cursor: string | null;
}
