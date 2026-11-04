import { ListMultipartUploadsCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { ChannelsModule } from '../channels/channels.module';
import { Channel } from '../channels/entities/channel.entity';
import storageConfig from '../config/storage.config';
import uploadConfig from '../config/upload.config';
import { S3_CLIENTS } from '../storage/storage.constants';
import { StorageModule } from '../storage/storage.module';
import { cleanAllTables } from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { Video } from './entities/video.entity';
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
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [storageConfig, uploadConfig] }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST,
          port: Number(process.env.DB_PORT ?? 5432),
          username: process.env.DB_USERNAME,
          password: process.env.DB_PASSWORD,
          database: process.env.DB_NAME,
          entities: [User, Channel, RefreshToken, VerificationToken, Video],
          synchronize: false,
        }),
        TypeOrmModule.forFeature([Video]),
        ChannelsModule,
        StorageModule,
      ],
      providers: [VideoUploadService],
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
});
