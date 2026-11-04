import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PUBLIC_LISTING_PAGINATION } from '../videos.constants';

/** Keyset pagination of the public channel listing (TD-09). */
export class PublicChannelVideosQueryDto {
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
  @Max(PUBLIC_LISTING_PAGINATION.MAX_LIMIT)
  limit: number = PUBLIC_LISTING_PAGINATION.DEFAULT_LIMIT;
}
