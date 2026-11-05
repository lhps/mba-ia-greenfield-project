import { ApiProperty } from '@nestjs/swagger';
import {
  PROCESSING_STATUS,
  PUBLICATION_STATUS,
  VISIBILITY,
  type ProcessingStatus,
  type PublicationStatus,
  type Visibility,
} from '../videos.constants';

export class VideoCategoryDto {
  @ApiProperty({ example: 'musica' })
  slug: string;

  @ApiProperty({ example: 'Música' })
  name: string;
}

/** Shared `VideoDetail` shape — never carries internal ids or storage keys. */
export class VideoDetailDto {
  @ApiProperty({ example: 'dQw4w9WgXcQ' })
  public_id: string;

  @ApiProperty({ example: 'My trip to the beach' })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: VideoCategoryDto, nullable: true })
  category: VideoCategoryDto | null;

  @ApiProperty({ example: 'clip.mp4' })
  file_name: string;

  @ApiProperty({ enum: Object.values(PROCESSING_STATUS) })
  processing_status: ProcessingStatus;

  @ApiProperty({ enum: Object.values(PUBLICATION_STATUS) })
  publication_status: PublicationStatus;

  @ApiProperty({ enum: Object.values(VISIBILITY) })
  visibility: Visibility;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  published_at: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 2.04 })
  duration_seconds: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 1920 })
  width: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 1080 })
  height: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Stable public URL (thumbnails/ prefix), presigned GET for legacy keys, or null',
  })
  thumbnail_url: string | null;

  @ApiProperty({ format: 'date-time' })
  created_at: string;
}
