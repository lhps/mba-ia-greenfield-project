import request from 'supertest';
import {
  createConfirmedUser,
  createVideosApp,
  resetVideosState,
  seedVideo,
  type VideosE2eContext,
} from './helpers/videos-e2e';
import type { Video } from '../src/videos/entities/video.entity';

type ErrorBody = { error: string };
type PublicChannelBody = {
  nickname: string;
  name: string;
  description: string | null;
  created_at: string;
};
type PublicVideoBody = {
  public_id: string;
  title: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  published_at: string;
  view_count: number;
};
type PublicPageBody = {
  items: PublicVideoBody[];
  next_cursor: string | null;
};

const OWNER = 'canal_publico@example.com';
const SHADOW = 'canal_sombra@example.com';
const PUBLIC_VIDEO_FIELDS = [
  'public_id',
  'title',
  'thumbnail_url',
  'duration_seconds',
  'published_at',
  'view_count',
];

describe('channels-public', () => {
  let ctx: VideosE2eContext;
  let ownerToken: string;
  let ownerNickname: string;

  beforeAll(async () => {
    ctx = await createVideosApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetVideosState(ctx);
    ownerToken = await createConfirmedUser(ctx.app, OWNER);
    const me = await request(ctx.app.getHttpServer())
      .get('/channels/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    ownerNickname = (me.body as PublicChannelBody).nickname;
  });

  const http = () => request(ctx.app.getHttpServer());

  /** Published + public + ready unless overridden. */
  const seedPublic = (
    publishedAt: string,
    overrides: Partial<Video> = {},
  ): Promise<Video> =>
    seedVideo(ctx, OWNER, {
      publication_status: 'published',
      visibility: 'public',
      processing_status: 'ready',
      published_at: new Date(publishedAt),
      ...overrides,
    });

  // 1. Informações do canal

  test('canal-existente-e-inexistente', async () => {
    const res = await http().get(`/channels/${ownerNickname}`).expect(200);

    const body = res.body as PublicChannelBody;
    expect(body).toEqual({
      nickname: ownerNickname,
      name: expect.any(String) as string,
      description: null,
      created_at: expect.any(String) as string,
    });
    expect(Number.isNaN(Date.parse(body.created_at))).toBe(false);

    const missing = await http().get('/channels/nao_existe').expect(404);
    expect((missing.body as ErrorBody).error).toBe('CHANNEL_NOT_FOUND');
  });

  test('rota-me-continua-sendo-o-perfil-autenticado', async () => {
    // A channel literally named "me" (forced past the reserved-word rule) proves
    // the routing relies on registration order, not only on the reservation.
    await createConfirmedUser(ctx.app, SHADOW);
    await ctx.dataSource.query(
      `UPDATE channels SET nickname = 'me'
         WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [SHADOW],
    );
    await seedVideo(ctx, SHADOW, {
      publication_status: 'published',
      visibility: 'public',
      processing_status: 'ready',
      published_at: new Date('2026-11-01T12:00:00Z'),
    });

    const anonymous = await http().get('/channels/me').expect(401);
    expect((anonymous.body as ErrorBody).error).not.toBe('CHANNEL_NOT_FOUND');

    const mine = await http()
      .get('/channels/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect((mine.body as PublicChannelBody).nickname).toBe(ownerNickname);
    // Owner-only profile field proves the `me` handler answered, not `:nickname`.
    expect(mine.body).toHaveProperty('next_nickname_change_at');

    // `me/videos` must keep resolving to the owner panel, not `:nickname/videos`.
    await http().get('/channels/me/videos').expect(401);
    const draft = await seedVideo(ctx, OWNER, { publication_status: 'draft' });
    const panel = await http()
      .get('/channels/me/videos')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(panel.body).toMatchObject({ page: 1, total: 1 });
    expect(
      (panel.body as PublicPageBody).items.map((item) => item.public_id),
    ).toEqual([draft.public_id]);
  });

  // 2. Listagem pública de vídeos

  test('so-publicados-publicos-e-prontos', async () => {
    const older = await seedPublic('2026-11-01T12:00:00Z');
    const newer = await seedPublic('2026-11-02T12:00:00Z');
    await seedPublic('2026-11-03T12:00:00Z', { publication_status: 'draft' });
    await seedPublic('2026-11-03T12:00:00Z', { visibility: 'unlisted' });
    await seedPublic('2026-11-03T12:00:00Z', {
      processing_status: 'processing',
    });
    const expected = [newer.public_id, older.public_id];

    const anonymous = await http()
      .get(`/channels/${ownerNickname}/videos`)
      .expect(200);

    const body = anonymous.body as PublicPageBody;
    expect(body.items.map((item) => item.public_id)).toEqual(expected);
    const publishedAt = body.items.map((item) => Date.parse(item.published_at));
    expect(publishedAt).toEqual([...publishedAt].sort((a, b) => b - a));
    expect(body.next_cursor).toBeNull();
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual([...PUBLIC_VIDEO_FIELDS].sort());
      expect(item.view_count).toBe(0);
    }

    const asOwner = await http()
      .get(`/channels/${ownerNickname}/videos`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(
      (asOwner.body as PublicPageBody).items.map((item) => item.public_id),
    ).toEqual(expected);
  });

  test('cursor-percorre-todas-as-paginas', async () => {
    for (let day = 1; day <= 5; day++) {
      await seedPublic(`2026-11-0${day}T12:00:00Z`);
    }

    const first = await http()
      .get(`/channels/${ownerNickname}/videos`)
      .query({ limit: 2 })
      .expect(200);
    const firstBody = first.body as PublicPageBody;
    expect(firstBody.items).toHaveLength(2);
    expect(firstBody.next_cursor).not.toBeNull();

    const pageSizes = [firstBody.items.length];
    const seen = firstBody.items.map((item) => item.public_id);
    let cursor = firstBody.next_cursor;
    while (cursor !== null && pageSizes.length < 10) {
      const res = await http()
        .get(`/channels/${ownerNickname}/videos`)
        .query({ limit: 2, cursor })
        .expect(200);
      const body = res.body as PublicPageBody;
      pageSizes.push(body.items.length);
      seen.push(...body.items.map((item) => item.public_id));
      cursor = body.next_cursor;
    }

    expect(pageSizes).toEqual([2, 2, 1]);
    expect(cursor).toBeNull();
    expect(new Set(seen).size).toBe(5);
    expect(seen).toHaveLength(5);
  });

  test('cursor-malformado-retorna-400', async () => {
    const res = await http()
      .get(`/channels/${ownerNickname}/videos`)
      .query({ cursor: 'garbage' })
      .expect(400);

    expect((res.body as ErrorBody).error).toBe('VALIDATION_ERROR');
  });
});
