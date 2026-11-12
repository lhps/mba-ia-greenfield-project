import { Controller, Get, Query } from '@nestjs/common';
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
import { PublicChannelVideosQueryDto } from './dto/public-channel-videos-query.dto';
import { PublicVideoPageDto } from './dto/public-video.dto';
import { VideoListingService } from './video-listing.service';

const errorSchema = { $ref: getSchemaPath(ApiErrorEnvelope) };

/** Declared in `VideosModule` (it reads videos); `ChannelsModule` serves GET /me/subscriptions. */
@ApiTags('subscriptions')
@ApiBearerAuth('access-token')
@SkipThrottle()
@Controller('me')
export class SubscriptionFeedController {
  constructor(private readonly videoListing: VideoListingService) {}

  @Get('subscriptions/videos')
  @ApiOperation({
    summary: 'Latest videos of the channels I follow',
    description:
      'Published, public and ready videos of every followed channel, newest published_at first, ' +
      'in the same card shape and keyset pagination as GET /channels/:nickname/videos. ' +
      'Empty when the caller follows no channel.',
  })
  @ApiResponse({ status: 200, type: PublicVideoPageDto })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR — malformed cursor or invalid limit',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: errorSchema,
  })
  async listFeed(
    @CurrentUser() user: JwtPayload,
    @Query() query: PublicChannelVideosQueryDto,
  ): Promise<PublicVideoPageDto> {
    return this.videoListing.listSubscriptionFeed(
      user.sub,
      query.cursor,
      query.limit,
    );
  }
}
