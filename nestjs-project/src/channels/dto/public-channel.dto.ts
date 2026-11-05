import { ApiProperty } from '@nestjs/swagger';

/** Public channel page header (GET /channels/:nickname, TD-10) — no private fields. */
export class PublicChannelDto {
  @ApiProperty({ example: 'novo_canal' })
  nickname: string;

  @ApiProperty({ example: 'Meu Canal' })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ format: 'date-time' })
  created_at: string;
}
