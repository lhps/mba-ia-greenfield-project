import { ApiProperty } from '@nestjs/swagger';
import {
  PROCESSING_STATUS,
  PUBLICATION_STATUS,
  VISIBILITY,
  type ProcessingStatus,
  type PublicationStatus,
  type Visibility,
} from '../videos.constants';

/** One row of the owner management panel — never carries internal ids or storage keys. */
export class PanelVideoDto {
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

  @ApiProperty({ enum: Object.values(PROCESSING_STATUS) })
  processing_status: ProcessingStatus;

  @ApiProperty({ enum: Object.values(PUBLICATION_STATUS) })
  publication_status: PublicationStatus;

  @ApiProperty({ enum: Object.values(VISIBILITY) })
  visibility: Visibility;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  published_at: string | null;

  @ApiProperty({ format: 'date-time' })
  created_at: string;

  @ApiProperty({ type: Number, nullable: true, example: 2.04 })
  duration_seconds: number | null;

  @ApiProperty({ example: 0, description: 'Always 0 in Phase 04' })
  view_count: number;

  @ApiProperty({ example: 0, description: 'Always 0 in Phase 04' })
  like_count: number;

  @ApiProperty({ example: 0, description: 'Always 0 in Phase 04' })
  comment_count: number;
}

/** Offset-paginated page of the owner management panel (TD-09). */
export class PanelVideoPageDto {
  @ApiProperty({ type: [PanelVideoDto] })
  items: PanelVideoDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  per_page: number;

  @ApiProperty({ example: 3, description: 'Total videos of the channel' })
  total: number;
}
