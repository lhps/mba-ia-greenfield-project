import request from 'supertest';
import { Video } from '../src/videos/entities/video.entity';
import {
  createConfirmedUser,
  createVideosApp,
  resetVideosState,
  seedVideo,
  type VideosE2eContext,
} from './helpers/videos-e2e';

type ErrorBody = { error: string };
type SubscribedChannelBody = {
  nickname: string;
  name: string;
  subscriber_count: number;
  subscribed_at: string;
};
type Page<T> = { items: T[]; next_cursor: string | null };
type PublicVideoBody = {
  public_id: string;
  title: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  published_at: string;
  view_count: number;
};

const VIEWER = 'me_subs_viewer@example.com';
const OWNER_A = 'me_subs_a@example.com';
const OWNER_B = 'me_subs_b@example.com';
const OWNER_C = 'me_subs_c@example.com';
const LONER = 'me_subs_loner@example.com';

const publicReady = {
  processing_status: 'ready',
  publication_status: 'published',
  visibility: 'public',
} as const;

describe('me-subscriptions', () => {
  let ctx: VideosE2eContext;
  let viewerToken: string;
  let nicknameA: string;
  let nicknameB: string;

  beforeAll(async () => {
    ctx = await createVideosApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());

  const nicknameOf = async (token: string): Promise<string> => {
    const res = await http()
      .get('/channels/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return (res.body as { nickname: string }).nickname;
  };

  beforeEach(async () => {
    await resetVideosState(ctx);
    viewerToken = await createConfirmedUser(ctx.app, VIEWER);
    nicknameA = await nicknameOf(await createConfirmedUser(ctx.app, OWNER_A));
    nicknameB = await nicknameOf(await createConfirmedUser(ctx.app, OWNER_B));
    await createConfirmedUser(ctx.app, OWNER_C);
    for (const nickname of [nicknameA, nicknameB]) {
      await http()
        .put(`/channels/${nickname}/subscription`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
    }
  });

  const getAs = (path: string, token?: string) => {
    const req = http().get(path);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  test('canais-seguidos-ordenados-e-paginados', async () => {
    const first = await getAs('/me/subscriptions?limit=1', viewerToken);
    expect(first.status).toBe(200);
    const firstPage = first.body as Page<SubscribedChannelBody>;
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.items[0]).toMatchObject({
      nickname: nicknameB,
      name: expect.any(String) as string,
      subscriber_count: 1,
      subscribed_at: expect.any(String) as string,
    });
    expect(firstPage.next_cursor).not.toBeNull();

    const second = await getAs(
      `/me/subscriptions?limit=1&cursor=${firstPage.next_cursor}`,
      viewerToken,
    );
    expect(second.status).toBe(200);
    const secondPage = second.body as Page<SubscribedChannelBody>;
    expect(secondPage.items.map((item) => item.nickname)).toEqual([nicknameA]);
    expect(secondPage.next_cursor).toBeNull();
  });

  test('feed-so-publicos-prontos-dos-seguidos', async () => {
    const aOld = await seedVideo(ctx, OWNER_A, {
      ...publicReady,
      published_at: new Date('2026-11-01T12:00:00Z'),
    });
    const bNew = await seedVideo(ctx, OWNER_B, {
      ...publicReady,
      published_at: new Date('2026-11-03T12:00:00Z'),
    });
    const excluded: Video[] = [
      await seedVideo(ctx, OWNER_A, {
        processing_status: 'ready',
        publication_status: 'draft',
      }),
      await seedVideo(ctx, OWNER_A, {
        ...publicReady,
        visibility: 'unlisted',
        published_at: new Date('2026-11-04T12:00:00Z'),
      }),
      await seedVideo(ctx, OWNER_A, {
        ...publicReady,
        processing_status: 'processing',
        published_at: new Date('2026-11-04T12:00:00Z'),
      }),
      await seedVideo(ctx, OWNER_C, {
        ...publicReady,
        published_at: new Date('2026-11-05T12:00:00Z'),
      }),
    ];

    const res = await getAs('/me/subscriptions/videos', viewerToken);

    expect(res.status).toBe(200);
    const items = (res.body as Page<PublicVideoBody>).items;
    expect(items.map((item) => item.public_id)).toEqual([
      bNew.public_id,
      aOld.public_id,
    ]);
    const listed = items.map((item) => item.public_id);
    excluded.forEach((video) => expect(listed).not.toContain(video.public_id));
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual([
        'duration_seconds',
        'public_id',
        'published_at',
        'thumbnail_url',
        'title',
        'view_count',
      ]);
    }
  });

  test('sem-inscricoes-listas-vazias', async () => {
    const lonerToken = await createConfirmedUser(ctx.app, LONER);

    for (const path of ['/me/subscriptions', '/me/subscriptions/videos']) {
      const res = await getAs(path, lonerToken);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [], next_cursor: null });
    }
  });

  test('sem-token-401-e-cursor-invalido-400', async () => {
    for (const path of ['/me/subscriptions', '/me/subscriptions/videos']) {
      const anonymous = await getAs(path);
      expect(anonymous.status).toBe(401);

      const malformed = await getAs(`${path}?cursor=abc!`, viewerToken);
      expect(malformed.status).toBe(400);
      expect((malformed.body as ErrorBody).error).toBe('VALIDATION_ERROR');
    }
  });
});
