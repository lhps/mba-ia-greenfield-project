import type { S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { bootstrapBucket } from '../src/storage/bucket-bootstrap';
import { S3_CLIENTS } from '../src/storage/storage.constants';
import type { Video } from '../src/videos/entities/video.entity';
import {
  createConfirmedUser,
  createVideosApp,
  resetVideosState,
  seedVideo,
  type VideosE2eContext,
} from './helpers/videos-e2e';

type ErrorBody = { error: string };
type ThumbnailBody = { thumbnail_url: string };

const OWNER = 'thumb_owner@example.com';
const OTHER = 'thumb_other@example.com';
const FIXTURES = join(__dirname, 'fixtures');
const THREE_MB = 3 * 1024 * 1024;

/** Reads width/height from the first JPEG SOF0–SOF2 segment. */
function jpegDimensions(bytes: Buffer): { width: number; height: number } {
  let offset = 2;
  while (offset < bytes.length) {
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc2) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  throw new Error('No SOF segment found');
}

describe('videos-thumbnail', () => {
  let ctx: VideosE2eContext;
  let ownerToken: string;
  let otherToken: string;
  let png: Buffer;
  let invalidJpeg: Buffer;

  beforeAll(async () => {
    ctx = await createVideosApp();
    // Same bootstrap as deploy: public-read policy on thumbnails/* of the test bucket.
    await bootstrapBucket(
      ctx.app.get<S3Client>(S3_CLIENTS.INTERNAL, { strict: false }),
      {
        bucket: process.env.S3_BUCKET!,
        corsAllowedOrigins: ['http://localhost:3001'],
        abortIncompleteDays: 1,
      },
    );
    png = await readFile(join(FIXTURES, 'thumbnail.png'));
    invalidJpeg = await readFile(join(FIXTURES, 'thumbnail-invalid.jpg'));
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetVideosState(ctx);
    ownerToken = await createConfirmedUser(ctx.app, OWNER);
    otherToken = await createConfirmedUser(ctx.app, OTHER);
  });

  const seedReady = (): Promise<Video> =>
    seedVideo(ctx, OWNER, { processing_status: 'ready' });

  const put = (
    publicId: string,
    token: string,
    file: Buffer,
    fileName: string,
  ) =>
    request(ctx.app.getHttpServer())
      .put(`/videos/${publicId}/thumbnail`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', file, fileName);

  /**
   * Anonymous (unsigned) GET straight to storage: the public URL host is the
   * browser-facing endpoint, so it is rewritten to the in-network endpoint.
   */
  const anonymousGet = (url: string): Promise<Response> =>
    fetch(
      url.replace(process.env.S3_PUBLIC_ENDPOINT!, process.env.S3_ENDPOINT!),
    );

  // 1. Dono troca a thumbnail

  test('png-valido-vira-jpeg-1280x720-publico', async () => {
    const video = await seedReady();

    const res = await put(video.public_id, ownerToken, png, 'capa.png').expect(
      200,
    );

    const { thumbnail_url } = res.body as ThumbnailBody;
    expect(thumbnail_url).toContain('/thumbnails/');
    expect(thumbnail_url).toMatch(/\.jpg$/);

    const image = await anonymousGet(thumbnail_url);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/jpeg');
    const bytes = Buffer.from(await image.arrayBuffer());
    expect(jpegDimensions(bytes)).toEqual({ width: 1280, height: 720 });
  });

  test('segundo-upload-gera-nova-url-e-apaga-a-anterior', async () => {
    const video = await seedReady();

    const first = await put(video.public_id, ownerToken, png, 'a.png').expect(
      200,
    );
    const second = await put(video.public_id, ownerToken, png, 'b.png').expect(
      200,
    );

    const u1 = (first.body as ThumbnailBody).thumbnail_url;
    const u2 = (second.body as ThumbnailBody).thumbnail_url;
    expect(u1).not.toBe(u2);

    const old = await anonymousGet(u1);
    expect(old.status).not.toBe(200);
  });

  // 2. Validação do arquivo

  test('arquivo-maior-que-2mb-retorna-413', async () => {
    const video = await seedReady();

    const res = await put(
      video.public_id,
      ownerToken,
      Buffer.alloc(THREE_MB, 0xff),
      'grande.jpg',
    ).expect(413);

    expect((res.body as ErrorBody).error).toBe('THUMBNAIL_TOO_LARGE');
  });

  test('conteudo-invalido-ou-corrompido-retorna-400', async () => {
    const video = await seedVideo(ctx, OWNER, {
      processing_status: 'ready',
      thumbnail_key: `thumbnails/${randomUUID()}/seeded.jpg`,
    });
    const before = await request(ctx.app.getHttpServer())
      .get(`/videos/${video.public_id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const text = await put(
      video.public_id,
      ownerToken,
      Buffer.from('isto nao e uma imagem\n'),
      'capa.jpg',
    ).expect(400);
    expect((text.body as ErrorBody).error).toBe('INVALID_THUMBNAIL');

    const corrupt = await put(
      video.public_id,
      ownerToken,
      invalidJpeg,
      'thumbnail-invalid.jpg',
    ).expect(400);
    expect((corrupt.body as ErrorBody).error).toBe('INVALID_THUMBNAIL');

    const after = await request(ctx.app.getHttpServer())
      .get(`/videos/${video.public_id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const original = (before.body as ThumbnailBody).thumbnail_url;
    expect(original).toContain('/seeded.jpg');
    expect((after.body as ThumbnailBody).thumbnail_url).toBe(original);
  });

  // 3. Autorização

  test('outro-usuario-retorna-403', async () => {
    const video = await seedReady();

    const res = await put(video.public_id, otherToken, png, 'capa.png').expect(
      403,
    );

    expect((res.body as ErrorBody).error).toBe('VIDEO_ACCESS_DENIED');
  });
});
