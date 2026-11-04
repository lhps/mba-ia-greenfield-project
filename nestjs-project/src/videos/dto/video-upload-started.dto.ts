import { ApiProperty } from '@nestjs/swagger';
import {
  PROCESSING_STATUS,
  PUBLICATION_STATUS,
  type ProcessingStatus,
  type PublicationStatus,
} from '../videos.constants';

export class VideoUploadStartedDto {
  @ApiProperty({ example: 'dQw4w9WgXcQ', minLength: 11, maxLength: 11 })
  public_id: string;

  @ApiProperty({ enum: [PROCESSING_STATUS.UPLOADING] })
  processing_status: ProcessingStatus;

  @ApiProperty({ enum: Object.values(PUBLICATION_STATUS) })
  publication_status: PublicationStatus;

  @ApiProperty({ example: 67108864, description: 'Bytes per part (last part may be smaller)' })
  part_size: number;

  @ApiProperty({ example: 3 })
  part_count: number;
}
