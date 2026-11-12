import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { JwtPayload } from '../auth/auth.types';
import commentsConfig from '../config/comments.config';
import { COMMENT_THROTTLER_NAME } from './comments.constants';

/**
 * Per-user comment rate limit (phase-06 TD-06): `COMMENT_RATE_LIMIT` comments per
 * `COMMENT_RATE_TTL_SECONDS`, tracked by the JWT `sub` so changing IPs does not
 * reset it. Runs on its own named throttler, independent of the global per-IP
 * `ThrottlerGuard` and of `@SkipThrottle()` on the controller; it must run after
 * the global `JwtAuthGuard` has set `request.user`.
 */
@Injectable()
export class CommentThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    @Inject(commentsConfig.KEY)
    private readonly config: ConfigType<typeof commentsConfig>,
  ) {
    super(options, storageService, reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const limit = this.config.rateLimit;
    const ttl = this.config.rateTtlSeconds * 1000;
    return this.handleRequest({
      context,
      limit,
      ttl,
      blockDuration: ttl,
      throttler: {
        name: COMMENT_THROTTLER_NAME,
        limit,
        ttl,
        ignoreUserAgents: [],
        setHeaders: true,
      },
      getTracker: (req) => this.getTracker(req),
      generateKey: (ctx, tracker, name) => this.generateKey(ctx, tracker, name),
    });
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    return Promise.resolve((req.user as JwtPayload).sub);
  }
}
