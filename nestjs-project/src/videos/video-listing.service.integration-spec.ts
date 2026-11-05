import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  ChannelNotFoundException,
  InvalidPaginationCursorException,
} from '../common/exceptions/domain.exception';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Category } from '../categories/entities/category.entity';
import { ChannelsModule } from '../channels/channels.module';
import { Channel } from '../channels/entities/channel.entity';
import storageConfig from '../config/storage.config';
import uploadConfig from '../config/upload.config';
import { StorageModule } from '../storage/storage.module';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { Video } from './entities/video.entity';
import { generatePublicId } from './public-id.util';
import { ThumbnailUrlResolver } from './thumbnail-url.resolver';
import { VideoListingService } from './video-listing.service';

describe('VideoListingService (integration)', () => {
  let module: TestingModule;
  let service: VideoListingService;
  let dataSource: DataSource;
  let ownerId: string;
  let ownerChannelId: string;
  let otherChannelId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [storageConfig, uploadConfig],
        }),
        TypeOrmModule.forRoot(
          createTestDataSource(
            [User, Channel, RefreshToken, VerificationToken, Video, Category],
            { synchronize: false },
          ).options,
        ),
        TypeOrmModule.forFeature([Video]),
        ChannelsModule,
        StorageModule,
      ],
      providers: [VideoListingService, ThumbnailUrlResolver],
    }).compile();
    service = module.get(VideoListingService);
    dataSource = module.get(DataSource);
  });

  afterAll(async () => {
    await module.close();
  });

  async function createUserWithChannel(handle: string) {
    const user = await dataSource
      .getRepository(User)
      .save({ email: `${handle}@example.com`, password: 'hashed' });
    const channel = await dataSource
      .getRepository(Channel)
      .save({ name: handle, nickname: handle, user_id: user.id });
    return { userId: user.id, channelId: channel.id };
  }

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    const owner = await createUserWithChannel('panel_owner');
    const other = await createUserWithChannel('panel_other');
    ownerId = owner.userId;
    ownerChannelId = owner.channelId;
    otherChannelId = other.channelId;
  });

  async function seedVideo(
    channelId: string,
    createdAt: string,
    overrides: Partial<Video> = {},
  ): Promise<Video> {
    const repository = dataSource.getRepository(Video);
    return repository.save(
      repository.create({
        channel_id: channelId,
        public_id: generatePublicId(),
        file_name: 'clip.mov',
        title: 'clip',
        file_size: 1024,
        content_type: 'video/quicktime',
        original_key: 'unused',
        created_at: new Date(createdAt),
        ...overrides,
      }),
    );
  }

  it('should list only the caller channel videos, every status, newest first with zero counters', async () => {
    const draft = await seedVideo(ownerChannelId, '2026-11-01T10:00:00Z', {
      processing_status: 'ready',
    });
    const published = await seedVideo(ownerChannelId, '2026-11-02T10:00:00Z', {
      processing_status: 'ready',
      publication_status: 'published',
      published_at: new Date('2026-11-02T12:00:00Z'),
    });
    const processing = await seedVideo(ownerChannelId, '2026-11-03T10:00:00Z', {
      processing_status: 'processing',
    });
    const failed = await seedVideo(ownerChannelId, '2026-11-04T10:00:00Z', {
      processing_status: 'failed',
    });
    await seedVideo(otherChannelId, '2026-11-05T10:00:00Z');

    const result = await service.listOwn(ownerId, 1, 20);

    expect(result.total).toBe(4);
    expect(result.page).toBe(1);
    expect(result.per_page).toBe(20);
    expect(result.items.map((item) => item.public_id)).toEqual([
      failed.public_id,
      processing.public_id,
      published.public_id,
      draft.public_id,
    ]);
    expect(result.items.map((item) => item.processing_status)).toEqual([
      'failed',
      'processing',
      'ready',
      'ready',
    ]);
    for (const item of result.items) {
      expect(item).toMatchObject({
        view_count: 0,
        like_count: 0,
        comment_count: 0,
      });
    }
    expect(result.items[2]).toMatchObject({
      publication_status: 'published',
      published_at: '2026-11-02T12:00:00.000Z',
      created_at: '2026-11-02T10:00:00.000Z',
    });
    expect(result.items[3]).toMatchObject({
      publication_status: 'draft',
      published_at: null,
      thumbnail_url: null,
    });
  });

  it('should apply page/per_page as offset while reporting the full total', async () => {
    await seedVideo(ownerChannelId, '2026-11-01T10:00:00Z');
    const middle = await seedVideo(ownerChannelId, '2026-11-02T10:00:00Z');
    await seedVideo(ownerChannelId, '2026-11-03T10:00:00Z');

    const second = await service.listOwn(ownerId, 2, 1);
    const beyond = await service.listOwn(ownerId, 4, 1);

    expect(second).toMatchObject({ page: 2, per_page: 1, total: 3 });
    expect(second.items.map((item) => item.public_id)).toEqual([
      middle.public_id,
    ]);
    expect(beyond).toMatchObject({ items: [], page: 4, total: 3 });
  });

  it('should break created_at ties by public_id descending', async () => {
    const sameInstant = '2026-11-01T10:00:00Z';
    const a = await seedVideo(ownerChannelId, sameInstant, {
      public_id: 'aaaaaaaaaaa',
    });
    const b = await seedVideo(ownerChannelId, sameInstant, {
      public_id: 'bbbbbbbbbbb',
    });

    const result = await service.listOwn(ownerId, 1, 20);

    expect(result.items.map((item) => item.public_id)).toEqual([
      b.public_id,
      a.public_id,
    ]);
  });

  describe('listPublicByChannel', () => {
    const OWNER_NICKNAME = 'panel_owner';

    /** Published + public + ready unless overridden. */
    function seedPublic(
      channelId: string,
      publishedAt: string,
      overrides: Partial<Video> = {},
    ): Promise<Video> {
      return seedVideo(channelId, '2026-10-01T10:00:00Z', {
        processing_status: 'ready',
        publication_status: 'published',
        visibility: 'public',
        published_at: new Date(publishedAt),
        ...overrides,
      });
    }

    async function walkAllPages(limit: number) {
      const pages: string[][] = [];
      let cursor: string | undefined;
      do {
        const page = await service.listPublicByChannel(
          OWNER_NICKNAME,
          cursor,
          limit,
        );
        pages.push(page.items.map((item) => item.public_id));
        cursor = page.next_cursor ?? undefined;
      } while (cursor !== undefined && pages.length < 20);
      return pages;
    }

    it('should list only published, public and ready videos of that channel, newest published_at first', async () => {
      const older = await seedPublic(ownerChannelId, '2026-11-01T12:00:00Z', {
        title: 'older',
        duration_seconds: 12.5,
      });
      const newer = await seedPublic(ownerChannelId, '2026-11-03T12:00:00Z', {
        title: 'newer',
      });
      await seedPublic(ownerChannelId, '2026-11-04T12:00:00Z', {
        publication_status: 'draft',
      });
      await seedPublic(ownerChannelId, '2026-11-04T12:00:00Z', {
        visibility: 'unlisted',
      });
      await seedPublic(ownerChannelId, '2026-11-04T12:00:00Z', {
        processing_status: 'processing',
      });
      await seedPublic(ownerChannelId, '2026-11-04T12:00:00Z', {
        processing_status: 'failed',
      });
      await seedPublic(otherChannelId, '2026-11-05T12:00:00Z');

      const result = await service.listPublicByChannel(
        OWNER_NICKNAME,
        undefined,
        24,
      );

      expect(result.next_cursor).toBeNull();
      expect(result.items).toEqual([
        {
          public_id: newer.public_id,
          title: 'newer',
          thumbnail_url: null,
          duration_seconds: null,
          published_at: '2026-11-03T12:00:00.000Z',
          view_count: 0,
        },
        {
          public_id: older.public_id,
          title: 'older',
          thumbnail_url: null,
          duration_seconds: 12.5,
          published_at: '2026-11-01T12:00:00.000Z',
          view_count: 0,
        },
      ]);
    });

    it('should walk every page via next_cursor without duplicates, ending with next_cursor null', async () => {
      const seeded = [
        await seedPublic(ownerChannelId, '2026-11-01T12:00:00Z'),
        await seedPublic(ownerChannelId, '2026-11-02T12:00:00Z'),
        await seedPublic(ownerChannelId, '2026-11-03T12:00:00Z'),
        await seedPublic(ownerChannelId, '2026-11-04T12:00:00Z'),
        await seedPublic(ownerChannelId, '2026-11-05T12:00:00Z'),
      ];

      const pages = await walkAllPages(2);

      expect(pages.map((page) => page.length)).toEqual([2, 2, 1]);
      expect(pages.flat()).toEqual(
        [...seeded].reverse().map((video) => video.public_id),
      );
    });

    it('should paginate correctly when several videos share the same published_at (tuple keyset)', async () => {
      const sameInstant = '2026-11-02T12:00:00Z';
      const newest = await seedPublic(ownerChannelId, '2026-11-03T12:00:00Z');
      const tied = [
        await seedPublic(ownerChannelId, sameInstant, {
          public_id: 'aaaaaaaaaaa',
        }),
        await seedPublic(ownerChannelId, sameInstant, {
          public_id: 'bbbbbbbbbbb',
        }),
        await seedPublic(ownerChannelId, sameInstant, {
          public_id: 'ccccccccccc',
        }),
      ];
      const oldest = await seedPublic(ownerChannelId, '2026-11-01T12:00:00Z');

      const pages = await walkAllPages(2);

      expect(pages.map((page) => page.length)).toEqual([2, 2, 1]);
      expect(pages.flat()).toEqual([
        newest.public_id,
        tied[2].public_id,
        tied[1].public_id,
        tied[0].public_id,
        oldest.public_id,
      ]);
    });

    it('should keep microsecond-distinct published_at values apart across pages', async () => {
      const first = await seedPublic(ownerChannelId, '2026-11-02T12:00:00Z', {
        public_id: 'aaaaaaaaaaa',
      });
      const second = await seedPublic(ownerChannelId, '2026-11-02T12:00:00Z', {
        public_id: 'zzzzzzzzzzz',
      });
      // Same millisecond, different microseconds: the row with the lower
      // public_id is the newer one, so a millisecond-truncated cursor would
      // re-emit or skip rows.
      await dataSource.query(
        `UPDATE videos SET published_at = '2026-11-02T12:00:00.123789Z' WHERE public_id = $1`,
        [first.public_id],
      );
      await dataSource.query(
        `UPDATE videos SET published_at = '2026-11-02T12:00:00.123456Z' WHERE public_id = $1`,
        [second.public_id],
      );

      const pages = await walkAllPages(1);

      expect(pages).toEqual([[first.public_id], [second.public_id]]);
    });

    it('should return next_cursor null when the last page is exactly full, and an empty page for a channel without public videos', async () => {
      await seedPublic(ownerChannelId, '2026-11-01T12:00:00Z');
      await seedPublic(ownerChannelId, '2026-11-02T12:00:00Z');

      const full = await service.listPublicByChannel(
        OWNER_NICKNAME,
        undefined,
        2,
      );
      const empty = await service.listPublicByChannel(
        'panel_other',
        undefined,
        2,
      );

      expect(full.items).toHaveLength(2);
      expect(full.next_cursor).toBeNull();
      expect(empty).toEqual({ items: [], next_cursor: null });
    });

    it('should reject an unknown nickname and a malformed cursor with domain exceptions', async () => {
      await expect(
        service.listPublicByChannel('nao_existe', undefined, 24),
      ).rejects.toBeInstanceOf(ChannelNotFoundException);
      await expect(
        service.listPublicByChannel(OWNER_NICKNAME, 'garbage', 24),
      ).rejects.toBeInstanceOf(InvalidPaginationCursorException);
    });
  });
});
