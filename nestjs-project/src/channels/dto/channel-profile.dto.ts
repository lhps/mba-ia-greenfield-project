import { ApiProperty } from '@nestjs/swagger';

/** `ChannelProfile` — the caller's own channel as returned by GET/PATCH /channels/me. */
export class ChannelProfileDto {
  @ApiProperty({ example: 'novo_canal' })
  nickname: string;

  @ApiProperty({ example: 'Meu Canal' })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  nickname_changed_at: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'When the 14-day nickname cooldown ends; null when a change is allowed now',
  })
  next_nickname_change_at: string | null;

  @ApiProperty({ format: 'date-time' })
  created_at: string;
}
