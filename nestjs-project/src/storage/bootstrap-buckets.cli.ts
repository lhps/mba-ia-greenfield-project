import 'dotenv/config';
import { S3Client } from '@aws-sdk/client-s3';
import storageConfig from '../config/storage.config';
import { bootstrapBucket } from './bucket-bootstrap';

const ABORT_INCOMPLETE_DAYS = 2;

async function main(): Promise<void> {
  const config = storageConfig();
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  });

  for (const bucket of [config.bucket, `${config.bucket}-test`]) {
    await bootstrapBucket(client, {
      bucket,
      corsAllowedOrigins: config.corsAllowedOrigins,
      abortIncompleteDays: ABORT_INCOMPLETE_DAYS,
    });
    console.log(`Bucket "${bucket}" bootstrapped`);
  }
}

main().catch((error: unknown) => {
  console.error('Storage bootstrap failed:', error);
  process.exit(1);
});
