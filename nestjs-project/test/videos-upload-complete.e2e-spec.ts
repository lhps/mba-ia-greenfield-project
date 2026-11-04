import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import request from 'supertest';
import { presignedRequest } from '../src/test/presigned-request';
import { Video } from '../src/videos/entities/video.entity';
import {
  createConfirmedUser,
  createVideosApp,
  resetVideosState,
  type VideosE2eContext,
} from './helpers/videos-e2e';

type PartsBody = { parts: { url: string }[] };
type ErrorBody = { error: string };

const FIVE_MIB = 5 * 1024 * 1024;

describe('videos-upload-complete', () => {
  let ctx: VideosE2eContext;
  let tokenA: string;
  let tokenB: string;

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
    tokenA = await createConfirmedUser(ctx.app, 'owner_a@example.com');
    tokenB = await createConfirmedUser(ctx.app, 'other_b@example.com');
  });

  /** Starts an upload and PUTs a single part; returns public_id and the part ETag. */
  async function startAndUpload(
    c: VideosE2eContext,
    token: string,
    declaredSize: number,
    bytes: number,
  ): Promise<{ publicId: string; etag: string }> {
    const server = c.app.getHttpServer();
    const created = await request(server)
      .post('/videos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        file_name: 'clip.mp4',
        file_size: declaredSize,
        content_type: 'video/mp4',
      })
      .expect(201);
    const publicId = (created.body as { public_id: string }).public_id;
    const urls = await request(server)
      .post(`/videos/${publicId}/upload/parts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ part_numbers: [1] })
      .expect(200);
    const put = await presignedRequest((urls.body as PartsBody).parts[0].url, {
      method: 'PUT',
      body: Buffer.alloc(bytes, 1),
    });
    return { publicId, etag: put.headers.etag as string };
  }

  const complete = (
    c: VideosE2eContext,
    publicId: string,
    token: string,
    parts: object[],
  ) =>
    request(c.app.getHttpServer())
      .post(`/videos/${publicId}/upload/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ parts });

  const findVideo = (c: VideosE2eContext, publicId: string) =>
    c.dataSource.getRepository(Video).findOneByOrFail({ public_id: publicId });

  // 1. Finalizar upload e enfileirar processamento

  test('completa-upload-e-enfileira-job', async () => {
    const { publicId, etag } = await startAndUpload(
      ctx,
      tokenA,
      FIVE_MIB,
      FIVE_MIB,
    );

    const res = await complete(ctx, publicId, tokenA, [
      { part_number: 1, etag },
    ]).expect(202);
    expect(res.body).toEqual({
      public_id: publicId,
      processing_status: 'processing',
    });

    const video = await findVideo(ctx, publicId);
    expect(video.processing_status).toBe('processing');
    expect(video.upload_id).toBeNull();

    const head = await s3.send(
      new HeadObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: `videos/${video.id}/original`,
      }),
    );
    expect(head.ContentLength).toBe(FIVE_MIB);

    const jobs = await ctx.processingQueue.getJobs([
      'waiting',
      'delayed',
      'active',
    ]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe(video.id);
    expect(jobs[0].name).toBe('process-video');
    expect(jobs[0].data).toEqual({ video_id: video.id });
  });

  // 2. Erros de partes, tamanho, estado e acesso

  test('etag-invalido-retorna-400-e-mantem-upload', async () => {
    const { publicId, etag } = await startAndUpload(
      ctx,
      tokenA,
      FIVE_MIB,
      FIVE_MIB,
    );

    const bad = await complete(ctx, publicId, tokenA, [
      { part_number: 1, etag: '"deadbeef"' },
    ]).expect(400);
    expect((bad.body as ErrorBody).error).toBe('UPLOAD_PARTS_INVALID');
    const video = await findVideo(ctx, publicId);
    expect(video.processing_status).toBe('uploading');
    expect(video.upload_id).not.toBeNull();
    await expect(ctx.processingQueue.getJobCounts('waiting')).resolves.toEqual({
      waiting: 0,
    });

    await complete(ctx, publicId, tokenA, [{ part_number: 1, etag }]).expect(
      202,
    );
  });

  test('arquivo-acima-do-limite-retorna-413', async () => {
    const small = await createVideosApp({ MAX_UPLOAD_BYTES: '1024' });
    try {
      await resetVideosState(small);
      const token = await createConfirmedUser(
        small.app,
        'limit_user@example.com',
      );
      const { publicId, etag } = await startAndUpload(small, token, 1000, 2048);

      const res = await complete(small, publicId, token, [
        { part_number: 1, etag },
      ]).expect(413);
      expect((res.body as ErrorBody).error).toBe('FILE_TOO_LARGE');

      const video = await findVideo(small, publicId);
      expect(video).toMatchObject({
        processing_status: 'failed',
        failure_reason: 'FILE_TOO_LARGE',
        upload_id: null,
      });
      await expect(
        s3.send(
          new HeadObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: `videos/${video.id}/original`,
          }),
        ),
      ).rejects.toThrow();
      await expect(
        small.processingQueue.getJobCounts('waiting'),
      ).resolves.toEqual({
        waiting: 0,
      });
    } finally {
      process.env.MAX_UPLOAD_BYTES = '10737418240';
      await small.app.close();
    }
  });

  test('upload-ja-completado-retorna-409', async () => {
    const { publicId, etag } = await startAndUpload(
      ctx,
      tokenA,
      FIVE_MIB,
      FIVE_MIB,
    );
    await complete(ctx, publicId, tokenA, [{ part_number: 1, etag }]).expect(
      202,
    );

    const res = await complete(ctx, publicId, tokenA, [
      { part_number: 1, etag },
    ]).expect(409);
    expect((res.body as ErrorBody).error).toBe('UPLOAD_NOT_IN_PROGRESS');
  });

  test('nao-dono-retorna-403', async () => {
    const { publicId, etag } = await startAndUpload(
      ctx,
      tokenA,
      FIVE_MIB,
      FIVE_MIB,
    );

    const res = await complete(ctx, publicId, tokenB, [
      { part_number: 1, etag },
    ]).expect(403);
    expect((res.body as ErrorBody).error).toBe('VIDEO_ACCESS_DENIED');
    await expect(findVideo(ctx, publicId)).resolves.toMatchObject({
      processing_status: 'uploading',
    });

    const empty = await complete(ctx, publicId, tokenA, []).expect(400);
    expect((empty.body as ErrorBody).error).toBe('VALIDATION_ERROR');
  });
});
