import { ApiProperty } from '@nestjs/swagger';
import {
  PROCESSING_STATUS,
  PUBLICATION_STATUS,
  type ProcessingStatus,
  type PublicationStatus,
} from '../videos.constants';

export class VideoResponseDto {
  @ApiProperty({ example: 'dQw4w9WgXcQ' })
  public_id: string;

  @ApiProperty({ example: 'clip.mp4' })
  file_name: string;

  @ApiProperty({ enum: Object.values(PROCESSING_STATUS) })
  processing_status: ProcessingStatus;

  @ApiProperty({ enum: Object.values(PUBLICATION_STATUS) })
  publication_status: PublicationStatus;

  @ApiProperty({ type: Number, nullable: true, example: 2.04 })
  duration_seconds: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 1920 })
  width: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 1080 })
  height: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Presigned GET of the thumbnail; null until processed',
  })
  thumbnail_url: string | null;

  @ApiProperty({ format: 'date-time' })
  created_at: string;
}
