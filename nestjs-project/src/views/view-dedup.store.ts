import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { Redis } from 'ioredis';
import viewsConfig from '../config/views.config';
import { REDIS_CLIENT } from './redis-client.provider';

@Injectable()
export class ViewDedupStore {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(viewsConfig.KEY)
    private readonly config: ConfigType<typeof viewsConfig>,
  ) {}

  /** Atomically records the view; true only for the first one of this viewer in the window. */
  async markFirstView(publicId: string, viewerKey: string): Promise<boolean> {
    const result = await this.redis.set(
      `views:${publicId}:${viewerKey}`,
      '1',
      'EX',
      this.config.dedupWindowSeconds,
      'NX',
    );
    return result === 'OK';
  }
}
