import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { COMMENT_PAGINATION } from '../comments.constants';

/** Keyset pagination of comment roots and replies (phase-06 TD-05). */
export class CommentsQueryDto {
  /** Opaque value from a previous `next_cursor`; omit for the first page. */
  @IsOptional()
  @IsString()
  cursor?: string;

  /** Items per page (1–50). */
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(COMMENT_PAGINATION.MAX_LIMIT)
  limit: number = COMMENT_PAGINATION.DEFAULT_LIMIT;
}
