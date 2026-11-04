import {
  DeleteBucketCommand,
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetBucketLifecycleConfigurationCommand,
  GetBucketPolicyCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import {
  ABORT_INCOMPLETE_RULE_ID,
  PUBLIC_READ_STATEMENT_ID,
  bootstrapBucket,
} from './bucket-bootstrap';

interface PolicyStatement {
  Sid?: string;
  Effect: string;
  Principal: unknown;
  Action: string | string[];
  Resource: string | string[];
}

const asArray = (value: string | string[]): string[] =>
  Array.isArray(value) ? value : [value];

describe('bootstrapBucket (integration)', () => {
  const origin = 'http://localhost:3001';
  const bucket = `bootstrap-test-${randomUUID().slice(0, 8)}`;
  let client: S3Client;

  beforeAll(() => {
    client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'us-east-1',
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
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

  const run = (target = bucket): Promise<void> =>
    bootstrapBucket(client, {
      bucket: target,
      corsAllowedOrigins: [origin],
      abortIncompleteDays: 2,
    });

  const readPolicy = async (target: string): Promise<PolicyStatement[]> => {
    const { Policy } = await client.send(
      new GetBucketPolicyCommand({ Bucket: target }),
    );
    return (JSON.parse(Policy ?? '{}') as { Statement: PolicyStatement[] })
      .Statement;
  };

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
        AllowedMethods: expect.arrayContaining([
          'GET',
          'PUT',
          'HEAD',
        ]) as string[],
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

  it('should grant anonymous s3:GetObject on the thumbnails/ prefix only', async () => {
    const statements = await readPolicy(bucket);

    expect(statements).toHaveLength(1);
    const [statement] = statements;
    expect(statement).toMatchObject({
      Sid: PUBLIC_READ_STATEMENT_ID,
      Effect: 'Allow',
    });
    expect(asArray(statement.Action)).toEqual(['s3:GetObject']);
    expect(asArray(statement.Resource)).toEqual([
      `arn:aws:s3:::${bucket}/thumbnails/*`,
    ]);
  });

  it('should be idempotent when the bucket already exists', async () => {
    await expect(run()).resolves.toBeUndefined();

    const lifecycle = await client.send(
      new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }),
    );
    expect(lifecycle.Rules).toHaveLength(1);
    await expect(readPolicy(bucket)).resolves.toHaveLength(1);
  });

  /**
   * Object reads run against the shared test bucket: SeaweedFS allocates
   * volumes per bucket (collection) and the single dev data node has no free
   * volumes for throwaway buckets.
   */
  describe('anonymous object access', () => {
    const sharedBucket = `${process.env.S3_BUCKET}-test`;
    const id = randomUUID();
    const thumbnailKey = `thumbnails/${id}/${randomUUID()}.jpg`;
    const videoKey = `videos/${id}/video.mp4`;

    const anonymousGet = (key: string): Promise<Response> =>
      fetch(`${process.env.S3_ENDPOINT}/${sharedBucket}/${key}`);

    beforeAll(async () => {
      await run(sharedBucket);
      await run(sharedBucket);
      await client.send(
        new PutObjectCommand({
          Bucket: sharedBucket,
          Key: thumbnailKey,
          Body: 'jpeg-bytes',
          ContentType: 'image/jpeg',
        }),
      );
      await client.send(
        new PutObjectCommand({
          Bucket: sharedBucket,
          Key: videoKey,
          Body: 'mp4-bytes',
          ContentType: 'video/mp4',
        }),
      );
    });

    afterAll(async () => {
      for (const key of [thumbnailKey, videoKey]) {
        await client.send(
          new DeleteObjectCommand({ Bucket: sharedBucket, Key: key }),
        );
      }
    });

    it('should return 200 image/jpeg for an object under thumbnails/', async () => {
      const response = await anonymousGet(thumbnailKey);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/jpeg');
      await expect(response.text()).resolves.toBe('jpeg-bytes');
    });

    it('should deny an object under videos/', async () => {
      const response = await anonymousGet(videoKey);

      expect(response.status).toBe(403);
    });
  });
});
