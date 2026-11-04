import { ApiProperty } from '@nestjs/swagger';

export class ThumbnailResponseDto {
  @ApiProperty({
    example:
      'http://localhost:8333/streamtube/thumbnails/0b6f…/Xq3v9kT0aB1cD2eF.jpg',
    description: 'Stable public URL of the new 1280×720 JPEG thumbnail',
  })
  thumbnail_url: string;
}
