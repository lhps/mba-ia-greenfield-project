import { ApiProperty } from '@nestjs/swagger';

export class PresignedUrlResponseDto {
  @ApiProperty({
    description:
      'Short-lived presigned GET URL served by object storage (supports HTTP Range)',
  })
  url: string;

  @ApiProperty({ format: 'date-time' })
  expires_at: string;
}
