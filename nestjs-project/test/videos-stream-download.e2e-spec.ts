import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { presignedRequest } from '../src/test/presigned-request';
import {
  createConfirmedUser,
  createVideosApp,
  resetVideosState,
  seedVideo,
  type VideosE2eContext,
} from './helpers/videos-e2e';

const OWNER = 'stream_owner@example.com';

describe('videos-stream-download', () => {
  let ctx: VideosE2eContext;
  let tokenA: string;
  let tokenB: string;
  let fixture: Buffer;
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
    fixture = await readFile(join(__dirname, 'fixtures', 'sample.mp4'));
  });

  afterAll(async () => {
    s3.destroy();
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetVideosState(ctx);
    tokenA = await createConfirmedUser(ctx.app, OWNER);
    tokenB = await createConfirmedUser(ctx.app, 'stream_other@example.com');
  });

  async function seedReadyVideo() {
    const video = await seedVideo(ctx, OWNER, { processing_status: 'ready' });
    const videoKey = `videos/${video.id}/video.mp4`;
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: videoKey,
        Body: fixture,
        ContentType: 'video/mp4',
      }),
    );
    await ctx.dataSource.query(
      'UPDATE videos SET video_key = $1 WHERE id = $2',
      [videoKey, video.id],
    );
    return video;
  }

  const get = (path: string, token?: string) => {
    const req = request(ctx.app.getHttpServer()).get(path);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  // 1. Streaming por URL única

  test('stream-anonimo-de-video-pronto-suporta-range', async () => {
    const video = await seedReadyVideo();

    const res = await get(`/videos/${video.public_id}/stream`).expect(200);
    expect(res.body.url.startsWith(process.env.S3_PUBLIC_ENDPOINT!)).toBe(true);
    expect(new Date(res.body.expires_at).getTime()).toBeGreaterThan(Date.now());

    const ranged = await presignedRequest(res.body.url, {
      headers: { range: 'bytes=0-1023' },
    });
    expect(ranged.status).toBe(206);
    expect(ranged.headers['content-type']).toBe('video/mp4');
    expect(ranged.body.length).toBe(1024);
  });

  test('stream-de-video-nao-pronto-retorna-409', async () => {
    const video = await seedVideo(ctx, OWNER, {
      processing_status: 'processing',
    });

    const res = await get(`/videos/${video.public_id}/stream`).expect(409);
    expect(res.body.error).toBe('VIDEO_NOT_READY');
  });

  // 2. Download pelo dono

  test('dono-baixa-mp4-processado-como-anexo', async () => {
    const video = await seedReadyVideo();

    const res = await get(`/videos/${video.public_id}/download`, tokenA).expect(
      200,
    );
    expect(new Date(res.body.expires_at).getTime()).toBeGreaterThan(Date.now());

    const file = await presignedRequest(res.body.url);
    expect(file.status).toBe(200);
    expect(file.headers['content-disposition']).toBe(
      'attachment; filename="clip.mp4"',
    );
    expect(file.body.equals(fixture)).toBe(true);
  });

  test('download-exige-dono-e-autenticacao', async () => {
    const video = await seedReadyVideo();

    const other = await get(
      `/videos/${video.public_id}/download`,
      tokenB,
    ).expect(403);
    expect(other.body.error).toBe('VIDEO_ACCESS_DENIED');

    await get(`/videos/${video.public_id}/download`).expect(401);
  });

  test('id-desconhecido-retorna-404-em-ambos', async () => {
    const stream = await get('/videos/AAAAAAAAAAA/stream').expect(404);
    expect(stream.body.error).toBe('VIDEO_NOT_FOUND');

    const download = await get('/videos/AAAAAAAAAAA/download', tokenA).expect(
      404,
    );
    expect(download.body.error).toBe('VIDEO_NOT_FOUND');
  });
});
