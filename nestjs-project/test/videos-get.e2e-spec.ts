import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import request from 'supertest';
import { presignedRequest } from '../src/test/presigned-request';
import { STORAGE_KEYS } from '../src/videos/videos.constants';
import {
  createConfirmedUser,
  createVideosApp,
  resetVideosState,
  seedVideo,
  type VideosE2eContext,
} from './helpers/videos-e2e';

type VideoBody = { created_at: string; thumbnail_url: string };
type ErrorBody = { error: string };

const OWNER = 'get_owner@example.com';

/** Anonymous reads require a published video since Phase 04 (drafts are owner-only). */
const PUBLISHED = {
  publication_status: 'published',
  published_at: new Date('2026-11-04T08:00:00Z'),
} as const;

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

  /** Defaults to a legacy Phase 03 thumbnail key (`videos/{id}/thumbnail.jpg`). */
  async function seedReady(
    thumbnailKeyFor: (videoId: string) => string = (videoId) =>
      `videos/${videoId}/thumbnail.jpg`,
  ) {
    const video = await seedVideo(ctx, OWNER, {
      ...PUBLISHED,
      processing_status: 'ready',
      duration_seconds: 2.0,
      width: 320,
      height: 240,
    });
    const thumbnailKey = thumbnailKeyFor(video.id);
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: thumbnailKey,
        Body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
        ContentType: 'image/jpeg',
      }),
    );
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: `videos/${video.id}/video.mp4`,
        Body: Buffer.from('mp4'),
        ContentType: 'video/mp4',
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
      publication_status: 'published',
      duration_seconds: 2,
      width: 320,
      height: 240,
    });
    const body = res.body as VideoBody;
    expect(new Date(body.created_at).toISOString()).toBe(body.created_at);
    expect(body.thumbnail_url.startsWith(process.env.S3_PUBLIC_ENDPOINT!)).toBe(
      true,
    );
  });

  test('thumbnail-versionada-retorna-url-publica-estavel-e-legivel-anonimamente', async () => {
    const video = await seedReady((videoId) => STORAGE_KEYS.thumbnail(videoId));

    const res = await get(video.public_id).expect(200);

    const { thumbnail_url } = res.body as VideoBody;
    const publicPrefix = `${process.env.S3_PUBLIC_ENDPOINT}/${process.env.S3_BUCKET}/thumbnails/${video.id}/`;
    expect(thumbnail_url.startsWith(publicPrefix)).toBe(true);
    expect(thumbnail_url).toMatch(/\.jpg$/);
    expect(thumbnail_url).not.toContain('X-Amz-Signature');
    const thumbnail = await presignedRequest(thumbnail_url);
    expect(thumbnail.status).toBe(200);
    expect(thumbnail.headers['content-type']).toBe('image/jpeg');
    const videoObject = await presignedRequest(
      `${process.env.S3_PUBLIC_ENDPOINT}/${process.env.S3_BUCKET}/videos/${video.id}/video.mp4`,
    );
    expect(videoObject.status).toBe(403);
  });

  test('thumbnail-legada-retorna-url-pre-assinada-funcional', async () => {
    const video = await seedReady();

    const res = await get(video.public_id).expect(200);

    const { thumbnail_url } = res.body as VideoBody;
    expect(thumbnail_url).toContain('X-Amz-Signature');
    const thumbnail = await presignedRequest(thumbnail_url);
    expect(thumbnail.status).toBe(200);
  });

  test('video-em-processamento-retorna-metadados-nulos', async () => {
    const video = await seedVideo(ctx, OWNER, {
      ...PUBLISHED,
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
    expect((malformed.body as ErrorBody).error).toBe('VIDEO_NOT_FOUND');

    const unknown = await get('AAAAAAAAAAA').expect(404);
    expect((unknown.body as ErrorBody).error).toBe('VIDEO_NOT_FOUND');
  });
});
