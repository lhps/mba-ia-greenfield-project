import { ApiProperty } from '@nestjs/swagger';

/** Caller's subscription after a follow / unfollow (phase-06 TD-07). */
export class SubscriptionStateDto {
  @ApiProperty({ type: 'integer', example: 1 })
  subscriber_count: number;

  @ApiProperty({ example: true })
  is_subscribed: boolean;
}
