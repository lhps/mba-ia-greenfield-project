import { ListMultipartUploadsCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import storageConfig from '../config/storage.config';
import uploadConfig from '../config/upload.config';
import { presignedRequest } from '../test/presigned-request';
import { S3_CLIENTS } from './storage.constants';
import { MultipartCompletionError } from './storage.errors';
import { StorageModule } from './storage.module';
import { StorageService } from './storage.service';

const FIVE_MIB = 5 * 1024 * 1024;

describe('StorageService (integration)', () => {
  const originalBucket = process.env.S3_BUCKET;
  const originalPartSize = process.env.UPLOAD_PART_SIZE_BYTES;
  let module: TestingModule;
  let service: StorageService;
  let internalClient: S3Client;
  let testBucket: string;
  let tempDir: string;

  const newKey = (): string => `tests/${randomUUID()}/original`;

  beforeAll(async () => {
    testBucket = `${originalBucket}-test`;
    process.env.S3_BUCKET = testBucket;
    process.env.UPLOAD_PART_SIZE_BYTES = String(FIVE_MIB);
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [storageConfig, uploadConfig],
        }),
        StorageModule,
      ],
    }).compile();
    service = module.get(StorageService);
    internalClient = module.get(S3_CLIENTS.INTERNAL);
    tempDir = await mkdtemp(join(tmpdir(), 'storage-it-'));
  });

  afterAll(async () => {
    process.env.S3_BUCKET = originalBucket;
    process.env.UPLOAD_PART_SIZE_BYTES = originalPartSize;
    await rm(tempDir, { recursive: true, force: true });
    await module.close();
  });

  const putPart = async (
    key: string,
    uploadId: string,
    partNumber: number,
    body: Buffer,
  ): Promise<string> => {
    const { url } = await service.presignUploadPart(key, uploadId, partNumber);
    const res = await presignedRequest(url, { method: 'PUT', body });
    expect(res.status).toBe(200);
    return res.headers.etag as string;
  };

  it('should assemble an object from presigned part uploads', async () => {
    const key = newKey();
    const uploadId = await service.createMultipartUpload(key, 'video/mp4');

    const { url } = await service.presignUploadPart(key, uploadId, 1);
    expect(url.startsWith(process.env.S3_PUBLIC_ENDPOINT!)).toBe(true);
    expect(new URL(url).searchParams.has('x-amz-checksum-crc32')).toBe(false);

    const etag1 = await putPart(key, uploadId, 1, Buffer.alloc(FIVE_MIB, 1));
    const etag2 = await putPart(key, uploadId, 2, Buffer.alloc(1234, 2));
    await service.completeMultipartUpload(key, uploadId, [
      { partNumber: 2, etag: etag2 },
      { partNumber: 1, etag: etag1 },
    ]);

    await expect(service.headObject(key)).resolves.toEqual({
      contentLength: FIVE_MIB + 1234,
    });
  });

  it('should raise MultipartCompletionError on a wrong ETag and keep the upload resumable', async () => {
    const key = newKey();
    const uploadId = await service.createMultipartUpload(key, 'video/mp4');
    const etag = await putPart(key, uploadId, 1, Buffer.alloc(2048, 3));

    await expect(
      service.completeMultipartUpload(key, uploadId, [
        { partNumber: 1, etag: '"deadbeef"' },
      ]),
    ).rejects.toBeInstanceOf(MultipartCompletionError);

    await service.completeMultipartUpload(key, uploadId, [
      { partNumber: 1, etag },
    ]);
    await expect(service.headObject(key)).resolves.toEqual({
      contentLength: 2048,
    });
  });

  it('should abort an upload and tolerate aborting it again', async () => {
    const key = newKey();
    const uploadId = await service.createMultipartUpload(key, 'video/mp4');

    await service.abortMultipartUpload(key, uploadId);
    await expect(
      service.abortMultipartUpload(key, uploadId),
    ).resolves.toBeUndefined();

    const { Uploads } = await internalClient.send(
      new ListMultipartUploadsCommand({ Bucket: testBucket }),
    );
    expect(Uploads?.some((u) => u.UploadId === uploadId) ?? false).toBe(false);
  });

  it('should upload a local file in parts, download it back and delete it', async () => {
    const key = newKey();
    const source = join(tempDir, 'source.bin');
    const content = Buffer.alloc(FIVE_MIB + 777, 9);
    await writeFile(source, content);

    await service.uploadFile(source, key, 'video/mp4');
    await expect(service.headObject(key)).resolves.toEqual({
      contentLength: content.length,
    });

    const target = join(tempDir, 'target.bin');
    await service.downloadToFile(key, target);
    expect((await readFile(target)).equals(content)).toBe(true);

    await service.deleteObject(key);
    await expect(service.headObject(key)).rejects.toThrow();
  });

  it('should presign GETs that honor Range and the download disposition', async () => {
    const key = newKey();
    const source = join(tempDir, 'range.bin');
    await writeFile(source, Buffer.alloc(4096, 5));
    await service.uploadFile(source, key, 'video/mp4');

    const stream = await service.presignGetObject(key);
    expect(stream.url.startsWith(process.env.S3_PUBLIC_ENDPOINT!)).toBe(true);
    expect(stream.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const ranged = await presignedRequest(stream.url, {
      headers: { range: 'bytes=0-99' },
    });
    expect(ranged.status).toBe(206);
    expect(ranged.body.length).toBe(100);

    const download = await service.presignGetObject(key, {
      downloadFileName: 'clip.mp4',
    });
    const res = await presignedRequest(download.url);
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="clip.mp4"',
    );
  });
});
