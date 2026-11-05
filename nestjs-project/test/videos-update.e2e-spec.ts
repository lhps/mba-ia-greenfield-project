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
  title: string;
  category: { slug: string; name: string } | null;
  visibility: string;
  publication_status: string;
};

const OWNER = 'update_owner@example.com';
const OTHER = 'update_other@example.com';

describe('videos-update', () => {
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

  const seedDraft = (overrides: Partial<Video> = {}) =>
    seedVideo(ctx, OWNER, {
      processing_status: 'ready',
      publication_status: 'draft',
      ...overrides,
    });

  const patch = (publicId: string, body: object, token?: string) => {
    const req = request(ctx.app.getHttpServer()).patch(`/videos/${publicId}`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body);
  };

  const get = (publicId: string, token: string) =>
    request(ctx.app.getHttpServer())
      .get(`/videos/${publicId}`)
      .set('Authorization', `Bearer ${token}`);

  // 1. Dono edita o vídeo

  test('edita-titulo-e-categoria', async () => {
    const video = await seedDraft();

    const res = await patch(
      video.public_id,
      { title: 'Novo título', category: 'jogos' },
      ownerToken,
    ).expect(200);

    const body = res.body as VideoDetailBody;
    expect(body.title).toBe('Novo título');
    expect(body.category).toEqual({ slug: 'jogos', name: 'Jogos' });

    const read = await get(video.public_id, ownerToken).expect(200);
    const persisted = read.body as VideoDetailBody;
    expect(persisted.title).toBe('Novo título');
    expect(persisted.category).toEqual({ slug: 'jogos', name: 'Jogos' });
  });

  test('muda-visibilidade-sem-publicar', async () => {
    const video = await seedDraft();

    const res = await patch(
      video.public_id,
      { visibility: 'unlisted' },
      ownerToken,
    ).expect(200);

    expect(res.body).toMatchObject({
      visibility: 'unlisted',
      publication_status: 'draft',
    });
  });

  // 2. Validação e regras de negócio

  test('body-vazio-ou-titulo-longo-retorna-400', async () => {
    const video = await seedDraft();

    const empty = await patch(video.public_id, {}, ownerToken).expect(400);
    expect((empty.body as ErrorBody).error).toBe('VALIDATION_ERROR');

    const longTitle = await patch(
      video.public_id,
      { title: 'a'.repeat(101) },
      ownerToken,
    ).expect(400);
    expect((longTitle.body as ErrorBody).error).toBe('VALIDATION_ERROR');
  });

  test('categoria-inexistente-retorna-400', async () => {
    const video = await seedDraft();

    const res = await patch(
      video.public_id,
      { category: 'inexistente' },
      ownerToken,
    ).expect(400);

    expect((res.body as ErrorBody).error).toBe('INVALID_CATEGORY');
  });

  test('limpar-categoria-de-video-publicado-retorna-409', async () => {
    const games = await ctx.dataSource
      .getRepository(Category)
      .findOneByOrFail({ slug: 'jogos' });
    const video = await seedDraft({
      publication_status: 'published',
      published_at: new Date('2026-11-04T08:00:00Z'),
      category_id: games.id,
    });

    const res = await patch(
      video.public_id,
      { category: null },
      ownerToken,
    ).expect(409);
    expect((res.body as ErrorBody).error).toBe('PUBLISH_REQUIREMENTS_NOT_MET');

    const read = await get(video.public_id, ownerToken).expect(200);
    expect((read.body as VideoDetailBody).category).toEqual({
      slug: 'jogos',
      name: 'Jogos',
    });
  });

  // 3. Autorização

  test('outro-usuario-403-sem-token-401', async () => {
    const video = await seedDraft();

    const other = await patch(
      video.public_id,
      { title: 'x' },
      otherToken,
    ).expect(403);
    expect((other.body as ErrorBody).error).toBe('VIDEO_ACCESS_DENIED');

    await patch(video.public_id, { title: 'x' }).expect(401);
  });
});
