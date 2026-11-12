import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { CategoriesModule } from '../categories/categories.module';
import { Category } from '../categories/entities/category.entity';
import { Channel } from '../channels/entities/channel.entity';
import {
  InvalidCategoryException,
  PublishRequirementsNotMetException,
  VideoNotReadyException,
} from '../common/exceptions/domain.exception';
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
import { VideoAccessService } from './video-access.service';
import { VideoManagementService } from './video-management.service';
import { Subscription } from '../channels/entities/subscription.entity';
import { SubscriptionsService } from '../channels/subscriptions.service';
import { VideoReaction } from './entities/video-reaction.entity';
import { VideosService } from './videos.service';

describe('VideoManagementService (integration)', () => {
  let module: TestingModule;
  let service: VideoManagementService;
  let dataSource: DataSource;
  let userId: string;
  let channelId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [storageConfig, uploadConfig],
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
              VideoReaction,
            ],
            { synchronize: false },
          ).options,
        ),
        TypeOrmModule.forFeature([Video, VideoReaction]),
        CategoriesModule,
        StorageModule,
      ],
      providers: [
        VideoManagementService,
        VideoAccessService,
        VideosService,
        ThumbnailUrlResolver,
        SubscriptionsService,
      ],
    }).compile();
    service = module.get(VideoManagementService);
    dataSource = module.get(DataSource);
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    const user = await dataSource
      .getRepository(User)
      .save({ email: 'manager@example.com', password: 'hashed' });
    const channel = await dataSource
      .getRepository(Channel)
      .save({ name: 'manager', nickname: 'manager', user_id: user.id });
    userId = user.id;
    channelId = channel.id;
  });

  async function seedVideo(overrides: Partial<Video> = {}): Promise<Video> {
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
        processing_status: 'ready',
        ...overrides,
      }),
    );
  }

  const categoryBySlug = (slug: string) =>
    dataSource.getRepository(Category).findOneByOrFail({ slug });

  const reload = (id: string) =>
    dataSource
      .getRepository(Video)
      .findOneOrFail({ where: { id }, relations: { category: true } });

  it('should persist the edited fields and resolve the category relation by slug', async () => {
    const video = await seedVideo();
    const games = await categoryBySlug('jogos');

    const result = await service.update(video.public_id, userId, {
      title: 'Novo título',
      description: 'Uma descrição',
      category: 'jogos',
      visibility: 'unlisted',
    });

    expect(result).toMatchObject({
      public_id: video.public_id,
      title: 'Novo título',
      description: 'Uma descrição',
      category: { slug: 'jogos', name: 'Jogos' },
      visibility: 'unlisted',
      publication_status: 'draft',
    });
    const stored = await reload(video.id);
    expect(stored).toMatchObject({
      title: 'Novo título',
      description: 'Uma descrição',
      category_id: games.id,
      visibility: 'unlisted',
      publication_status: 'draft',
    });
    expect(stored.category?.slug).toBe('jogos');
  });

  it('should keep untouched fields, including the existing category, on a partial update', async () => {
    const music = await categoryBySlug('musica');
    const video = await seedVideo({
      description: 'keep me',
      category_id: music.id,
    });

    const result = await service.update(video.public_id, userId, {
      title: 'Only the title',
    });

    expect(result.category).toEqual({ slug: 'musica', name: 'Música' });
    const stored = await reload(video.id);
    expect(stored).toMatchObject({
      title: 'Only the title',
      description: 'keep me',
      category_id: music.id,
      visibility: 'public',
    });
  });

  it('should clear description and category of a draft when null', async () => {
    const music = await categoryBySlug('musica');
    const video = await seedVideo({
      description: 'to clear',
      category_id: music.id,
    });

    const result = await service.update(video.public_id, userId, {
      description: null,
      category: null,
    });

    expect(result).toMatchObject({ description: null, category: null });
    const stored = await reload(video.id);
    expect(stored.description).toBeNull();
    expect(stored.category_id).toBeNull();
  });

  it('should leave the row untouched when the category slug is unknown', async () => {
    const video = await seedVideo();

    await expect(
      service.update(video.public_id, userId, {
        title: 'Should not persist',
        category: 'inexistente',
      }),
    ).rejects.toBeInstanceOf(InvalidCategoryException);

    const stored = await reload(video.id);
    expect(stored.title).toBe('clip');
    expect(stored.category_id).toBeNull();
  });

  it('should keep the category of a published video when clearing is rejected', async () => {
    const games = await categoryBySlug('jogos');
    const video = await seedVideo({
      publication_status: 'published',
      published_at: new Date('2026-11-04T08:00:00Z'),
      category_id: games.id,
    });

    await expect(
      service.update(video.public_id, userId, { category: null }),
    ).rejects.toBeInstanceOf(PublishRequirementsNotMetException);

    const stored = await reload(video.id);
    expect(stored.category_id).toBe(games.id);
  });

  it('should persist state and keep the first published_at across publish → unpublish → publish', async () => {
    const games = await categoryBySlug('jogos');
    const video = await seedVideo({ category_id: games.id });

    const published = await service.publish(video.public_id, userId);
    expect(published.publication_status).toBe('published');
    expect(published.published_at).not.toBeNull();
    let stored = await reload(video.id);
    expect(stored.publication_status).toBe('published');
    const firstPublishedAt = stored.published_at?.toISOString();
    expect(firstPublishedAt).toBe(published.published_at);

    const unpublished = await service.unpublish(video.public_id, userId);
    expect(unpublished).toMatchObject({
      publication_status: 'draft',
      published_at: firstPublishedAt,
    });
    stored = await reload(video.id);
    expect(stored.publication_status).toBe('draft');
    expect(stored.published_at?.toISOString()).toBe(firstPublishedAt);

    const republished = await service.publish(video.public_id, userId);
    expect(republished).toMatchObject({
      publication_status: 'published',
      published_at: firstPublishedAt,
    });
    stored = await reload(video.id);
    expect(stored.publication_status).toBe('published');
    expect(stored.published_at?.toISOString()).toBe(firstPublishedAt);
  });

  it('should leave the row as draft when publishing is rejected', async () => {
    const games = await categoryBySlug('jogos');
    const processing = await seedVideo({
      processing_status: 'processing',
      category_id: games.id,
    });
    const uncategorized = await seedVideo();

    await expect(
      service.publish(processing.public_id, userId),
    ).rejects.toBeInstanceOf(VideoNotReadyException);
    await expect(
      service.publish(uncategorized.public_id, userId),
    ).rejects.toBeInstanceOf(PublishRequirementsNotMetException);

    for (const id of [processing.id, uncategorized.id]) {
      const stored = await reload(id);
      expect(stored.publication_status).toBe('draft');
      expect(stored.published_at).toBeNull();
    }
  });
});
