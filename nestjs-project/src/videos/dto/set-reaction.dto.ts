import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { REACTION_VALUE, type ReactionValue } from '../videos.constants';

/** Body of `PUT /videos/:id/reaction` and `PUT /comments/:id/reaction`. */
export class SetReactionDto {
  @ApiProperty({ enum: Object.values(REACTION_VALUE), example: 'like' })
  @IsIn(Object.values(REACTION_VALUE))
  value: ReactionValue;
}
