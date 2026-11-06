import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { AuthModule } from '../auth/auth.module';
import queueConfig from '../config/queue.config';
import viewsConfig from '../config/views.config';
import { Video } from '../videos/entities/video.entity';
import { VideosModule } from '../videos/videos.module';
import { REDIS_CLIENT, redisClientProvider } from './redis-client.provider';
import { VideoViewsController } from './video-views.controller';
import { ViewCountingService } from './view-counting.service';
import { ViewDedupStore } from './view-dedup.store';

@Module({
  imports: [
    ConfigModule.forFeature(viewsConfig),
    ConfigModule.forFeature(queueConfig),
    TypeOrmModule.forFeature([Video]),
    // VideoAccessService (read rule); one-way — VideosModule never imports ViewsModule.
    VideosModule,
    // Provides JwtService for the optional-auth guard.
    AuthModule,
  ],
  controllers: [VideoViewsController],
  providers: [redisClientProvider, ViewDedupStore, ViewCountingService],
  exports: [ViewDedupStore],
})
export class ViewsModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
