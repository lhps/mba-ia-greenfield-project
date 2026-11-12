import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import authConfig from '../config/auth.config';

/**
 * Access-token `JwtModule`, split out of `AuthModule` so modules that only need
 * `JwtService` (e.g. `OptionalJwtAuthGuard` in `ChannelsModule`) can import it
 * without the Channels → Auth → Users → Channels cycle.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [authConfig.KEY],
      useFactory: (cfg: ConfigType<typeof authConfig>) => ({
        secret: cfg.jwtSecret,
        signOptions: { expiresIn: cfg.jwtAccessExpiration as StringValue },
      }),
    }),
  ],
  exports: [JwtModule],
})
export class AuthJwtModule {}
