import { ListMultipartUploadsCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigModule } from '@nestjs/config';
import authConfig from '../config/auth.config';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { presignedRequest } from '../test/presigned-request';
import { ChannelsModule } from '../channels/channels.module';
import queueConfig from '../config/queue.config';
import { QueueModule } from '../queue/queue.module';
import { QUEUES } from '../queue/queue.constants';
import { VideoProcessingQueue } from './video-processing.queue';
import { Channel } from '../channels/entities/channel.entity';
import storageConfig from '../config/storage.config';
import uploadConfig from '../config/upload.config';
import { S3_CLIENTS } from '../storage/storage.constants';
import { StorageModule } from '../storage/storage.module';
import { cleanAllTables } from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { Video } from './entities/video.entity';
import { Category } from '../categories/entities/category.entity';
import { VideoAccessService } from './video-access.service';
import { VideoUploadService } from './video-upload.service';

describe('VideoUploadService (integration)', () => {
  const originalBucket = process.env.S3_BUCKET;
  let module: TestingModule;
  let service: VideoUploadService;
  let dataSource: DataSource;
  let s3: S3Client;
  let userId: string;
  let channelId: string;

  beforeAll(async () => {
    process.env.S3_BUCKET = `${originalBucket}-test`;
    process.env.QUEUE_PREFIX = 'bull-test';
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [storageConfig, uploadConfig, queueConfig, authConfig],
        }),
        QueueModule,
        BullModule.registerQueue({ name: QUEUES.VIDEO_PROCESSING }),
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
        ChannelsModule,
        StorageModule,
      ],
      providers: [VideoUploadService, VideoAccessService, VideoProcessingQueue],
    }).compile();
    service = module.get(VideoUploadService);
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
      .save({ email: 'uploader@example.com', password: 'hashed' });
    const channel = await dataSource
      .getRepository(Channel)
      .save({ name: 'uploader', nickname: 'uploader', user_id: user.id });
    userId = user.id;
    channelId = channel.id;
  });

  it('should persist a draft under the caller channel with a live multipart upload', async () => {
    const result = await service.initiate(userId, {
      file_name: 'clip.mp4',
      file_size: 1024,
      content_type: 'video/mp4',
    });

    const video = await dataSource
      .getRepository(Video)
      .findOneByOrFail({ public_id: result.public_id });
    expect(video).toMatchObject({
      channel_id: channelId,
      processing_status: 'uploading',
      publication_status: 'draft',
      original_key: `videos/${video.id}/original`,
    });
    expect(video.upload_id).toEqual(expect.any(String));

    const { Uploads } = await s3.send(
      new ListMultipartUploadsCommand({ Bucket: process.env.S3_BUCKET }),
    );
    expect(Uploads?.some((u) => u.UploadId === video.upload_id)).toBe(true);
  });

  it('should complete an uploaded video, clear upload_id and enqueue processing', async () => {
    const queue = module.get<Queue>(getQueueToken(QUEUES.VIDEO_PROCESSING));
    await queue.obliterate({ force: true });
    const started = await service.initiate(userId, {
      file_name: 'clip.mp4',
      file_size: 1024,
      content_type: 'video/mp4',
    });
    const { parts } = await service.presignParts(
      userId,
      started.public_id,
      [1],
    );
    const put = await presignedRequest(parts[0].url, {
      method: 'PUT',
      body: Buffer.alloc(1024, 7),
    });

    const result = await service.complete(userId, started.public_id, [
      { part_number: 1, etag: put.headers.etag as string },
    ]);

    expect(result.processing_status).toBe('processing');
    const video = await dataSource
      .getRepository(Video)
      .findOneByOrFail({ public_id: started.public_id });
    expect(video.processing_status).toBe('processing');
    expect(video.upload_id).toBeNull();
    const job = await queue.getJob(video.id);
    expect(job?.data).toEqual({ video_id: video.id });
    await queue.obliterate({ force: true });
  });
});
