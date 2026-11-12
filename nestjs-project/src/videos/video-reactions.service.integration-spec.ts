import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Category } from '../categories/entities/category.entity';
import { Channel } from '../channels/entities/channel.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { VideoReaction } from './entities/video-reaction.entity';
import { Video } from './entities/video.entity';
import { generatePublicId } from './public-id.util';
import { VideoAccessService } from './video-access.service';
import { VideoReactionsService } from './video-reactions.service';

const USER_COUNT = 10;

describe('VideoReactionsService (integration)', () => {
  let module: TestingModule;
  let service: VideoReactionsService;
  let dataSource: DataSource;
  let video: Video;
  let userIds: string[];

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(
          createTestDataSource(
            [
              User,
              Channel,
              RefreshToken,
              VerificationToken,
              Video,
              Category,
              VideoReaction,
            ],
            { synchronize: false },
          ).options,
        ),
        TypeOrmModule.forFeature([Video]),
      ],
      providers: [VideoReactionsService, VideoAccessService],
    }).compile();
    service = module.get(VideoReactionsService);
    dataSource = module.get(DataSource);
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    const users = await dataSource.getRepository(User).save(
      Array.from({ length: USER_COUNT }, (_, index) => ({
        email: `reactor${index}@example.com`,
        password: 'hashed',
      })),
    );
    userIds = users.map((user) => user.id);
    const channel = await dataSource.getRepository(Channel).save({
      name: 'owner',
      nickname: 'reactions_owner',
      user_id: userIds[0],
    });
    video = await dataSource.getRepository(Video).save({
      channel_id: channel.id,
      public_id: generatePublicId(),
      file_name: 'clip.mp4',
      title: 'clip',
      file_size: 1024,
      content_type: 'video/mp4',
      original_key: 'videos/x/original',
      processing_status: 'ready',
      publication_status: 'published',
      published_at: new Date(),
    });
  });

  const expectCountersToMatchRows = async (): Promise<void> => {
    const rows = await dataSource.query<{ value: string; count: string }[]>(
      `SELECT value, COUNT(*)::text AS count FROM video_reactions
       WHERE video_id = $1 GROUP BY value`,
      [video.id],
    );
    const byValue = Object.fromEntries(
      rows.map((row) => [row.value, Number(row.count)]),
    );
    const stored = await dataSource
      .getRepository(Video)
      .findOneByOrFail({ id: video.id });
    expect(stored.like_count).toBe(byValue.like ?? 0);
    expect(stored.dislike_count).toBe(byValue.dislike ?? 0);
  };

  it('should keep the counters equal to the reaction rows after a set/clear sequence', async () => {
    const [a, b, c] = userIds;
    await service.set(video.public_id, a, 'like');
    await service.set(video.public_id, b, 'like');
    await service.set(video.public_id, c, 'dislike');
    await service.set(video.public_id, a, 'dislike');
    await service.set(video.public_id, a, 'dislike');
    await service.clear(video.public_id, b);
    await service.clear(video.public_id, b);
    const last = await service.set(video.public_id, c, 'like');

    expect(last).toEqual({ like_count: 1, my_reaction: 'like' });
    await expectCountersToMatchRows();
  });

  it('should count every like of concurrent distinct users', async () => {
    await Promise.all(
      userIds.map((userId) => service.set(video.public_id, userId, 'like')),
    );

    const stored = await dataSource
      .getRepository(Video)
      .findOneByOrFail({ id: video.id });
    expect(stored.like_count).toBe(USER_COUNT);
    await expectCountersToMatchRows();
  });

  it('should never drift or go negative under concurrent like/clear of one user', async () => {
    const [userId] = userIds;
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        index % 2 === 0
          ? service.set(video.public_id, userId, 'like')
          : service.clear(video.public_id, userId),
      ),
    );

    const stored = await dataSource
      .getRepository(Video)
      .findOneByOrFail({ id: video.id });
    expect(stored.like_count).toBeGreaterThanOrEqual(0);
    expect(stored.like_count).toBeLessThanOrEqual(1);
    await expectCountersToMatchRows();
  });

  it('should keep one row when the same user sets concurrently for the first time', async () => {
    const [userId] = userIds;
    await Promise.all(
      Array.from({ length: 5 }, () =>
        service.set(video.public_id, userId, 'like'),
      ),
    );

    const stored = await dataSource
      .getRepository(Video)
      .findOneByOrFail({ id: video.id });
    expect(stored.like_count).toBe(1);
    await expectCountersToMatchRows();
  });
});
