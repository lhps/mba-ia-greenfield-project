import request from 'supertest';
import { createVideosApp, type VideosE2eContext } from './helpers/videos-e2e';

type CategoriesBody = { items: Record<string, unknown>[] };

const SEEDED_SLUGS = [
  'educacao',
  'entretenimento',
  'esportes',
  'humor',
  'jogos',
  'musica',
  'noticias',
  'outros',
  'tecnologia',
  'viagens',
];

describe('categories-list', () => {
  let ctx: VideosE2eContext;

  beforeAll(async () => {
    ctx = await createVideosApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  // 1. Listar categorias

  test('lista-as-10-categorias-ordenadas-por-nome', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/categories')
      .expect(200);
    const { items } = res.body as CategoriesBody;

    expect(items).toHaveLength(10);
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(['name', 'slug']);
    }
    expect(items.map((i) => i.slug as string).sort()).toEqual(SEEDED_SLUGS);
    const names = items.map((i) => i.name as string);
    expect(names).toEqual(
      [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    );
  });

  test('resposta-nao-expoe-id-interno', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/categories')
      .expect(200);
    const { items } = res.body as CategoriesBody;

    for (const item of items) {
      expect(item).not.toHaveProperty('id');
      expect(item).not.toHaveProperty('created_at');
    }
  });
});
