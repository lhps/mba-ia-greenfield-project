import { ApiHideProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { VIDEO_TITLE_MAX_LENGTH } from '../video-title.util';
import {
  UPDATABLE_VIDEO_FIELDS,
  VIDEO_DESCRIPTION_MAX_LENGTH,
  VISIBILITY,
  type Visibility,
} from '../videos.constants';

/** Class-level rule: the body must carry at least one editable field (TD-02, TD-03). */
@ValidatorConstraint({ name: 'atLeastOneField' })
class AtLeastOneFieldConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const body = args.object as Record<string, unknown>;
    return (
      value === undefined &&
      UPDATABLE_VIDEO_FIELDS.some((field) => body[field] !== undefined)
    );
  }

  defaultMessage(): string {
    return `body must contain at least one of: ${UPDATABLE_VIDEO_FIELDS.join(', ')}`;
  }
}

export class UpdateVideoDto {
  /** New title; trimmed, 1–100 characters. */
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, VIDEO_TITLE_MAX_LENGTH)
  title?: string;

  /** New description (≤ 5000 characters); `null` clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(VIDEO_DESCRIPTION_MAX_LENGTH)
  description?: string | null;

  /** Category `slug` (see GET /categories); `null` clears it — rejected on a published video. */
  @IsOptional()
  @IsString()
  category?: string | null;

  /** `public` or `unlisted`; editable at any time, independent of publication. */
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(Object.values(VISIBILITY))
  visibility?: Visibility;

  /** Carrier for the class-level "at least one field" rule; never part of the contract. */
  @ApiHideProperty()
  @Validate(AtLeastOneFieldConstraint)
  readonly atLeastOneField?: never;
}
