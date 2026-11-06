import request from 'supertest';
import type { Redis } from 'ioredis';
import { Video } from '../src/videos/entities/video.entity';
import { REDIS_CLIENT } from '../src/views/redis-client.provider';
import {
  createConfirmedUser,
  createVideosApp,
  resetVideosState,
  seedVideo,
  type VideosE2eContext,
} from './helpers/videos-e2e';

type ErrorBody = { error: string };
type VideoDetailBody = { view_count: number };

const OWNER = 'views_owner@example.com';
const VIEWER = 'views_viewer@example.com';
const IP_A = '203.0.113.7';
const IP_B = '198.51.100.9';
const AGENT = 'e2e-agent';

describe('videos-views', () => {
  let ctx: VideosE2eContext;
  let redis: Redis;
  let ownerToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    ctx = await createVideosApp();
    redis = ctx.app.get(REDIS_CLIENT);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetVideosState(ctx);
    const keys = await redis.keys('views:*');
    if (keys.length > 0) await redis.del(...keys);
    ownerToken = await createConfirmedUser(ctx.app, OWNER);
    viewerToken = await createConfirmedUser(ctx.app, VIEWER);
  });

  const seedPublished = () =>
    seedVideo(ctx, OWNER, {
      processing_status: 'ready',
      publication_status: 'published',
      visibility: 'public',
      published_at: new Date(),
      view_count: 0,
    });

  const postView = (
    publicId: string,
    headers: { forwardedFor?: string; token?: string } = {},
  ) => {
    const req = request(ctx.app.getHttpServer())
      .post(`/videos/${publicId}/views`)
      .set('User-Agent', AGENT);
    if (headers.forwardedFor) req.set('X-Forwarded-For', headers.forwardedFor);
    if (headers.token) req.set('Authorization', `Bearer ${headers.token}`);
    return req;
  };

  const viewCountOf = async (publicId: string): Promise<number> => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/videos/${publicId}`)
      .expect(200);
    return (res.body as VideoDetailBody).view_count;
  };

  // 1. Contagem e deduplicação

  it('anonimo-conta-uma-visualizacao', async () => {
    const video = await seedPublished();

    const res = await postView(video.public_id, { forwardedFor: IP_A }).expect(
      204,
    );

    expect(res.text).toBe('');
    expect(await viewCountOf(video.public_id)).toBe(1);
  });

  it('repeticao-mesmo-ip-e-ua-nao-conta', async () => {
    const video = await seedPublished();

    await postView(video.public_id, { forwardedFor: IP_A }).expect(204);
    await postView(video.public_id, { forwardedFor: IP_A }).expect(204);

    expect(await viewCountOf(video.public_id)).toBe(1);
  });

  it('ips-diferentes-contam-separadamente', async () => {
    const video = await seedPublished();

    await postView(video.public_id, { forwardedFor: IP_A }).expect(204);
    await postView(video.public_id, { forwardedFor: IP_B }).expect(204);

    expect(await viewCountOf(video.public_id)).toBe(2);
  });

  it('usuario-autenticado-deduplicado-entre-ips', async () => {
    const video = await seedPublished();

    await postView(video.public_id, {
      forwardedFor: IP_A,
      token: viewerToken,
    }).expect(204);
    await postView(video.public_id, {
      forwardedFor: IP_B,
      token: viewerToken,
    }).expect(204);

    expect(await viewCountOf(video.public_id)).toBe(1);
  });

  it('visualizacao-do-dono-nao-conta', async () => {
    const video = await seedPublished();

    await postView(video.public_id, { token: ownerToken }).expect(204);

    expect(await viewCountOf(video.public_id)).toBe(0);
  });

  // 2. Regras de acesso e prontidão

  it('rascunho-404-e-nao-pronto-409', async () => {
    const draft = await seedVideo(ctx, OWNER, {
      processing_status: 'ready',
      publication_status: 'draft',
    });
    const processing = await seedVideo(ctx, OWNER, {
      processing_status: 'processing',
      publication_status: 'published',
      visibility: 'public',
      published_at: new Date(),
    });

    const notFound = await postView(draft.public_id).expect(404);
    expect((notFound.body as ErrorBody).error).toBe('VIDEO_NOT_FOUND');

    const notReady = await postView(processing.public_id).expect(409);
    expect((notReady.body as ErrorBody).error).toBe('VIDEO_NOT_READY');

    const repository = ctx.dataSource.getRepository(Video);
    for (const { id } of [draft, processing]) {
      expect((await repository.findOneByOrFail({ id })).view_count).toBe(0);
    }
  });
});
