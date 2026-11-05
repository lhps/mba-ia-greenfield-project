import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Category } from '../categories/entities/category.entity';
import { Channel } from '../channels/entities/channel.entity';
import { InvalidThumbnailException } from '../common/exceptions/domain.exception';
import storageConfig from '../config/storage.config';
import uploadConfig from '../config/upload.config';
import { FfmpegService } from '../media/ffmpeg.service';
import { MediaModule } from '../media/media.module';
import { S3_CLIENTS } from '../storage/storage.constants';
import { StorageModule } from '../storage/storage.module';
import { StorageService } from '../storage/storage.service';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { Video } from './entities/video.entity';
import { generatePublicId } from './public-id.util';
import { ThumbnailUrlResolver } from './thumbnail-url.resolver';
import { VideoAccessService } from './video-access.service';
import {
  VideoThumbnailService,
  type UploadedImage,
} from './video-thumbnail.service';
import { STORAGE_KEYS } from './videos.constants';

const FIXTURES = join(__dirname, '..', '..', 'test', 'fixtures');

describe('VideoThumbnailService (integration, real storage + ffmpeg)', () => {
  const originalBucket = process.env.S3_BUCKET;
  let module: TestingModule;
  let service: VideoThumbnailService;
  let dataSource: DataSource;
  let storage: StorageService;
  let ffmpeg: FfmpegService;
  let s3: S3Client;
  let bucket: string;
  let userId: string;
  let channelId: string;
  let workDir: string;
  const createdKeys: string[] = [];

  beforeAll(async () => {
    // SeaweedFS cannot allocate volumes for new buckets: reuse the shared test bucket.
    bucket = `${originalBucket}-test`;
    process.env.S3_BUCKET = bucket;
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
        StorageModule,
        MediaModule,
      ],
      providers: [
        VideoThumbnailService,
        VideoAccessService,
        ThumbnailUrlResolver,
      ],
    }).compile();
    service = module.get(VideoThumbnailService);
    dataSource = module.get(DataSource);
    storage = module.get(StorageService);
    ffmpeg = module.get(FfmpegService);
    s3 = module.get(S3_CLIENTS.INTERNAL);
    workDir = await mkdtemp(join(tmpdir(), 'thumbnail-it-'));
  });

  afterAll(async () => {
    for (const key of createdKeys) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }
    await rm(workDir, { recursive: true, force: true });
    process.env.S3_BUCKET = originalBucket;
    await module.close();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    await cleanAllTables(dataSource);
    const user = await dataSource
      .getRepository(User)
      .save({ email: 'thumb@example.com', password: 'hashed' });
    const channel = await dataSource
      .getRepository(Channel)
      .save({ name: 'thumb', nickname: 'thumb', user_id: user.id });
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

  async function putObject(key: string): Promise<void> {
    await s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'old-jpeg' }),
    );
    createdKeys.push(key);
  }

  const exists = (key: string): Promise<boolean> =>
    s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })).then(
      () => true,
      () => false,
    );

  const fixture = async (name: string): Promise<UploadedImage> => {
    const buffer = await readFile(join(FIXTURES, name));
    return { buffer, size: buffer.length };
  };

  const reload = (id: string): Promise<Video> =>
    dataSource.getRepository(Video).findOneByOrFail({ id });

  it('should store a 1280x720 JPEG under a new thumbnails/ key, flag it custom and delete the previous object', async () => {
    const previousKey = STORAGE_KEYS.thumbnail('previous');
    await putObject(previousKey);
    const video = await seedVideo({ thumbnail_key: previousKey });

    const result = await service.replace(
      video.public_id,
      userId,
      await fixture('thumbnail.png'),
    );

    const found = await reload(video.id);
    createdKeys.push(found.thumbnail_key!);
    expect(found.has_custom_thumbnail).toBe(true);
    expect(found.thumbnail_key).toMatch(
      new RegExp(`^thumbnails/${video.id}/[A-Za-z0-9_-]{16}\\.jpg$`),
    );
    expect(result.thumbnail_url).toBe(
      storage.publicObjectUrl(found.thumbnail_key!),
    );
    await expect(exists(previousKey)).resolves.toBe(false);

    const stored = join(workDir, 'stored.jpg');
    await storage.downloadToFile(found.thumbnail_key!, stored);
    await expect(ffmpeg.probe(stored)).resolves.toMatchObject({
      width: 1280,
      height: 720,
      video_codec: 'mjpeg',
    });
  }, 30000);

  it('should reject a corrupt JPEG with INVALID_THUMBNAIL and leave the row untouched', async () => {
    const previousKey = STORAGE_KEYS.thumbnail('previous');
    await putObject(previousKey);
    const video = await seedVideo({ thumbnail_key: previousKey });
    const upload = jest.spyOn(storage, 'uploadFile');

    await expect(
      service.replace(
        video.public_id,
        userId,
        await fixture('thumbnail-invalid.jpg'),
      ),
    ).rejects.toBeInstanceOf(InvalidThumbnailException);

    expect(upload).not.toHaveBeenCalled();
    await expect(reload(video.id)).resolves.toMatchObject({
      thumbnail_key: previousKey,
      has_custom_thumbnail: false,
    });
    await expect(exists(previousKey)).resolves.toBe(true);
  }, 30000);

  it('should delete the new object and keep the previous one when the row update fails', async () => {
    const previousKey = STORAGE_KEYS.thumbnail('previous');
    await putObject(previousKey);
    const video = await seedVideo({ thumbnail_key: previousKey });
    const upload = jest.spyOn(storage, 'uploadFile');
    jest
      .spyOn(dataSource.manager, 'transaction')
      .mockRejectedValueOnce(new Error('db down'));

    await expect(
      service.replace(video.public_id, userId, await fixture('thumbnail.png')),
    ).rejects.toThrow('db down');

    const newKey = upload.mock.calls[0][1];
    createdKeys.push(newKey);
    await expect(exists(newKey)).resolves.toBe(false);
    await expect(exists(previousKey)).resolves.toBe(true);
    await expect(reload(video.id)).resolves.toMatchObject({
      thumbnail_key: previousKey,
      has_custom_thumbnail: false,
    });
  }, 30000);
});
