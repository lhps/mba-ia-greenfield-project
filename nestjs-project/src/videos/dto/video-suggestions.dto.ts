import { ApiProperty } from '@nestjs/swagger';
import { PublicVideoDto } from './public-video.dto';

/** Watch-page sidebar — a fixed-size list, no pagination (phase-05 TD-02). */
export class VideoSuggestionsDto {
  @ApiProperty({ type: [PublicVideoDto], maxItems: 12 })
  items: PublicVideoDto[];
}
