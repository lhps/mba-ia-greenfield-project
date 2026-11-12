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
import { SubscribedChannelPageDto } from './dto/subscribed-channel.dto';
import { SubscriptionsQueryDto } from './dto/subscriptions-query.dto';
import { SubscriptionsService } from './subscriptions.service';

const errorSchema = { $ref: getSchemaPath(ApiErrorEnvelope) };

@ApiTags('subscriptions')
@ApiBearerAuth('access-token')
@SkipThrottle()
@Controller('me')
export class MeSubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('subscriptions')
  @ApiOperation({
    summary: 'List the channels I follow',
    description:
      'Most recent subscription first, with keyset pagination: pass the previous `next_cursor` ' +
      'as `cursor` (null on the last page). Empty when the caller follows no channel.',
  })
  @ApiResponse({ status: 200, type: SubscribedChannelPageDto })
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
  async listMine(
    @CurrentUser() user: JwtPayload,
    @Query() query: SubscriptionsQueryDto,
  ): Promise<SubscribedChannelPageDto> {
    return this.subscriptions.listMine(user.sub, query.cursor, query.limit);
  }
}
