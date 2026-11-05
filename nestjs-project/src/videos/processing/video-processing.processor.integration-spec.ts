import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { VerificationToken } from '../../auth/entities/verification-token.entity';
import { Channel } from '../../channels/entities/channel.entity';
import storageConfig from '../../config/storage.config';
import uploadConfig from '../../config/upload.config';
import { MediaModule } from '../../media/media.module';
import type { ProcessVideoJobData } from '../../queue/queue.constants';
import { S3_CLIENTS } from '../../storage/storage.constants';
import { StorageModule } from '../../storage/storage.module';
import { StorageService } from '../../storage/storage.service';
import { cleanAllTables } from '../../test/create-test-data-source';
import { User } from '../../users/entities/user.entity';
import { Video } from '../entities/video.entity';
import { Category } from '../../categories/entities/category.entity';
import { generatePublicId } from '../public-id.util';
import { STORAGE_KEYS } from '../videos.constants';
import { VideoProcessingProcessor } from './video-processing.processor';
import { VideoProcessingService } from './video-processing.service';

const FIXTURES = join(__dirname, '..', '..', '..', 'test', 'fixtures');

describe('VideoProcessingProcessor (integration)', () => {
  const originalBucket = process.env.S3_BUCKET;
  let module: TestingModule;
  let processor: VideoProcessingProcessor;
  let dataSource: DataSource;
  let s3: S3Client;
  let bucket: string;
  let channelId: string;

  beforeAll(async () => {
    bucket = `${originalBucket}-test`;
    process.env.S3_BUCKET = bucket;
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [storageConfig, uploadConfig],
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST,
          port: Number(process.env.DB_PORT ?? 5432),
          username: process.env.DB_USERNAME,
          password: process.env.DB_PASSWORD,
          database: process.env.DB_NAME,
          entities: [
            User,
            Channel,
            RefreshToken,
            VerificationToken,
            Video,
            Category,
          ],
          synchronize: false,
        }),
        TypeOrmModule.forFeature([Video]),
        StorageModule,
        MediaModule,
      ],
      providers: [VideoProcessingService, VideoProcessingProcessor],
    }).compile();
    processor = module.get(VideoProcessingProcessor);
    dataSource = module.get(DataSource);
    s3 = module.get(S3_CLIENTS.INTERNAL);
  });

  afterAll(async () => {
    process.env.S3_BUCKET = originalBucket;
    await module.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    const user = await dataSource
      .getRepository(User)
      .save({ email: 'worker@example.com', password: 'hashed' });
    channelId = (
      await dataSource
        .getRepository(Channel)
        .save({ name: 'worker', nickname: 'worker', user_id: user.id })
    ).id;
  });

  /** Seeds a `processing` video whose original object is the given fixture. */
  async function seedProcessing(fixture: string): Promise<Video> {
    const video = await dataSource.getRepository(Video).save({
      channel_id: channelId,
      public_id: generatePublicId(),
      file_name: fixture,
      title: fixture,
      file_size: 1,
      content_type: 'video/mp4',
      original_key: 'pending',
      processing_status: 'processing',
    });
    const key = STORAGE_KEYS.original(video.id);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: await readFile(join(FIXTURES, fixture)),
      }),
    );
    await dataSource
      .getRepository(Video)
      .update(video.id, { original_key: key });
    return { ...video, original_key: key };
  }

  const run = (videoId: string) =>
    processor.process({
      data: { video_id: videoId },
    } as Job<ProcessVideoJobData>);

  const exists = (key: string) =>
    s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })).then(
      () => true,
      () => false,
    );

  it('should produce the MP4 and thumbnail, persist metadata and delete the original', async () => {
    const video = await seedProcessing('sample.mp4');

    await run(video.id);

    const found = await dataSource
      .getRepository(Video)
      .findOneByOrFail({ id: video.id });
    expect(found).toMatchObject({
      processing_status: 'ready',
      width: 320,
      height: 240,
      video_codec: 'h264',
      audio_codec: 'aac',
      video_key: STORAGE_KEYS.video(video.id),
      failure_reason: null,
    });
    expect(found.thumbnail_key).toMatch(
      new RegExp(`^thumbnails/${video.id}/[A-Za-z0-9_-]{16}\\.jpg$`),
    );
    expect(found.duration_seconds).toBeCloseTo(2, 0);
    await expect(exists(STORAGE_KEYS.video(video.id))).resolves.toBe(true);
    await expect(exists(found.thumbnail_key!)).resolves.toBe(true);
    await expect(exists(video.original_key)).resolves.toBe(false);
  }, 60000);

  it('should generate a different versioned thumbnail key per write', () => {
    const videoId = '00000000-0000-0000-0000-000000000001';

    expect(STORAGE_KEYS.thumbnail(videoId)).not.toBe(
      STORAGE_KEYS.thumbnail(videoId),
    );
  });

  it('should keep a custom thumbnail when has_custom_thumbnail is true', async () => {
    const video = await seedProcessing('sample.mp4');
    const customKey = STORAGE_KEYS.thumbnail(video.id);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: customKey,
        Body: 'custom-thumbnail',
        ContentType: 'image/jpeg',
      }),
    );
    await dataSource.getRepository(Video).update(video.id, {
      thumbnail_key: customKey,
      has_custom_thumbnail: true,
    });

    await run(video.id);

    const found = await dataSource
      .getRepository(Video)
      .findOneByOrFail({ id: video.id });
    expect(found).toMatchObject({
      processing_status: 'ready',
      thumbnail_key: customKey,
      has_custom_thumbnail: true,
    });
    await expect(exists(customKey)).resolves.toBe(true);
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: customKey }));
  }, 60000);

  it('should keep a custom thumbnail uploaded while processing and discard its own auto thumbnail', async () => {
    const video = await seedProcessing('sample.mp4');
    const customKey = STORAGE_KEYS.thumbnail(video.id);
    const storage = module.get<StorageService>(StorageService);
    const realUpload = storage.uploadFile.bind(
      storage,
    ) as StorageService['uploadFile'];
    const upload = jest.spyOn(storage, 'uploadFile');
    // Simulates PUT /videos/:id/thumbnail landing after the job read has_custom_thumbnail=false.
    upload.mockImplementation(
      async (path: string, key: string, contentType: string) => {
        await realUpload(path, key, contentType);
        if (key.startsWith('thumbnails/')) {
          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: customKey,
              Body: 'custom-thumbnail',
            }),
          );
          await dataSource.getRepository(Video).update(video.id, {
            thumbnail_key: customKey,
            has_custom_thumbnail: true,
          });
        }
      },
    );
    const deleteObject = jest.spyOn(storage, 'deleteObject');

    try {
      await run(video.id);
    } finally {
      upload.mockRestore();
    }

    const found = await dataSource
      .getRepository(Video)
      .findOneByOrFail({ id: video.id });
    expect(found).toMatchObject({
      processing_status: 'ready',
      video_key: STORAGE_KEYS.video(video.id),
      thumbnail_key: customKey,
      has_custom_thumbnail: true,
    });
    const autoKey = deleteObject.mock.calls
      .map(([key]) => key)
      .find((key) => key.startsWith('thumbnails/'));
    expect(autoKey).toBeDefined();
    expect(autoKey).not.toBe(customKey);
    await expect(exists(autoKey!)).resolves.toBe(false);
    await expect(exists(customKey)).resolves.toBe(true);
    expect(deleteObject).not.toHaveBeenCalledWith(customKey);
    deleteObject.mockRestore();
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: customKey }));
  }, 60000);

  it('should replace an auto thumbnail with a new key and delete the previous object on reprocessing', async () => {
    const video = await seedProcessing('sample.mp4');
    const previousKey = STORAGE_KEYS.thumbnail(video.id);
    await s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: previousKey, Body: 'old' }),
    );
    await dataSource
      .getRepository(Video)
      .update(video.id, { thumbnail_key: previousKey });

    await run(video.id);

    const found = await dataSource
      .getRepository(Video)
      .findOneByOrFail({ id: video.id });
    expect(found.thumbnail_key).not.toBe(previousKey);
    await expect(exists(found.thumbnail_key!)).resolves.toBe(true);
    await expect(exists(previousKey)).resolves.toBe(false);
  }, 60000);

  it('should fail a non-video file with NO_VIDEO_STREAM without retrying', async () => {
    const video = await seedProcessing('not-a-video.mp4');

    const outcome = await run(video.id).then(
      () => null,
      (error: Error) => error,
    );

    const found = await dataSource
      .getRepository(Video)
      .findOneByOrFail({ id: video.id });
    if (found.failure_reason === 'NO_VIDEO_STREAM') {
      expect(outcome?.name).toBe('UnrecoverableError');
    } else {
      // ffprobe may reject garbage input outright; the job then fails and is retried as PROCESSING_ERROR.
      expect(outcome?.name).toBe('MediaProcessError');
    }
    expect(['NO_VIDEO_STREAM', null]).toContain(found.failure_reason);
  }, 60000);

  it('should be a no-op for a video that is already ready', async () => {
    const video = await seedProcessing('sample.mp4');
    await run(video.id);
    await run(video.id);

    const found = await dataSource
      .getRepository(Video)
      .findOneByOrFail({ id: video.id });
    expect(found.processing_status).toBe('ready');
  }, 60000);
});
