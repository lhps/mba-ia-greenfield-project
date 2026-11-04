import request from 'supertest';
import { Category } from '../src/categories/entities/category.entity';
import type { Video } from '../src/videos/entities/video.entity';
import {
  createConfirmedUser,
  createVideosApp,
  resetVideosState,
  seedVideo,
  type VideosE2eContext,
} from './helpers/videos-e2e';

type ErrorBody = { error: string };
type VideoDetailBody = {
  publication_status: string;
  published_at: string | null;
};

const OWNER = 'publish_owner@example.com';
const OTHER = 'publish_other@example.com';
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

describe('videos-publish', () => {
  let ctx: VideosE2eContext;
  let ownerToken: string;
  let otherToken: string;

  beforeAll(async () => {
    ctx = await createVideosApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetVideosState(ctx);
    ownerToken = await createConfirmedUser(ctx.app, OWNER);
    otherToken = await createConfirmedUser(ctx.app, OTHER);
  });

  const categoryId = async (slug: string): Promise<string> =>
    (await ctx.dataSource.getRepository(Category).findOneByOrFail({ slug })).id;

  const seedDraft = (overrides: Partial<Video> = {}) =>
    seedVideo(ctx, OWNER, { publication_status: 'draft', ...overrides });

  const seedReadyWithCategory = async () =>
    seedDraft({
      processing_status: 'ready',
      category_id: await categoryId('jogos'),
    });

  const post = (
    publicId: string,
    action: 'publish' | 'unpublish',
    token: string,
  ) =>
    request(ctx.app.getHttpServer())
      .post(`/videos/${publicId}/${action}`)
      .set('Authorization', `Bearer ${token}`)
      .send();

  const get = (publicId: string, token: string) =>
    request(ctx.app.getHttpServer())
      .get(`/videos/${publicId}`)
      .set('Authorization', `Bearer ${token}`);

  // 1. Publicar e despublicar

  test('publica-video-pronto-com-categoria', async () => {
    const video = await seedReadyWithCategory();

    const res = await post(video.public_id, 'publish', ownerToken).expect(200);

    const body = res.body as VideoDetailBody;
    expect(body.publication_status).toBe('published');
    expect(body.published_at).not.toBeNull();
    expect(body.published_at).toMatch(ISO_8601);
  });

  test('despublicar-e-republicar-mantem-published-at', async () => {
    const video = await seedReadyWithCategory();
    const first = await post(video.public_id, 'publish', ownerToken).expect(
      200,
    );
    const t1 = (first.body as VideoDetailBody).published_at;
    expect(t1).not.toBeNull();

    const unpublished = await post(
      video.public_id,
      'unpublish',
      ownerToken,
    ).expect(200);
    expect(unpublished.body).toMatchObject({
      publication_status: 'draft',
      published_at: t1,
    });

    const republished = await post(
      video.public_id,
      'publish',
      ownerToken,
    ).expect(200);
    expect(republished.body).toMatchObject({
      publication_status: 'published',
      published_at: t1,
    });
  });

  test('chamadas-repetidas-sao-idempotentes', async () => {
    const video = await seedReadyWithCategory();

    const firstPublish = await post(
      video.public_id,
      'publish',
      ownerToken,
    ).expect(200);
    const secondPublish = await post(
      video.public_id,
      'publish',
      ownerToken,
    ).expect(200);
    const published = firstPublish.body as VideoDetailBody;
    expect(secondPublish.body).toMatchObject({
      publication_status: published.publication_status,
      published_at: published.published_at,
    });

    const firstUnpublish = await post(
      video.public_id,
      'unpublish',
      ownerToken,
    ).expect(200);
    const secondUnpublish = await post(
      video.public_id,
      'unpublish',
      ownerToken,
    ).expect(200);
    const draft = firstUnpublish.body as VideoDetailBody;
    expect(secondUnpublish.body).toMatchObject({
      publication_status: 'draft',
      published_at: draft.published_at,
    });
  });

  // 2. Pré-condições

  test('video-em-processamento-retorna-409', async () => {
    const video = await seedDraft({
      processing_status: 'processing',
      category_id: await categoryId('jogos'),
    });

    const res = await post(video.public_id, 'publish', ownerToken).expect(409);

    expect((res.body as ErrorBody).error).toBe('VIDEO_NOT_READY');
  });

  test('sem-categoria-retorna-409', async () => {
    const video = await seedDraft({ processing_status: 'ready' });

    const res = await post(video.public_id, 'publish', ownerToken).expect(409);
    expect((res.body as ErrorBody).error).toBe('PUBLISH_REQUIREMENTS_NOT_MET');

    const read = await get(video.public_id, ownerToken).expect(200);
    expect((read.body as VideoDetailBody).publication_status).toBe('draft');
  });

  // 3. Autorização

  test('outro-usuario-retorna-403', async () => {
    const video = await seedReadyWithCategory();

    const res = await post(video.public_id, 'publish', otherToken).expect(403);

    expect((res.body as ErrorBody).error).toBe('VIDEO_ACCESS_DENIED');
  });
});
