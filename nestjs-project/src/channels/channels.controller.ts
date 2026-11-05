import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
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
import { ChannelsService } from './channels.service';
import { ChannelProfileDto } from './dto/channel-profile.dto';
import { PublicChannelDto } from './dto/public-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';

const errorSchema = { $ref: getSchemaPath(ApiErrorEnvelope) };

/**
 * Channel profile routes. Static `me` routes MUST stay declared before the
 * `:nickname` route — Express matches in registration order, so `GET /channels/me`
 * resolves to the authenticated profile; `me` is also a reserved nickname, so no
 * channel can shadow it.
 */
@ApiTags('channels')
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get my channel profile',
    description:
      "Returns the caller's channel: nickname, name, description, the last nickname change " +
      'and when the 14-day nickname cooldown ends (null when a change is allowed now).',
  })
  @ApiResponse({ status: 200, type: ChannelProfileDto })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: errorSchema,
  })
  async getMine(@CurrentUser() user: JwtPayload): Promise<ChannelProfileDto> {
    return this.channelsService.getProfile(user.sub);
  }

  @Patch('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Edit my channel profile',
    description:
      'Partially updates nickname, name and/or description and returns the updated channel ' +
      '(so the client can refresh its channel slug). A new nickname must match ' +
      '^[a-z0-9_]{3,30}$, not be reserved or taken, and can change once every 14 days; ' +
      'submitting the current nickname is a no-op.',
  })
  @ApiResponse({ status: 200, type: ChannelProfileDto })
  @ApiResponse({
    status: 400,
    description: 'Body fails validation or is empty',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 409,
    description:
      'NICKNAME_TAKEN, NICKNAME_RESERVED or NICKNAME_CHANGE_COOLDOWN (changed less than 14 days ago)',
    schema: errorSchema,
  })
  async updateMine(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateChannelDto,
  ): Promise<ChannelProfileDto> {
    return this.channelsService.updateProfile(user.sub, dto);
  }

  // Must stay after every `me` route (see class comment).
  @Public()
  @Get(':nickname')
  @ApiOperation({
    summary: 'Get a public channel page header',
    description:
      'Returns the public information of the channel with this nickname (case-insensitive): ' +
      'nickname, name, description and creation date. Anonymous access.',
  })
  @ApiResponse({ status: 200, type: PublicChannelDto })
  @ApiResponse({
    status: 404,
    description: 'CHANNEL_NOT_FOUND — no channel with this nickname',
    schema: errorSchema,
  })
  async getByNickname(
    @Param('nickname') nickname: string,
  ): Promise<PublicChannelDto> {
    return this.channelsService.getPublicProfile(nickname);
  }
}
