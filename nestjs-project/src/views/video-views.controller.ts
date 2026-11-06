import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { ViewCountingService } from './view-counting.service';

const errorSchema = { $ref: getSchemaPath(ApiErrorEnvelope) };

@ApiTags('videos')
@SkipThrottle()
@Controller('videos')
export class VideoViewsController {
  constructor(private readonly viewCounting: ViewCountingService) {}

  @Post(':id/views')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Record a video view',
    description:
      'Called by the player when playback starts. Counts at most one view per viewer per dedup window ' +
      '(VIEW_DEDUP_WINDOW_SECONDS, default 24 h): the viewer is the user id when a valid bearer token is sent, ' +
      'otherwise a hash of the client IP (last X-Forwarded-For entry) and User-Agent. Views by the channel owner ' +
      'are never counted. Always 204 — counted, deduplicated or skipped. `:id` is the video public_id.',
  })
  @ApiResponse({ status: 204, description: 'View recorded or ignored' })
  @ApiResponse({
    status: 404,
    description:
      'Video not found, or the video is a draft and the caller is not its owner',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 409,
    description: 'The video is not ready for playback',
    schema: errorSchema,
  })
  async record(
    @CurrentUser() user: JwtPayload | undefined,
    @Param('id') publicId: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
  ): Promise<void> {
    await this.viewCounting.record(publicId, {
      userId: user?.sub,
      ip,
      userAgent: userAgent ?? '',
    });
  }
}
