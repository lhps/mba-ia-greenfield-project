import { ApiProperty } from '@nestjs/swagger';
import { REACTION_VALUE, type ReactionValue } from '../videos.constants';

/** Caller's reaction after a write; the dislike count is stored but never exposed (phase-06 TD-03). */
export class ReactionStateDto {
  @ApiProperty({ type: 'integer', example: 1 })
  like_count: number;

  @ApiProperty({
    enum: Object.values(REACTION_VALUE),
    nullable: true,
    example: 'like',
  })
  my_reaction: ReactionValue | null;
}
