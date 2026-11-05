import { ApiHideProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import {
  CHANNEL_DESCRIPTION_MAX_LENGTH,
  CHANNEL_NAME_MAX_LENGTH,
  NICKNAME_PATTERN,
  UPDATABLE_CHANNEL_FIELDS,
} from '../channels.constants';

/** Class-level rule: the body must carry at least one editable field. */
@ValidatorConstraint({ name: 'atLeastOneChannelField' })
class AtLeastOneChannelFieldConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const body = args.object as Record<string, unknown>;
    return (
      value === undefined &&
      UPDATABLE_CHANNEL_FIELDS.some((field) => body[field] !== undefined)
    );
  }

  defaultMessage(): string {
    return `body must contain at least one of: ${UPDATABLE_CHANNEL_FIELDS.join(', ')}`;
  }
}

export class UpdateChannelDto {
  /**
   * New handle; lowercased, `^[a-z0-9_]{3,30}$`, not reserved, unique.
   * Can change once every 14 days; sending the current nickname is a no-op.
   * @example "novo_canal"
   */
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsString()
  @Matches(NICKNAME_PATTERN, {
    message: 'nickname must be 3–30 characters of a-z, 0-9 or _',
  })
  nickname?: string;

  /** New display name; trimmed, 1–50 characters. */
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, CHANNEL_NAME_MAX_LENGTH)
  name?: string;

  /** New description (≤ 1000 characters); `null` clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(CHANNEL_DESCRIPTION_MAX_LENGTH)
  description?: string | null;

  /** Carrier for the class-level "at least one field" rule; never part of the contract. */
  @ApiHideProperty()
  @Validate(AtLeastOneChannelFieldConstraint)
  readonly atLeastOneField?: never;
}
