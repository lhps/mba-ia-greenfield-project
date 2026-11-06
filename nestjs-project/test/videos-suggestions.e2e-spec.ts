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
type SuggestionsBody = { items: Record<string, unknown>[] };

const OWNER = 'suggestions_owner@example.com';
const DAY_MS = 24 * 60 * 60 * 1000;
const CARD_KEYS = [
  'duration_seconds',
  'public_id',
  'published_at',
  'thumbnail_url',
  'title',
  'view_count',
];

describe('videos-suggestions', () => {
  let ctx: VideosE2eContext;
  let ownerToken: string;
  let musica: string;
  let jogos: string;

  beforeAll(async () => {
    ctx = await createVideosApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetVideosState(ctx);
    ownerToken = await createConfirmedUser(ctx.app, OWNER);
    const categories = ctx.dataSource.getRepository(Category);
    musica = (await categories.findOneByOrFail({ slug: 'musica' })).id;
    jogos = (await categories.findOneByOrFail({ slug: 'jogos' })).id;
  });

  const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

  const seedEligible = (
    categoryId: string,
    publishedAt: Date,
    viewCount = 0,
    overrides: Partial<Video> = {},
  ) =>
    seedVideo(ctx, OWNER, {
      processing_status: 'ready',
      publication_status: 'published',
      visibility: 'public',
      category_id: categoryId,
      published_at: publishedAt,
      view_count: viewCount,
      ...overrides,
    });

  const getSuggestions = (publicId: string, token?: string) => {
    const req = request(ctx.app.getHttpServer()).get(
      `/videos/${publicId}/suggestions`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  const ids = (body: SuggestionsBody) => body.items.map((i) => i.public_id);

  // 1. Ordenação e preenchimento

  it('mesma-categoria-por-visualizacoes-com-desempate-por-recencia', async () => {
    const current = await seedEligible(musica, daysAgo(10));
    const a = await seedEligible(musica, daysAgo(1), 5);
    const b = await seedEligible(musica, daysAgo(3), 9);
    const c = await seedEligible(musica, daysAgo(0), 5);

    const res = await getSuggestions(current.public_id).expect(200);

    const body = res.body as SuggestionsBody;
    expect(ids(body).slice(0, 3)).toEqual([
      b.public_id,
      c.public_id,
      a.public_id,
    ]);
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual(CARD_KEYS);
    }
  });

  it('completa-com-outras-categorias-ate-12', async () => {
    const current = await seedEligible(musica, daysAgo(100));
    const sameCategory = [
      await seedEligible(musica, daysAgo(50), 3),
      await seedEligible(musica, daysAgo(51), 2),
      await seedEligible(musica, daysAgo(52), 1),
    ];
    const others: Video[] = [];
    for (let i = 1; i <= 15; i++) {
      others.push(await seedEligible(jogos, daysAgo(i), 1000));
    }

    const res = await getSuggestions(current.public_id).expect(200);

    const body = res.body as SuggestionsBody;
    expect(body.items).toHaveLength(12);
    expect(ids(body)).toEqual([
      ...sameCategory.map((v) => v.public_id),
      ...others.slice(0, 9).map((v) => v.public_id),
    ]);
  });

  it('exclui-atual-rascunho-nao-listado-e-nao-pronto', async () => {
    const current = await seedEligible(musica, daysAgo(10));
    const draft = await seedEligible(musica, daysAgo(1), 0, {
      publication_status: 'draft',
    });
    const unlisted = await seedEligible(musica, daysAgo(1), 0, {
      visibility: 'unlisted',
    });
    const processing = await seedEligible(musica, daysAgo(1), 0, {
      processing_status: 'processing',
    });
    const d = await seedEligible(musica, daysAgo(2));

    const res = await getSuggestions(current.public_id).expect(200);

    const returned = ids(res.body as SuggestionsBody);
    expect(returned).toContain(d.public_id);
    for (const excluded of [current, draft, unlisted, processing]) {
      expect(returned).not.toContain(excluded.public_id);
    }
  });

  it('lista-vazia-quando-nao-ha-elegiveis', async () => {
    const current = await seedEligible(musica, daysAgo(10));

    const res = await getSuggestions(current.public_id).expect(200);

    expect(res.body).toEqual({ items: [] });
  });

  // 2. Acesso ao vídeo atual

  it('rascunho-sem-categoria-do-dono-recebe-recentes', async () => {
    const draft = await seedVideo(ctx, OWNER, {
      processing_status: 'ready',
      publication_status: 'draft',
      category_id: null,
    });
    const older = await seedEligible(jogos, daysAgo(5), 50);
    const newer = await seedEligible(musica, daysAgo(1), 1);

    const res = await getSuggestions(draft.public_id, ownerToken).expect(200);

    expect(ids(res.body as SuggestionsBody)).toEqual([
      newer.public_id,
      older.public_id,
    ]);
  });

  it('rascunho-de-terceiro-retorna-404', async () => {
    const draft = await seedVideo(ctx, OWNER, {
      processing_status: 'ready',
      publication_status: 'draft',
      category_id: null,
    });

    const res = await getSuggestions(draft.public_id).expect(404);

    expect((res.body as ErrorBody).error).toBe('VIDEO_NOT_FOUND');
  });
});
