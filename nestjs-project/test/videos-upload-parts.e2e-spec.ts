import request from 'supertest';
import { presignedRequest } from '../src/test/presigned-request';
import { Video } from '../src/videos/entities/video.entity';
import {
  createConfirmedUser,
  createVideosApp,
  resetVideosState,
  type VideosE2eContext,
} from './helpers/videos-e2e';

type PartsBody = {
  parts: { part_number: number; url: string }[];
  expires_at: string;
};
type ErrorBody = { error: string };

describe('videos-upload-parts', () => {
  let ctx: VideosE2eContext;
  let tokenA: string;
  let tokenB: string;
  let publicId: string;

  beforeAll(async () => {
    ctx = await createVideosApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetVideosState(ctx);
    tokenA = await createConfirmedUser(ctx.app, 'owner_a@example.com');
    tokenB = await createConfirmedUser(ctx.app, 'other_b@example.com');
    const created = await request(ctx.app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        file_name: 'clip.mp4',
        file_size: 157286400,
        content_type: 'video/mp4',
      })
      .expect(201);
    publicId = (created.body as { public_id: string }).public_id;
  });

  const parts = (id: string, token: string | null, body: object) => {
    const req = request(ctx.app.getHttpServer()).post(
      `/videos/${id}/upload/parts`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body);
  };

  // 1. Emitir URLs presignadas de partes para o dono

  test('dono-recebe-urls-presignadas', async () => {
    const res = await parts(publicId, tokenA, { part_numbers: [1, 2] }).expect(
      200,
    );

    const body = res.body as PartsBody;
    expect(body.parts.map((p) => p.part_number)).toEqual([1, 2]);
    for (const part of body.parts) {
      expect(part.url.startsWith(process.env.S3_PUBLIC_ENDPOINT!)).toBe(true);
    }
    expect(new Date(body.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  test('put-na-url-presignada-retorna-etag', async () => {
    const res = await parts(publicId, tokenA, { part_numbers: [1] }).expect(
      200,
    );

    const put = await presignedRequest((res.body as PartsBody).parts[0].url, {
      method: 'PUT',
      body: Buffer.alloc(5 * 1024 * 1024, 1),
    });

    expect(put.status).toBe(200);
    expect(put.headers.etag).toBeTruthy();
  });

  // 2. Erros de acesso e estado

  test('nao-dono-recebe-403', async () => {
    const res = await parts(publicId, tokenB, { part_numbers: [1] }).expect(
      403,
    );
    expect((res.body as ErrorBody).error).toBe('VIDEO_ACCESS_DENIED');

    await parts(publicId, null, { part_numbers: [1] }).expect(401);
  });

  test('id-desconhecido-ou-malformado-retorna-404', async () => {
    const unknown = await parts('AAAAAAAAAAA', tokenA, {
      part_numbers: [1],
    }).expect(404);
    expect((unknown.body as ErrorBody).error).toBe('VIDEO_NOT_FOUND');

    const malformed = await parts('abc', tokenA, { part_numbers: [1] }).expect(
      404,
    );
    expect((malformed.body as ErrorBody).error).toBe('VIDEO_NOT_FOUND');
  });

  test('numero-de-parte-fora-do-intervalo-retorna-400', async () => {
    const outOfRange = await parts(publicId, tokenA, {
      part_numbers: [4],
    }).expect(400);
    expect((outOfRange.body as ErrorBody).error).toBe('VALIDATION_ERROR');

    const empty = await parts(publicId, tokenA, { part_numbers: [] }).expect(
      400,
    );
    expect((empty.body as ErrorBody).error).toBe('VALIDATION_ERROR');
  });

  test('upload-fora-de-andamento-retorna-409', async () => {
    await ctx.dataSource
      .getRepository(Video)
      .update({ public_id: publicId }, { processing_status: 'processing' });

    const res = await parts(publicId, tokenA, { part_numbers: [1] }).expect(
      409,
    );
    expect((res.body as ErrorBody).error).toBe('UPLOAD_NOT_IN_PROGRESS');
  });
});
