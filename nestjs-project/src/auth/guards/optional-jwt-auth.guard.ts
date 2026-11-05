import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { BEARER_PREFIX } from '../auth.constants';
import type { JwtPayload } from '../auth.types';

/**
 * Optional authentication for `@Public()` routes (TD-04): a valid bearer token
 * sets `request.user`; a missing, malformed, invalid or expired token leaves
 * the request anonymous instead of failing with 401. The global
 * `JwtAuthGuard` lets `@Public()` routes through first, so both coexist.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: JwtPayload }>();
    const authHeader = request.headers?.authorization;
    if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) return true;

    try {
      request.user = await this.jwtService.verifyAsync<JwtPayload>(
        authHeader.slice(BEARER_PREFIX.length),
      );
    } catch {
      // Invalid or expired token on an optional-auth route: treated as anonymous.
      request.user = undefined;
    }
    return true;
  }
}
