import request from 'supertest';
import {
  createConfirmedUser,
  createVideosApp,
  resetVideosState,
  seedVideo,
  type VideosE2eContext,
} from './helpers/videos-e2e';

type ErrorBody = { error: string };
type PanelVideoBody = {
  public_id: string;
  title: string;
  thumbnail_url: string | null;
  processing_status: string;
  publication_status: string;
  visibility: string;
  published_at: string | null;
  created_at: string;
  duration_seconds: number | null;
  view_count: number;
  like_count: number;
  comment_count: number;
};
type PanelPageBody = {
  items: PanelVideoBody[];
  page: number;
  per_page: number;
  total: number;
};

const OWNER = 'panel_owner@example.com';
const OTHER = 'panel_other@example.com';

const PANEL_ITEM_FIELDS = [
  'public_id',
  'title',
  'thumbnail_url',
  'processing_status',
  'publication_status',
  'visibility',
  'published_at',
  'created_at',
  'duration_seconds',
];

describe('channels-me-videos', () => {
  let ctx: VideosE2eContext;
  let ownerToken: string;

  beforeAll(async () => {
    ctx = await createVideosApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetVideosState(ctx);
    ownerToken = await createConfirmedUser(ctx.app, OWNER);
    await createConfirmedUser(ctx.app, OTHER);
  });

  const listMine = (query: Record<string, number> = {}, token = ownerToken) =>
    request(ctx.app.getHttpServer())
      .get('/channels/me/videos')
      .query(query)
      .set('Authorization', `Bearer ${token}`);

  // 1. Listagem do painel

  test('lista-todos-os-videos-do-dono-mais-novo-primeiro', async () => {
    const draft = await seedVideo(ctx, OWNER, {
      publication_status: 'draft',
      processing_status: 'ready',
      created_at: new Date('2026-11-01T10:00:00Z'),
    });
    const published = await seedVideo(ctx, OWNER, {
      publication_status: 'published',
      processing_status: 'ready',
      published_at: new Date('2026-11-02T11:00:00Z'),
      created_at: new Date('2026-11-02T10:00:00Z'),
    });
    const processing = await seedVideo(ctx, OWNER, {
      processing_status: 'processing',
      created_at: new Date('2026-11-03T10:00:00Z'),
    });
    const failed = await seedVideo(ctx, OWNER, {
      processing_status: 'failed',
      created_at: new Date('2026-11-04T10:00:00Z'),
    });

    const res = await listMine().expect(200);

    const body = res.body as PanelPageBody;
    expect(body.items).toHaveLength(4);
    expect(body.items.map((item) => item.public_id)).toEqual([
      failed.public_id,
      processing.public_id,
      published.public_id,
      draft.public_id,
    ]);
    const createdAt = body.items.map((item) => Date.parse(item.created_at));
    expect(createdAt).toEqual([...createdAt].sort((a, b) => b - a));
    for (const item of body.items) {
      expect(item).toMatchObject({
        view_count: 0,
        like_count: 0,
        comment_count: 0,
      });
      for (const field of PANEL_ITEM_FIELDS) {
        expect(item).toHaveProperty(field);
      }
    }
  });

  test('paginacao-por-pagina-com-total', async () => {
    await seedVideo(ctx, OWNER, {
      created_at: new Date('2026-11-01T10:00:00Z'),
    });
    const secondNewest = await seedVideo(ctx, OWNER, {
      created_at: new Date('2026-11-02T10:00:00Z'),
    });
    await seedVideo(ctx, OWNER, {
      created_at: new Date('2026-11-03T10:00:00Z'),
    });

    const res = await listMine({ page: 2, per_page: 1 }).expect(200);

    const body = res.body as PanelPageBody;
    expect(body.items).toHaveLength(1);
    expect(body.items[0].public_id).toBe(secondNewest.public_id);
    expect(body).toMatchObject({ page: 2, per_page: 1, total: 3 });
  });

  test('videos-de-outros-canais-nao-aparecem', async () => {
    const own = await seedVideo(ctx, OWNER);
    await seedVideo(ctx, OTHER);
    await seedVideo(ctx, OTHER);

    const res = await listMine().expect(200);

    const body = res.body as PanelPageBody;
    expect(body.total).toBe(1);
    expect(body.items.map((item) => item.public_id)).toEqual([own.public_id]);
  });

  // 2. Validação e autenticação

  test('per-page-invalido-400-sem-token-401', async () => {
    const invalid = await listMine({ per_page: 51 }).expect(400);
    expect((invalid.body as ErrorBody).error).toBe('VALIDATION_ERROR');

    await request(ctx.app.getHttpServer())
      .get('/channels/me/videos')
      .expect(401);
  });
});
