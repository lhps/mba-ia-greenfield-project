import { IsIn, IsInt, IsString, Length, Min } from 'class-validator';
import { ALLOWED_VIDEO_CONTENT_TYPES } from '../videos.constants';

export class CreateVideoUploadDto {
  /** Original file name of the video being uploaded. */
  @IsString()
  @Length(1, 255)
  file_name: string;

  /** Declared size in bytes; must not exceed MAX_UPLOAD_BYTES (10 GiB by default). */
  @IsInt()
  @Min(1)
  file_size: number;

  /** Declared MIME type of the video. */
  @IsIn(ALLOWED_VIDEO_CONTENT_TYPES)
  content_type: string;
}
