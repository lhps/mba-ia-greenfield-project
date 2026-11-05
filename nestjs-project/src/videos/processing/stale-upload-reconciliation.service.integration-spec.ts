import { ListMultipartUploadsCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { VerificationToken } from '../../auth/entities/verification-token.entity';
import { Channel } from '../../channels/entities/channel.entity';
import storageConfig from '../../config/storage.config';
import uploadConfig from '../../config/upload.config';
import { S3_CLIENTS } from '../../storage/storage.constants';
import { StorageModule } from '../../storage/storage.module';
import { StorageService } from '../../storage/storage.service';
import { cleanAllTables } from '../../test/create-test-data-source';
import { User } from '../../users/entities/user.entity';
import { Video } from '../entities/video.entity';
import { Category } from '../../categories/entities/category.entity';
import { generatePublicId } from '../public-id.util';
import { STORAGE_KEYS, type ProcessingStatus } from '../videos.constants';
import { StaleUploadReconciliationService } from './stale-upload-reconciliation.service';

describe('StaleUploadReconciliationService (integration)', () => {
  const originalBucket = process.env.S3_BUCKET;
  let module: TestingModule;
  let service: StaleUploadReconciliationService;
  let storage: StorageService;
  let dataSource: DataSource;
  let s3: S3Client;
  let channelId: string;

  beforeAll(async () => {
    process.env.S3_BUCKET = `${originalBucket}-test`;
    process.env.STALE_UPLOAD_HOURS = '48';
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
      ],
      providers: [StaleUploadReconciliationService],
    }).compile();
    service = module.get(StaleUploadReconciliationService);
    storage = module.get(StorageService);
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
      .save({ email: 'stale@example.com', password: 'hashed' });
    channelId = (
      await dataSource
        .getRepository(Channel)
        .save({ name: 'stale', nickname: 'stale', user_id: user.id })
    ).id;
  });

  async function seed(
    status: ProcessingStatus,
    ageHours: number,
    withUpload = false,
  ) {
    const repository = dataSource.getRepository(Video);
    const video = await repository.save(
      repository.create({
        channel_id: channelId,
        public_id: generatePublicId(),
        file_name: 'clip.mp4',
        title: 'clip',
        file_size: 1024,
        content_type: 'video/mp4',
        original_key: 'pending',
        processing_status: status,
      }),
    );
    const key = STORAGE_KEYS.original(video.id);
    const uploadId = withUpload
      ? await storage.createMultipartUpload(key, 'video/mp4')
      : null;
    await dataSource.query(
      `UPDATE videos SET original_key = $1, upload_id = $2, created_at = now() - ($3 || ' hours')::interval WHERE id = $4`,
      [key, uploadId, String(ageHours), video.id],
    );
    return { id: video.id, uploadId };
  }

  const find = (id: string) =>
    dataSource.getRepository(Video).findOneByOrFail({ id });

  const liveUploadIds = async () => {
    const { Uploads } = await s3.send(
      new ListMultipartUploadsCommand({ Bucket: process.env.S3_BUCKET }),
    );
    return (Uploads ?? []).map((u) => u.UploadId);
  };

  it('should abort stale multipart uploads and fail their drafts', async () => {
    const stale = await seed('uploading', 49, true);

    await expect(service.reconcile()).resolves.toBe(1);

    await expect(find(stale.id)).resolves.toMatchObject({
      processing_status: 'failed',
      failure_reason: 'UPLOAD_ABANDONED',
      upload_id: null,
    });
    expect(await liveUploadIds()).not.toContain(stale.uploadId);
  });

  it('should leave fresh uploads and non-uploading videos untouched', async () => {
    const fresh = await seed('uploading', 1, true);
    const processing = await seed('processing', 72);
    const ready = await seed('ready', 72);

    await expect(service.reconcile()).resolves.toBe(0);

    await expect(find(fresh.id)).resolves.toMatchObject({
      processing_status: 'uploading',
    });
    await expect(find(processing.id)).resolves.toMatchObject({
      processing_status: 'processing',
    });
    await expect(find(ready.id)).resolves.toMatchObject({
      processing_status: 'ready',
    });
    expect(await liveUploadIds()).toContain(fresh.uploadId);
    await storage.abortMultipartUpload(
      STORAGE_KEYS.original(fresh.id),
      fresh.uploadId!,
    );
  });

  it('should be a no-op on a second run and tolerate an already-aborted upload', async () => {
    const stale = await seed('uploading', 49, true);
    await storage.abortMultipartUpload(
      STORAGE_KEYS.original(stale.id),
      stale.uploadId!,
    );

    await expect(service.reconcile()).resolves.toBe(1);
    await expect(service.reconcile()).resolves.toBe(0);
    await expect(find(stale.id)).resolves.toMatchObject({
      processing_status: 'failed',
    });
  });
});
