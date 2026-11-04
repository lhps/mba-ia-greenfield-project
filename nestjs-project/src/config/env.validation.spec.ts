import { envValidationSchema } from './env.validation';

const baseEnv: Record<string, string> = {
  DB_USERNAME: 'user',
  DB_PASSWORD: 'pass',
  DB_NAME: 'db',
  JWT_SECRET: 'secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
  S3_ENDPOINT: 'http://seaweedfs:8333',
  S3_PUBLIC_ENDPOINT: 'http://localhost:8333',
  S3_ACCESS_KEY: 'access',
  S3_SECRET_KEY: 'secret',
  S3_BUCKET: 'streamtube-videos',
};

const validate = (env: Record<string, string | undefined>) =>
  envValidationSchema.validate(
    { ...baseEnv, ...env },
    { allowUnknown: true, abortEarly: false },
  );

describe('envValidationSchema — storage, queue and upload', () => {
  it.each([
    'S3_ENDPOINT',
    'S3_PUBLIC_ENDPOINT',
    'S3_ACCESS_KEY',
    'S3_SECRET_KEY',
    'S3_BUCKET',
  ])('should reject the environment when %s is missing', (key) => {
    const { error } = validate({ [key]: undefined });

    expect(error).toBeDefined();
    expect(error!.message).toContain(key);
  });

  it('should apply the storage, queue and upload defaults', () => {
    const { value, error } = validate({});

    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      S3_REGION: 'us-east-1',
      S3_CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
      REDIS_HOST: 'redis',
      REDIS_PORT: 6379,
      MAX_UPLOAD_BYTES: 10737418240,
      UPLOAD_PART_SIZE_BYTES: 67108864,
      PRESIGNED_URL_TTL_SECONDS: 3600,
      STALE_UPLOAD_HOURS: 48,
    });
  });

  it('should reject a part size below the 5 MiB S3 minimum', () => {
    const { error } = validate({ UPLOAD_PART_SIZE_BYTES: '1000' });

    expect(error).toBeDefined();
    expect(error!.message).toContain('UPLOAD_PART_SIZE_BYTES');
  });

  it('should accept a part size of exactly 5 MiB', () => {
    const { error } = validate({ UPLOAD_PART_SIZE_BYTES: '5242880' });

    expect(error).toBeUndefined();
  });
});
