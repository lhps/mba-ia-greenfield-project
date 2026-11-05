import {
  CreateBucketCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketPolicyCommand,
  S3ServiceException,
  type S3Client,
} from '@aws-sdk/client-s3';
import { PUBLIC_READ_PREFIX } from './storage.constants';

export interface BucketBootstrapOptions {
  bucket: string;
  corsAllowedOrigins: string[];
  abortIncompleteDays: number;
}

const BUCKET_EXISTS_ERRORS = new Set([
  'BucketAlreadyOwnedByYou',
  'BucketAlreadyExists',
]);

export const CORS_MAX_AGE_SECONDS = 3000;
export const ABORT_INCOMPLETE_RULE_ID = 'abort-incomplete-multipart-uploads';
export const PUBLIC_READ_STATEMENT_ID = 'PublicReadThumbnails';

/**
 * Grants anonymous `s3:GetObject` on the public-read prefix only; every other
 * key (e.g. `videos/`) stays private and needs a presigned URL (TD-07).
 */
export function publicReadPolicy(bucket: string): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: PUBLIC_READ_STATEMENT_ID,
        Effect: 'Allow',
        Principal: '*',
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/${PUBLIC_READ_PREFIX}*`],
      },
    ],
  });
}

/**
 * Idempotently creates a bucket and (re)applies the CORS and lifecycle rules
 * required by browser-direct multipart uploads, plus the bucket policy that
 * makes only the thumbnails prefix publicly readable.
 */
export async function bootstrapBucket(
  client: S3Client,
  options: BucketBootstrapOptions,
): Promise<void> {
  const { bucket, corsAllowedOrigins, abortIncompleteDays } = options;

  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (error) {
    const alreadyExists =
      error instanceof S3ServiceException &&
      BUCKET_EXISTS_ERRORS.has(error.name);
    if (!alreadyExists) throw error;
  }

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: corsAllowedOrigins,
            AllowedMethods: ['GET', 'PUT', 'HEAD'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: CORS_MAX_AGE_SECONDS,
          },
        ],
      },
    }),
  );

  await client.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: ABORT_INCOMPLETE_RULE_ID,
            Status: 'Enabled',
            Filter: { Prefix: '' },
            AbortIncompleteMultipartUpload: {
              DaysAfterInitiation: abortIncompleteDays,
            },
          },
        ],
      },
    }),
  );

  await client.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: publicReadPolicy(bucket),
    }),
  );
}
