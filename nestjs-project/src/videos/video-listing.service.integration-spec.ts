import { ConfigModule } from '@nestjs/config';
import authConfig from '../config/auth.config';
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
import { Subscription } from '../channels/entities/subscription.entity';

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
          load: [storageConfig, uploadConfig, authConfig],
        }),
        TypeOrmModule.forRoot(
          createTestDataSource(
            [
              User,
              Channel,
              RefreshToken,
              VerificationToken,
              Video,
              Category,
              Subscription,
            ],
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

  describe('listSuggestions', () => {
    const categoryId = async (slug: string): Promise<string> =>
      (await dataSource.getRepository(Category).findOneByOrFail({ slug })).id;

    const eligible = (
      channelId: string,
      category: string,
      publishedAt: string,
      viewCount = 0,
    ): Partial<Video> & { channel_id: string } => ({
      channel_id: channelId,
      processing_status: 'ready',
      publication_status: 'published',
      visibility: 'public',
      category_id: category,
      published_at: new Date(publishedAt),
      view_count: viewCount,
    });

    const seedEligible = async (
      category: string,
      publishedAt: string,
      viewCount = 0,
    ): Promise<Video> =>
      seedVideo(
        otherChannelId,
        publishedAt,
        eligible(otherChannelId, category, publishedAt, viewCount),
      );

    let musica: string;
    let jogos: string;
    let current: Video;

    beforeEach(async () => {
      musica = await categoryId('musica');
      jogos = await categoryId('jogos');
      current = await seedVideo(
        ownerChannelId,
        '2026-10-01T10:00:00Z',
        eligible(ownerChannelId, musica, '2026-10-01T10:00:00Z', 100),
      );
    });

    const ids = (items: { public_id: string }[]) =>
      items.map((item) => item.public_id);

    it('should order the same category by view_count, breaking ties by the most recent published_at', async () => {
      const a = await seedEligible(musica, '2026-11-02T10:00:00Z', 5);
      const b = await seedEligible(musica, '2026-11-01T10:00:00Z', 9);
      const c = await seedEligible(musica, '2026-11-03T10:00:00Z', 5);

      const items = await service.listSuggestions(current);

      expect(ids(items)).toEqual([b.public_id, c.public_id, a.public_id]);
      expect(items[0]).toEqual({
        public_id: b.public_id,
        title: 'clip',
        thumbnail_url: null,
        duration_seconds: null,
        published_at: '2026-11-01T10:00:00.000Z',
        view_count: 9,
      });
    });

    it('should fill with the most recent videos of other categories up to 12', async () => {
      const sameCategory = [
        await seedEligible(musica, '2026-11-01T10:00:00Z', 3),
        await seedEligible(musica, '2026-11-02T10:00:00Z', 2),
        await seedEligible(musica, '2026-11-03T10:00:00Z', 1),
      ];
      const others: Video[] = [];
      for (let day = 1; day <= 15; day++) {
        others.push(
          await seedEligible(
            jogos,
            `2026-10-${String(day).padStart(2, '0')}T12:00:00Z`,
            1000,
          ),
        );
      }

      const items = await service.listSuggestions(current);

      const mostRecentOthers = others.slice(-9).reverse();
      expect(items).toHaveLength(12);
      expect(ids(items)).toEqual([
        ...ids(sameCategory),
        ...ids(mostRecentOthers),
      ]);
    });

    it('should exclude the current video, drafts, unlisted and non-ready videos', async () => {
      const base = eligible(otherChannelId, musica, '2026-11-01T10:00:00Z');
      const draft = await seedVideo(otherChannelId, '2026-11-01T10:00:00Z', {
        ...base,
        publication_status: 'draft',
      });
      const unlisted = await seedVideo(otherChannelId, '2026-11-01T10:00:00Z', {
        ...base,
        visibility: 'unlisted',
      });
      const processing = await seedVideo(
        otherChannelId,
        '2026-11-01T10:00:00Z',
        { ...base, processing_status: 'processing' },
      );
      const visible = await seedEligible(musica, '2026-11-02T10:00:00Z');

      const items = await service.listSuggestions(current);

      expect(ids(items)).toEqual([visible.public_id]);
      expect(ids(items)).not.toEqual(
        expect.arrayContaining([
          current.public_id,
          draft.public_id,
          unlisted.public_id,
          processing.public_id,
        ]),
      );
    });

    it('should return the most recent videos of any category when the current video has no category', async () => {
      const ownDraft = await seedVideo(ownerChannelId, '2026-11-05T10:00:00Z', {
        processing_status: 'ready',
        category_id: null,
      });
      const older = await seedEligible(jogos, '2026-11-01T10:00:00Z', 50);
      const newer = await seedEligible(musica, '2026-11-02T10:00:00Z', 1);

      const items = await service.listSuggestions(ownDraft);

      expect(ids(items)).toEqual([
        newer.public_id,
        older.public_id,
        current.public_id,
      ]);
    });

    it('should never return more than 12 items', async () => {
      for (let day = 1; day <= 14; day++) {
        await seedEligible(
          musica,
          `2026-11-${String(day).padStart(2, '0')}T10:00:00Z`,
          day,
        );
      }

      const items = await service.listSuggestions(current);

      expect(items).toHaveLength(12);
    });

    it('should return an empty list when no other video is eligible', async () => {
      expect(await service.listSuggestions(current)).toEqual([]);
    });
  });

  describe('listSubscriptionFeed', () => {
    let viewerId: string;
    let thirdChannelId: string;

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

    beforeEach(async () => {
      viewerId = (await createUserWithChannel('feed_viewer')).userId;
      thirdChannelId = (await createUserWithChannel('feed_third')).channelId;
      await dataSource.getRepository(Subscription).save([
        { user_id: viewerId, channel_id: ownerChannelId },
        { user_id: viewerId, channel_id: otherChannelId },
      ]);
    });

    it('should list only public, published and ready videos of followed channels, newest first', async () => {
      const ownerOld = await seedPublic(ownerChannelId, '2026-11-01T12:00:00Z');
      const otherNew = await seedPublic(otherChannelId, '2026-11-03T12:00:00Z');
      await seedPublic(ownerChannelId, '2026-11-04T12:00:00Z', {
        publication_status: 'draft',
      });
      await seedPublic(ownerChannelId, '2026-11-04T12:00:00Z', {
        visibility: 'unlisted',
      });
      await seedPublic(otherChannelId, '2026-11-04T12:00:00Z', {
        processing_status: 'processing',
      });
      await seedPublic(thirdChannelId, '2026-11-05T12:00:00Z');

      const result = await service.listSubscriptionFeed(
        viewerId,
        undefined,
        24,
      );

      expect(result.items.map((item) => item.public_id)).toEqual([
        otherNew.public_id,
        ownerOld.public_id,
      ]);
      expect(result.next_cursor).toBeNull();
    });

    it('should page through the feed by keyset without overlap', async () => {
      const seeded: Video[] = [];
      for (let day = 1; day <= 5; day++) {
        seeded.push(
          await seedPublic(
            day % 2 ? ownerChannelId : otherChannelId,
            `2026-11-0${day}T12:00:00Z`,
          ),
        );
      }

      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await service.listSubscriptionFeed(viewerId, cursor, 2);
        ids.push(...page.items.map((item) => item.public_id));
        cursor = page.next_cursor ?? undefined;
      } while (cursor !== undefined);

      expect(ids).toEqual(seeded.reverse().map((video) => video.public_id));
    });

    it('should be empty for a user who follows nobody', async () => {
      await seedPublic(ownerChannelId, '2026-11-01T12:00:00Z');
      const loner = await createUserWithChannel('feed_loner');

      await expect(
        service.listSubscriptionFeed(loner.userId, undefined, 24),
      ).resolves.toEqual({ items: [], next_cursor: null });
    });
  });
});
