import { ListMultipartUploadsCommand, S3Client } from '@aws-sdk/client-s3';
import request from 'supertest';
import { Video } from '../src/videos/entities/video.entity';
import {
  createConfirmedUser,
  createVideosApp,
  resetVideosState,
  type VideosE2eContext,
} from './helpers/videos-e2e';

type CreatedBody = { public_id: string };
type ErrorBody = { error: string };

describe('videos-create', () => {
  let ctx: VideosE2eContext;
  let tokenA: string;
  const validBody = {
    file_name: 'clip.mp4',
    file_size: 157286400,
    content_type: 'video/mp4',
  };

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
    tokenA = await createConfirmedUser(ctx.app, 'video_a@example.com');
  });

  const post = (token: string | null, body: object) => {
    const req = request(ctx.app.getHttpServer()).post('/videos');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body);
  };

  // 1. Pré-cadastrar vídeo como rascunho e iniciar upload

  test('cria-rascunho-e-retorna-plano-de-partes', async () => {
    const res = await post(tokenA, validBody).expect(201);

    expect(res.body).toEqual({
      public_id: expect.stringMatching(/^[A-Za-z0-9_-]{11}$/) as string,
      processing_status: 'uploading',
      publication_status: 'draft',
      part_size: 67108864,
      part_count: 3,
    });

    const video = await ctx.dataSource.getRepository(Video).findOneOrFail({
      where: { public_id: (res.body as CreatedBody).public_id },
      relations: { channel: { user: true } },
    });
    expect(video.channel.user.email).toBe('video_a@example.com');
    expect(video.file_size).toBe(157286400);
    expect(video.content_type).toBe('video/mp4');
    expect(video.upload_id).not.toBeNull();

    const { Uploads } = await s3.send(
      new ListMultipartUploadsCommand({ Bucket: process.env.S3_BUCKET }),
    );
    expect(
      Uploads?.some(
        (u) =>
          u.Key === `videos/${video.id}/original` &&
          u.UploadId === video.upload_id,
      ),
    ).toBe(true);
  });

  test('public-ids-distintos-por-upload', async () => {
    const first = await post(tokenA, validBody).expect(201);
    const second = await post(tokenA, validBody).expect(201);

    expect((first.body as CreatedBody).public_id).not.toBe(
      (second.body as CreatedBody).public_id,
    );
  });

  // 2. Validação e autenticação

  test('rejeita-file-size-acima-do-limite', async () => {
    const res = await post(tokenA, {
      ...validBody,
      file_name: 'big.mp4',
      file_size: 10737418241,
    }).expect(400);

    expect((res.body as ErrorBody).error).toBe('VALIDATION_ERROR');
    expect(
      JSON.stringify((res.body as { message: unknown }).message),
    ).toContain('file_size');
    await expect(ctx.dataSource.getRepository(Video).count()).resolves.toBe(0);
  });

  test('rejeita-content-type-fora-da-allowlist', async () => {
    const res = await post(tokenA, {
      file_name: 'doc.pdf',
      file_size: 1024,
      content_type: 'application/pdf',
    }).expect(400);
    expect((res.body as ErrorBody).error).toBe('VALIDATION_ERROR');
    await expect(ctx.dataSource.getRepository(Video).count()).resolves.toBe(0);

    const unknown = await post(tokenA, {
      ...validBody,
      processing_status: 'ready',
    }).expect(400);
    expect((unknown.body as ErrorBody).error).toBe('VALIDATION_ERROR');
  });

  test('exige-autenticacao', async () => {
    await post(null, validBody).expect(401);

    await expect(ctx.dataSource.getRepository(Video).count()).resolves.toBe(0);
  });
});
