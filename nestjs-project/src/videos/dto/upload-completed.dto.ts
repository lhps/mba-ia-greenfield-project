import { ApiProperty } from '@nestjs/swagger';
import { PROCESSING_STATUS, type ProcessingStatus } from '../videos.constants';

export class UploadCompletedDto {
  @ApiProperty({ example: 'dQw4w9WgXcQ' })
  public_id: string;

  @ApiProperty({ enum: [PROCESSING_STATUS.PROCESSING] })
  processing_status: ProcessingStatus;
}
