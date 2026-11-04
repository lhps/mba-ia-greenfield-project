import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import request from 'supertest';
import {
  createConfirmedUser,
  createVideosApp,
  resetVideosState,
  seedVideo,
  type VideosE2eContext,
} from './helpers/videos-e2e';

const OWNER = 'get_owner@example.com';

describe('videos-get', () => {
  let ctx: VideosE2eContext;
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? '',
      secretAccessKey: process.env.S3_SECRET_KEY ?? '',
    },
  });

  beforeAll(async () => {
    ctx = await createVideosApp();
  });

  afterAll(async () => {
    s3.destroy();
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetVideosState(ctx);
    await createConfirmedUser(ctx.app, OWNER);
  });

  async function seedReady() {
    const video = await seedVideo(ctx, OWNER, {
      processing_status: 'ready',
      duration_seconds: 2.0,
      width: 320,
      height: 240,
    });
    const thumbnailKey = `videos/${video.id}/thumbnail.jpg`;
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: thumbnailKey,
        Body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      }),
    );
    await ctx.dataSource.query(
      'UPDATE videos SET video_key = $1, thumbnail_key = $2 WHERE id = $3',
      [`videos/${video.id}/video.mp4`, thumbnailKey, video.id],
    );
    return video;
  }

  const get = (id: string) =>
    request(ctx.app.getHttpServer()).get(`/videos/${id}`);

  // 1. Consultar vídeo pela URL única

  test('video-pronto-retorna-metadados-e-thumbnail', async () => {
    const video = await seedReady();

    const res = await get(video.public_id).expect(200);

    expect(res.body).toMatchObject({
      public_id: video.public_id,
      file_name: 'clip.mov',
      processing_status: 'ready',
      publication_status: 'draft',
      duration_seconds: 2,
      width: 320,
      height: 240,
    });
    expect(new Date(res.body.created_at).toISOString()).toBe(
      res.body.created_at,
    );
    expect(
      res.body.thumbnail_url.startsWith(process.env.S3_PUBLIC_ENDPOINT!),
    ).toBe(true);
  });

  test('video-em-processamento-retorna-metadados-nulos', async () => {
    const video = await seedVideo(ctx, OWNER, {
      processing_status: 'processing',
    });

    const res = await get(video.public_id).expect(200);

    expect(res.body).toMatchObject({
      processing_status: 'processing',
      duration_seconds: null,
      width: null,
      height: null,
      thumbnail_url: null,
    });
  });

  test('resposta-nao-expoe-campos-internos', async () => {
    const video = await seedReady();

    const res = await get(video.public_id).expect(200);

    for (const key of [
      'id',
      'channel_id',
      'upload_id',
      'original_key',
      'video_key',
      'thumbnail_key',
      'failure_reason',
    ]) {
      expect(res.body).not.toHaveProperty(key);
    }
  });

  // 2. Vídeo inexistente

  test('id-malformado-ou-desconhecido-retorna-404', async () => {
    const malformed = await get('abc').expect(404);
    expect(malformed.body.error).toBe('VIDEO_NOT_FOUND');

    const unknown = await get('AAAAAAAAAAA').expect(404);
    expect(unknown.body.error).toBe('VIDEO_NOT_FOUND');
  });
});
