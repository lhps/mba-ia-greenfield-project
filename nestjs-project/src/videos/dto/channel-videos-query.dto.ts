import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PANEL_PAGINATION } from '../videos.constants';

/** Offset pagination of the owner management panel (TD-09). */
export class ChannelVideosQueryDto {
  /** 1-based page number. */
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = PANEL_PAGINATION.DEFAULT_PAGE;

  /** Items per page (1–50). */
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PANEL_PAGINATION.MAX_PER_PAGE)
  per_page: number = PANEL_PAGINATION.DEFAULT_PER_PAGE;
}
