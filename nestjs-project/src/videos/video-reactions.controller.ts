import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { ReactionStateDto } from './dto/reaction-state.dto';
import { SetReactionDto } from './dto/set-reaction.dto';
import { VideoReactionsService } from './video-reactions.service';

const errorSchema = { $ref: getSchemaPath(ApiErrorEnvelope) };

@ApiTags('videos')
@ApiBearerAuth('access-token')
@SkipThrottle()
@Controller('videos')
export class VideoReactionsController {
  constructor(private readonly reactions: VideoReactionsService) {}

  @Put(':id/reaction')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Like or dislike a video',
    description:
      "Sets the caller's reaction on the video. Idempotent: setting the current value again " +
      'changes nothing. Returns the like count and the caller reaction — the dislike count is ' +
      'never exposed. `:id` is the video public_id.',
  })
  @ApiResponse({ status: 200, type: ReactionStateDto })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR — value is not like / dislike',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 404,
    description:
      'VIDEO_NOT_FOUND — unknown video, or a draft the caller does not own',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 409,
    description: 'VIDEO_NOT_READY — the video is not ready',
    schema: errorSchema,
  })
  async set(
    @CurrentUser() user: JwtPayload,
    @Param('id') publicId: string,
    @Body() dto: SetReactionDto,
  ): Promise<ReactionStateDto> {
    return this.reactions.set(publicId, user.sub, dto.value);
  }

  @Delete(':id/reaction')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove my reaction from a video',
    description:
      "Clears the caller's reaction. Idempotent: without a reaction the counts are unchanged. " +
      '`:id` is the video public_id.',
  })
  @ApiResponse({ status: 200, type: ReactionStateDto })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 404,
    description:
      'VIDEO_NOT_FOUND — unknown video, or a draft the caller does not own',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 409,
    description: 'VIDEO_NOT_READY — the video is not ready',
    schema: errorSchema,
  })
  async clear(
    @CurrentUser() user: JwtPayload,
    @Param('id') publicId: string,
  ): Promise<ReactionStateDto> {
    return this.reactions.clear(publicId, user.sub);
  }
}
