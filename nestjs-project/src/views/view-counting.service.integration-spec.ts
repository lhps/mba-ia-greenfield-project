import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Category } from '../categories/entities/category.entity';
import { Channel } from '../channels/entities/channel.entity';
import queueConfig from '../config/queue.config';
import viewsConfig from '../config/views.config';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { Video } from '../videos/entities/video.entity';
import { generatePublicId } from '../videos/public-id.util';
import { VideoAccessService } from '../videos/video-access.service';
import { REDIS_CLIENT, redisClientProvider } from './redis-client.provider';
import { ViewCountingService } from './view-counting.service';
import { ViewDedupStore } from './view-dedup.store';

describe('ViewCountingService (integration)', () => {
  let module: TestingModule;
  let service: ViewCountingService;
  let dataSource: DataSource;
  let redis: Redis;
  let video: Video;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [queueConfig, viewsConfig],
        }),
        TypeOrmModule.forRoot(
          createTestDataSource(
            [User, Channel, RefreshToken, VerificationToken, Video, Category],
            { synchronize: false },
          ).options,
        ),
        TypeOrmModule.forFeature([Video]),
      ],
      providers: [
        redisClientProvider,
        ViewDedupStore,
        VideoAccessService,
        ViewCountingService,
      ],
    }).compile();
    service = module.get(ViewCountingService);
    dataSource = module.get(DataSource);
    redis = module.get(REDIS_CLIENT);
  });

  afterAll(async () => {
    await redis.quit();
    await module.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    const user = await dataSource
      .getRepository(User)
      .save({ email: 'views_owner@example.com', password: 'hashed' });
    const channel = await dataSource.getRepository(Channel).save({
      name: 'views_owner',
      nickname: 'views_owner',
      user_id: user.id,
    });
    const repository = dataSource.getRepository(Video);
    video = await repository.save(
      repository.create({
        channel_id: channel.id,
        public_id: generatePublicId(),
        file_name: 'clip.mov',
        title: 'clip',
        file_size: 1024,
        content_type: 'video/quicktime',
        original_key: 'unused',
        processing_status: 'ready',
        publication_status: 'published',
        visibility: 'public',
        published_at: new Date(),
      }),
    );
  });

  afterEach(async () => {
    const keys = await redis.keys(`views:${video.public_id}:*`);
    if (keys.length > 0) await redis.del(...keys);
  });

  const viewCount = async (): Promise<number> =>
    (await dataSource.getRepository(Video).findOneByOrFail({ id: video.id }))
      .view_count;

  const anonymous = (ip: string) => ({ ip, userAgent: 'itest-agent' });

  it('should count two calls by the same viewer once', async () => {
    await service.record(video.public_id, anonymous('203.0.113.7'));
    await service.record(video.public_id, anonymous('203.0.113.7'));

    expect(await viewCount()).toBe(1);
  });

  it('should count two distinct anonymous viewers twice', async () => {
    await service.record(video.public_id, anonymous('203.0.113.7'));
    await service.record(video.public_id, anonymous('198.51.100.9'));

    expect(await viewCount()).toBe(2);
  });

  it('should lose no increment under concurrent calls by distinct viewers', async () => {
    const viewers = Array.from({ length: 20 }, (_, i) =>
      anonymous(`192.0.2.${i + 1}`),
    );

    await Promise.all(
      viewers.map((viewer) => service.record(video.public_id, viewer)),
    );

    expect(await viewCount()).toBe(20);
  });
});
