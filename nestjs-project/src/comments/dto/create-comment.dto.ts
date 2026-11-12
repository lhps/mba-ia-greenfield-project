import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { COMMENT_BODY_MAX_LENGTH } from '../comments.constants';

export class CreateCommentDto {
  /** Comment text — trimmed before validation, 1–2000 characters. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, COMMENT_BODY_MAX_LENGTH)
  body: string;

  /** Comment being answered; a reply to a reply is attached to its root. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  parent_id?: string;
}
