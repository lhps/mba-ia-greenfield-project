import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { User } from '../src/users/entities/user.entity';
import type { Video } from '../src/videos/entities/video.entity';
import { STORAGE_KEYS } from '../src/videos/videos.constants';
import {
  createConfirmedUser,
  createVideosApp,
  resetVideosState,
  seedVideo,
  type VideosE2eContext,
} from './helpers/videos-e2e';

type ErrorBody = { error: string };
type PresignedBody = { url: string; expires_at: string };

const OWNER = 'read_owner@example.com';
const OTHER = 'read_other@example.com';

const VIDEO_DETAIL_FIELDS = [
  'public_id',
  'title',
  'description',
  'category',
  'file_name',
  'processing_status',
  'publication_status',
  'visibility',
  'published_at',
  'duration_seconds',
  'width',
  'height',
  'thumbnail_url',
  'created_at',
];

const INTERNAL_FIELDS = [
  'id',
  'channel_id',
  'upload_id',
  'original_key',
  'video_key',
  'thumbnail_key',
];

describe('videos-read-access', () => {
  let ctx: VideosE2eContext;
  let ownerToken: string;
  let otherToken: string;
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
    ownerToken = await createConfirmedUser(ctx.app, OWNER);
    otherToken = await createConfirmedUser(ctx.app, OTHER);
  });

  async function putObject(key: string, body: Buffer, contentType: string) {
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /** Seeds a `ready` video of OWNER with a processed MP4 and a public-read thumbnail. */
  async function seedReady(overrides: Partial<Video> = {}): Promise<Video> {
    const video = await seedVideo(ctx, OWNER, {
      processing_status: 'ready',
      duration_seconds: 2.0,
      width: 320,
      height: 240,
      ...overrides,
    });
    const videoKey = `videos/${video.id}/video.mp4`;
    const thumbnailKey = STORAGE_KEYS.thumbnail(video.id);
    await putObject(videoKey, Buffer.from('mp4'), 'video/mp4');
    await putObject(
      thumbnailKey,
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      'image/jpeg',
    );
    await ctx.dataSource.query(
      'UPDATE videos SET video_key = $1, thumbnail_key = $2 WHERE id = $3',
      [videoKey, thumbnailKey, video.id],
    );
    return video;
  }

  const seedPublished = (visibility: 'public' | 'unlisted') =>
    seedReady({
      publication_status: 'published',
      published_at: new Date('2026-11-04T08:00:00Z'),
      visibility,
    });

  const get = (path: string, token?: string) => {
    const req = request(ctx.app.getHttpServer()).get(path);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  // 1. Rascunho é privado

  test('rascunho-retorna-404-para-anonimo-e-outro-usuario', async () => {
    const video = await seedReady({ publication_status: 'draft' });

    const anonymous = await get(`/videos/${video.public_id}`).expect(404);
    expect((anonymous.body as ErrorBody).error).toBe('VIDEO_NOT_FOUND');

    const other = await get(`/videos/${video.public_id}`, otherToken).expect(
      404,
    );
    expect((other.body as ErrorBody).error).toBe('VIDEO_NOT_FOUND');
  });

  test('dono-ve-o-proprio-rascunho', async () => {
    const video = await seedReady({ publication_status: 'draft' });

    const res = await get(`/videos/${video.public_id}`, ownerToken).expect(200);

    expect(res.body).toMatchObject({
      public_id: video.public_id,
      title: 'clip',
      description: null,
      category: null,
      file_name: 'clip.mov',
      processing_status: 'ready',
      publication_status: 'draft',
      visibility: 'public',
      published_at: null,
      duration_seconds: 2,
      width: 320,
      height: 240,
    });
    for (const key of VIDEO_DETAIL_FIELDS) {
      expect(res.body).toHaveProperty(key);
    }
    for (const key of INTERNAL_FIELDS) {
      expect(res.body).not.toHaveProperty(key);
    }
  });

  test('stream-de-rascunho-so-para-o-dono', async () => {
    const video = await seedReady({ publication_status: 'draft' });

    const anonymous = await get(`/videos/${video.public_id}/stream`).expect(
      404,
    );
    expect((anonymous.body as ErrorBody).error).toBe('VIDEO_NOT_FOUND');

    const owner = await get(
      `/videos/${video.public_id}/stream`,
      ownerToken,
    ).expect(200);
    const body = owner.body as PresignedBody;
    expect(body.url.startsWith(process.env.S3_PUBLIC_ENDPOINT!)).toBe(true);
    expect(new Date(body.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  // 2. Vídeo publicado é acessível pelo link

  test('publicado-nao-listado-acessivel-sem-token', async () => {
    const video = await seedPublished('unlisted');

    const res = await get(`/videos/${video.public_id}`).expect(200);

    expect(res.body).toMatchObject({
      public_id: video.public_id,
      visibility: 'unlisted',
      publication_status: 'published',
      published_at: '2026-11-04T08:00:00.000Z',
    });
  });

  test('token-expirado-em-video-publicado-e-tratado-como-anonimo', async () => {
    const video = await seedPublished('public');
    const owner = await ctx.dataSource
      .getRepository(User)
      .findOneOrFail({ where: { email: OWNER } });
    const expiredToken = ctx.app
      .get(JwtService, { strict: false })
      .sign(
        { sub: owner.id, email: OWNER, jti: randomUUID() },
        { expiresIn: -60 },
      );

    const res = await get(`/videos/${video.public_id}`, expiredToken).expect(
      200,
    );

    expect(res.body).toMatchObject({
      public_id: video.public_id,
      publication_status: 'published',
      visibility: 'public',
    });
  });
});
