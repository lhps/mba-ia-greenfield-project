import {
  DeleteBucketCommand,
  GetBucketCorsCommand,
  GetBucketLifecycleConfigurationCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { ABORT_INCOMPLETE_RULE_ID, bootstrapBucket } from './bucket-bootstrap';

describe('bootstrapBucket (integration)', () => {
  const origin = 'http://localhost:3001';
  const bucket = `bootstrap-test-${randomUUID().slice(0, 8)}`;
  let client: S3Client;

  beforeAll(() => {
    client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? '',
        secretAccessKey: process.env.S3_SECRET_KEY ?? '',
      },
    });
  });

  afterAll(async () => {
    await client.send(new DeleteBucketCommand({ Bucket: bucket }));
    client.destroy();
  });

  const run = (): Promise<void> =>
    bootstrapBucket(client, {
      bucket,
      corsAllowedOrigins: [origin],
      abortIncompleteDays: 2,
    });

  it('should create the bucket with CORS exposing ETag and the abort-incomplete lifecycle rule', async () => {
    await run();

    await expect(
      client.send(new HeadBucketCommand({ Bucket: bucket })),
    ).resolves.toBeDefined();

    const cors = await client.send(
      new GetBucketCorsCommand({ Bucket: bucket }),
    );
    expect(cors.CORSRules).toEqual([
      expect.objectContaining({
        AllowedOrigins: [origin],
        AllowedMethods: expect.arrayContaining(['GET', 'PUT', 'HEAD']),
        ExposeHeaders: ['ETag'],
      }),
    ]);

    const lifecycle = await client.send(
      new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }),
    );
    expect(lifecycle.Rules).toEqual([
      expect.objectContaining({
        ID: ABORT_INCOMPLETE_RULE_ID,
        Status: 'Enabled',
        AbortIncompleteMultipartUpload: { DaysAfterInitiation: 2 },
      }),
    ]);
  });

  it('should be idempotent when the bucket already exists', async () => {
    await expect(run()).resolves.toBeUndefined();

    const lifecycle = await client.send(
      new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }),
    );
    expect(lifecycle.Rules).toHaveLength(1);
  });
});
