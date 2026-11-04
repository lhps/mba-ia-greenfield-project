import {
  CreateBucketCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  S3ServiceException,
  type S3Client,
} from '@aws-sdk/client-s3';

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

/**
 * Idempotently creates a bucket and (re)applies the CORS and lifecycle rules
 * required by browser-direct multipart uploads.
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
}
