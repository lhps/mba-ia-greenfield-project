import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { ChannelVideosQueryDto } from './dto/channel-videos-query.dto';
import { PanelVideoPageDto } from './dto/panel-video.dto';
import { PublicChannelVideosQueryDto } from './dto/public-channel-videos-query.dto';
import { PublicVideoPageDto } from './dto/public-video.dto';
import { VideoListingService } from './video-listing.service';

const errorSchema = { $ref: getSchemaPath(ApiErrorEnvelope) };

/**
 * Channel-scoped video routes. Declared in `VideosModule` (not `ChannelsModule`)
 * to avoid a ChannelsModule ↔ VideosModule cycle. Static `me/...` routes MUST
 * stay declared before the `:nickname/...` routes — Express matches in
 * registration order, so `GET /channels/me/videos` resolves to the owner panel.
 */
@ApiTags('channels')
@Controller('channels')
export class ChannelVideosController {
  constructor(private readonly videoListing: VideoListingService) {}

  @Get('me/videos')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List my channel videos (management panel)',
    description:
      "Lists every video of the caller's channel — drafts, published, processing and failed — " +
      'newest first by created_at, with offset pagination (page/per_page) and the total count.',
  })
  @ApiResponse({ status: 200, type: PanelVideoPageDto })
  @ApiResponse({
    status: 400,
    description: 'Invalid page / per_page',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: errorSchema,
  })
  async listMine(
    @CurrentUser() user: JwtPayload,
    @Query() query: ChannelVideosQueryDto,
  ): Promise<PanelVideoPageDto> {
    return this.videoListing.listOwn(user.sub, query.page, query.per_page);
  }

  // Must stay after every `me/...` route (see class comment).
  @Public()
  @Get(':nickname/videos')
  @ApiOperation({
    summary: 'List a channel public videos',
    description:
      'Lists only published, public and ready videos of the channel — drafts and unlisted ' +
      'videos never appear, not even for the owner — newest published_at first, with ' +
      'keyset pagination: pass the previous `next_cursor` as `cursor` (null on the last page).',
  })
  @ApiResponse({ status: 200, type: PublicVideoPageDto })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR — malformed cursor or invalid limit',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'CHANNEL_NOT_FOUND — no channel with this nickname',
    schema: errorSchema,
  })
  async listPublic(
    @Param('nickname') nickname: string,
    @Query() query: PublicChannelVideosQueryDto,
  ): Promise<PublicVideoPageDto> {
    return this.videoListing.listPublicByChannel(
      nickname,
      query.cursor,
      query.limit,
    );
  }
}
