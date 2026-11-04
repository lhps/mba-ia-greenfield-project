import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({
    example: 'jogos',
    description: 'Stable category identifier sent when editing a video',
  })
  slug: string;

  @ApiProperty({ example: 'Jogos' })
  name: string;
}

export class CategoryListResponseDto {
  @ApiProperty({ type: [CategoryResponseDto] })
  items: CategoryResponseDto[];
}
