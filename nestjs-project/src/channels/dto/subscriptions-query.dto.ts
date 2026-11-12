import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { SUBSCRIPTION_PAGINATION } from '../channels.constants';

/** Keyset pagination of the followed channels (phase-06 TD-09). */
export class SubscriptionsQueryDto {
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
  @Max(SUBSCRIPTION_PAGINATION.MAX_LIMIT)
  limit: number = SUBSCRIPTION_PAGINATION.DEFAULT_LIMIT;
}
