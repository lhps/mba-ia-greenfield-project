import { ApiProperty } from '@nestjs/swagger';

export class PresignedPartDto {
  @ApiProperty({ example: 1 })
  part_number: number;

  @ApiProperty({
    description:
      'Presigned UploadPart URL — PUT the raw part bytes; read the ETag response header',
  })
  url: string;
}

export class UploadPartsPresignedDto {
  @ApiProperty({ type: [PresignedPartDto] })
  parts: PresignedPartDto[];

  @ApiProperty({ format: 'date-time' })
  expires_at: string;
}
