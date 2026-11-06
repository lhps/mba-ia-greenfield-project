import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import queueConfig from '../config/queue.config';
import viewsConfig from '../config/views.config';
import { REDIS_CLIENT, redisClientProvider } from './redis-client.provider';
import { ViewDedupStore } from './view-dedup.store';

const WINDOW_SECONDS = 120;

describe('ViewDedupStore (integration)', () => {
  let module: TestingModule;
  let store: ViewDedupStore;
  let redis: Redis;

  beforeAll(async () => {
    process.env.VIEW_DEDUP_WINDOW_SECONDS = String(WINDOW_SECONDS);
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [queueConfig, viewsConfig],
        }),
      ],
      providers: [redisClientProvider, ViewDedupStore],
    }).compile();
    store = module.get(ViewDedupStore);
    redis = module.get(REDIS_CLIENT);
  });

  afterAll(async () => {
    delete process.env.VIEW_DEDUP_WINDOW_SECONDS;
    await redis.quit();
    await module.close();
  });

  beforeEach(async () => {
    const keys = await redis.keys('views:itest-*');
    if (keys.length > 0) await redis.del(...keys);
  });

  it('should mark the first view and set the key with the window TTL', async () => {
    const first = await store.markFirstView('itest-video-a', 'anon:abc');

    expect(first).toBe(true);
    expect(await redis.get('views:itest-video-a:anon:abc')).toBe('1');
    const ttl = await redis.ttl('views:itest-video-a:anon:abc');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(WINDOW_SECONDS);
  });

  it('should return false for a repeated view and leave the key unchanged', async () => {
    await store.markFirstView('itest-video-a', 'user:1');
    const ttlBefore = await redis.ttl('views:itest-video-a:user:1');

    const repeated = await store.markFirstView('itest-video-a', 'user:1');

    expect(repeated).toBe(false);
    expect(await redis.ttl('views:itest-video-a:user:1')).toBeLessThanOrEqual(
      ttlBefore,
    );
  });

  it('should count a different viewer or a different video as a first view', async () => {
    await store.markFirstView('itest-video-a', 'user:1');

    expect(await store.markFirstView('itest-video-a', 'user:2')).toBe(true);
    expect(await store.markFirstView('itest-video-b', 'user:1')).toBe(true);
  });
});
