import { ApiProperty } from '@nestjs/swagger';

/** One card of a public listing — published, public and ready videos only. */
export class PublicVideoDto {
  @ApiProperty({ example: 'dQw4w9WgXcQ' })
  public_id: string;

  @ApiProperty({ example: 'My trip to the beach' })
  title: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Stable public URL (thumbnails/ prefix), presigned GET for legacy keys, or null',
  })
  thumbnail_url: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 2.04 })
  duration_seconds: number | null;

  @ApiProperty({ format: 'date-time' })
  published_at: string;

  @ApiProperty({ example: 0, description: 'Always 0 in Phase 04' })
  view_count: number;
}

/** Keyset-paginated page of a public listing (TD-09). */
export class PublicVideoPageDto {
  @ApiProperty({ type: [PublicVideoDto] })
  items: PublicVideoDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Opaque cursor for the next page; null on the last page',
  })
  next_cursor: string | null;
}
