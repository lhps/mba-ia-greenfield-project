import { registerAs } from '@nestjs/config';

export default registerAs('upload', () => ({
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES || '10737418240', 10),
  partSizeBytes: parseInt(process.env.UPLOAD_PART_SIZE_BYTES || '67108864', 10),
  presignedUrlTtlSeconds: parseInt(
    process.env.PRESIGNED_URL_TTL_SECONDS || '3600',
    10,
  ),
  staleUploadHours: parseInt(process.env.STALE_UPLOAD_HOURS || '48', 10),
}));
