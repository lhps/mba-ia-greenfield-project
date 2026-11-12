import { ApiProperty } from '@nestjs/swagger';

/** One followed channel in GET /me/subscriptions. */
export class SubscribedChannelDto {
  @ApiProperty({ example: 'novo_canal' })
  nickname: string;

  @ApiProperty({ example: 'Meu Canal' })
  name: string;

  @ApiProperty({ type: 'integer', example: 12 })
  subscriber_count: number;

  @ApiProperty({ format: 'date-time' })
  subscribed_at: string;
}

/** Keyset-paginated page of followed channels, most recent subscription first. */
export class SubscribedChannelPageDto {
  @ApiProperty({ type: [SubscribedChannelDto] })
  items: SubscribedChannelDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Opaque cursor for the next page; null on the last page',
  })
  next_cursor: string | null;
}
