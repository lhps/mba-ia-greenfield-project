import {
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
import { SubscriptionStateDto } from './dto/subscription-state.dto';
import { SubscriptionsService } from './subscriptions.service';

const errorSchema = { $ref: getSchemaPath(ApiErrorEnvelope) };

@ApiTags('channels')
@ApiBearerAuth('access-token')
@SkipThrottle()
@Controller('channels')
export class ChannelSubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Put(':nickname/subscription')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Subscribe to a channel',
    description:
      'Follows the channel with this nickname (case-insensitive). Idempotent: following it ' +
      'again changes nothing. Following your own channel is rejected.',
  })
  @ApiResponse({ status: 200, type: SubscriptionStateDto })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'CHANNEL_NOT_FOUND — no channel with this nickname',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 409,
    description: 'SELF_SUBSCRIPTION_NOT_ALLOWED — the channel is yours',
    schema: errorSchema,
  })
  async subscribe(
    @CurrentUser() user: JwtPayload,
    @Param('nickname') nickname: string,
  ): Promise<SubscriptionStateDto> {
    return this.subscriptions.subscribe(nickname, user.sub);
  }

  @Delete(':nickname/subscription')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unsubscribe from a channel',
    description:
      'Stops following the channel. Idempotent: without a subscription the count is unchanged.',
  })
  @ApiResponse({ status: 200, type: SubscriptionStateDto })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'CHANNEL_NOT_FOUND — no channel with this nickname',
    schema: errorSchema,
  })
  async unsubscribe(
    @CurrentUser() user: JwtPayload,
    @Param('nickname') nickname: string,
  ): Promise<SubscriptionStateDto> {
    return this.subscriptions.unsubscribe(nickname, user.sub);
  }
}
