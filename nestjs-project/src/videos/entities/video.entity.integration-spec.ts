import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { VerificationToken } from '../../auth/entities/verification-token.entity';
import { Channel } from '../../channels/entities/channel.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../../test/create-test-data-source';
import { User } from '../../users/entities/user.entity';
import { generatePublicId } from '../public-id.util';
import { Video } from './video.entity';
import { Category } from '../../categories/entities/category.entity';

const ALL_ENTITIES = [
  User,
  Channel,
  RefreshToken,
  VerificationToken,
  Video,
  Category,
];

describe('Video entity (integration)', () => {
  let dataSource: DataSource;
  let videoRepository: Repository<Video>;
  let channel: Channel;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    videoRepository = dataSource.getRepository(Video);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    const user = await dataSource.getRepository(User).save({
      email: 'video_owner@example.com',
      password: 'hashed',
    });
    channel = await dataSource.getRepository(Channel).save({
      name: 'owner',
      nickname: 'owner',
      user_id: user.id,
    });
  });

  const buildVideo = (overrides: Partial<Video> = {}): Partial<Video> => ({
    channel_id: channel.id,
    public_id: generatePublicId(),
    file_name: 'clip.mp4',
    title: 'clip',
    file_size: 1024,
    content_type: 'video/mp4',
    original_key: 'videos/x/original',
    ...overrides,
  });

  it('should default to uploading/draft with nullable processing fields', async () => {
    const saved = await videoRepository.save(buildVideo());
    const found = await videoRepository.findOneByOrFail({ id: saved.id });

    expect(found.processing_status).toBe('uploading');
    expect(found.publication_status).toBe('draft');
    expect(found).toMatchObject({
      upload_id: null,
      video_key: null,
      thumbnail_key: null,
      duration_seconds: null,
      width: null,
      height: null,
      video_codec: null,
      audio_codec: null,
      failure_reason: null,
    });
    expect(found.created_at).toBeInstanceOf(Date);
  });

  it('should default visibility, counters and custom-thumbnail flag for a new video', async () => {
    const saved = await videoRepository.save(buildVideo());
    const found = await videoRepository.findOneByOrFail({ id: saved.id });

    expect(found).toMatchObject({
      visibility: 'public',
      view_count: 0,
      like_count: 0,
      comment_count: 0,
      has_custom_thumbnail: false,
      description: null,
      category_id: null,
      published_at: null,
    });
  });

  it('should accept the published publication_status', async () => {
    const publishedAt = new Date();
    const saved = await videoRepository.save(
      buildVideo({
        publication_status: 'published',
        published_at: publishedAt,
      }),
    );
    const found = await videoRepository.findOneByOrFail({ id: saved.id });

    expect(found.publication_status).toBe('published');
    expect(found.published_at).toEqual(publishedAt);
  });

  it('should reject an unknown visibility', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO videos (channel_id, public_id, file_name, title, file_size, content_type, original_key, visibility)
         VALUES ($1, $2, 'a.mp4', 'a', 1, 'video/mp4', 'k', 'private')`,
        [channel.id, generatePublicId()],
      ),
    ).rejects.toThrow(/invalid input value for enum/);
  });

  it('should prevent deleting a category referenced by a video (FK RESTRICT)', async () => {
    const category = await dataSource
      .getRepository(Category)
      .findOneByOrFail({ slug: 'jogos' });
    await videoRepository.save(buildVideo({ category_id: category.id }));

    await expect(
      dataSource.query('DELETE FROM categories WHERE id = $1', [category.id]),
    ).rejects.toThrow(/foreign key/);
    await expect(
      dataSource.getRepository(Category).existsBy({ id: category.id }),
    ).resolves.toBe(true);
  });

  it('should reject a duplicated public_id', async () => {
    const publicId = generatePublicId();
    await videoRepository.save(buildVideo({ public_id: publicId }));

    await expect(
      videoRepository.save(buildVideo({ public_id: publicId })),
    ).rejects.toThrow(/duplicate key/);
  });

  it('should round-trip a 10 GiB file_size and fractional durations as numbers', async () => {
    const saved = await videoRepository.save(
      buildVideo({ file_size: 10737418240, duration_seconds: 2.04 }),
    );
    const found = await videoRepository.findOneByOrFail({ id: saved.id });

    expect(found.file_size).toBe(10737418240);
    expect(found.duration_seconds).toBe(2.04);
  });

  it('should reject an unknown processing_status', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO videos (channel_id, public_id, file_name, title, file_size, content_type, original_key, processing_status)
         VALUES ($1, $2, 'a.mp4', 'a', 1, 'video/mp4', 'k', 'published')`,
        [channel.id, generatePublicId()],
      ),
    ).rejects.toThrow(/invalid input value for enum/);
  });

  it('should reject a video for a non-existent channel and cascade on channel delete', async () => {
    await expect(
      videoRepository.save(
        buildVideo({ channel_id: '00000000-0000-0000-0000-000000000000' }),
      ),
    ).rejects.toThrow(/foreign key/);

    const saved = await videoRepository.save(buildVideo());
    await dataSource.getRepository(Channel).delete({ id: channel.id });

    await expect(
      videoRepository.findOneBy({ id: saved.id }),
    ).resolves.toBeNull();
  });
});
