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
type CommentBody = {
  id: string;
  parent_id: string | null;
  body: string | null;
  deleted: boolean;
  author: { nickname: string; name: string } | null;
  like_count: number;
  reply_count: number;
  my_reaction: string | null;
};
type PageBody = { items: CommentBody[]; next_cursor: string | null };

const OWNER = 'comments_owner@example.com';
const VIEWER = 'comments_viewer@example.com';

const publishedReady = {
  processing_status: 'ready',
  publication_status: 'published',
  visibility: 'public',
} as const;

describe('videos-comments', () => {
  let ctx: VideosE2eContext;
  let ownerToken: string;
  let viewerToken: string;
  let video: Video;
  let secondVideo: Video;

  beforeAll(async () => {
    ctx = await createVideosApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetVideosState(ctx);
    ownerToken = await createConfirmedUser(ctx.app, OWNER);
    viewerToken = await createConfirmedUser(ctx.app, VIEWER);
    video = await seedVideo(ctx, OWNER, {
      ...publishedReady,
      published_at: new Date(),
    });
    secondVideo = await seedVideo(ctx, OWNER, {
      ...publishedReady,
      published_at: new Date(),
    });
  });

  const postComment = (
    publicId: string,
    token: string,
    payload: Record<string, unknown>,
    forwardedFor?: string,
  ) => {
    const req = request(ctx.app.getHttpServer())
      .post(`/videos/${publicId}/comments`)
      .set('Authorization', `Bearer ${token}`);
    if (forwardedFor) req.set('X-Forwarded-For', forwardedFor);
    return req.send(payload);
  };

  const createComment = async (
    token: string,
    payload: Record<string, unknown>,
    publicId = video.public_id,
  ): Promise<CommentBody> => {
    const res = await postComment(publicId, token, payload);
    expect(res.status).toBe(201);
    return res.body as CommentBody;
  };

  const listRoots = (query = '') =>
    request(ctx.app.getHttpServer()).get(
      `/videos/${video.public_id}/comments${query}`,
    );

  const commentCount = async (): Promise<number> =>
    (
      await ctx.dataSource.getRepository(Video).findOneOrFail({
        where: { id: video.id },
        select: ['comment_count'],
      })
    ).comment_count;

  const viewerNickname = async (): Promise<string> => {
    const res = await request(ctx.app.getHttpServer())
      .get('/channels/me')
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    return (res.body as { nickname: string }).nickname;
  };

  test('cria-comentario-aparado', async () => {
    const res = await postComment(video.public_id, viewerToken, {
      body: '  Nice video  ',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      body: 'Nice video',
      parent_id: null,
      deleted: false,
      like_count: 0,
      reply_count: 0,
      my_reaction: null,
    });
    expect((res.body as CommentBody).author?.nickname).toBe(
      await viewerNickname(),
    );
    // GET /videos/:id exposes comment_count from SI-06.7; the stored counter is checked here.
    await expect(commentCount()).resolves.toBe(1);
  });

  test('resposta-a-resposta-vai-para-raiz', async () => {
    const root = await createComment(ownerToken, { body: 'root' });
    const reply = await createComment(viewerToken, {
      body: 'reply',
      parent_id: root.id,
    });
    expect(reply.parent_id).toBe(root.id);

    const nested = await createComment(ownerToken, {
      body: 'reply to reply',
      parent_id: reply.id,
    });
    expect(nested.parent_id).toBe(root.id);

    const roots = await listRoots();
    expect(roots.status).toBe(200);
    const listedRoot = (roots.body as PageBody).items.find(
      (item) => item.id === root.id,
    );
    expect(listedRoot?.reply_count).toBe(2);
    await expect(commentCount()).resolves.toBe(3);
  });

  test('corpo-invalido-e-pai-de-outro-video', async () => {
    const blank = await postComment(video.public_id, viewerToken, {
      body: '   ',
    });
    expect(blank.status).toBe(400);
    expect((blank.body as ErrorBody).error).toBe('VALIDATION_ERROR');

    const tooLong = await postComment(video.public_id, viewerToken, {
      body: 'x'.repeat(2001),
    });
    expect(tooLong.status).toBe(400);
    expect((tooLong.body as ErrorBody).error).toBe('VALIDATION_ERROR');

    const foreign = await createComment(
      viewerToken,
      { body: 'elsewhere' },
      secondVideo.public_id,
    );
    const crossVideo = await postComment(video.public_id, viewerToken, {
      body: 'x',
      parent_id: foreign.id,
    });
    expect(crossVideo.status).toBe(404);
    expect((crossVideo.body as ErrorBody).error).toBe('COMMENT_NOT_FOUND');
  });

  test('nao-pronto-409-e-rascunho-404', async () => {
    const processing = await seedVideo(ctx, OWNER, {
      processing_status: 'processing',
      publication_status: 'published',
      visibility: 'public',
      published_at: new Date(),
    });
    const draft = await seedVideo(ctx, OWNER, {
      processing_status: 'ready',
      publication_status: 'draft',
    });

    const notReady = await postComment(processing.public_id, viewerToken, {
      body: 'x',
    });
    expect(notReady.status).toBe(409);
    expect((notReady.body as ErrorBody).error).toBe('VIDEO_NOT_READY');

    const hidden = await postComment(draft.public_id, viewerToken, {
      body: 'x',
    });
    expect(hidden.status).toBe(404);
    expect((hidden.body as ErrorBody).error).toBe('VIDEO_NOT_FOUND');
  });

  test('throttle-por-usuario', async () => {
    const ips = ['203.0.113.7', '198.51.100.9'];
    for (let index = 0; index < 10; index++) {
      const res = await postComment(
        video.public_id,
        viewerToken,
        { body: `comment ${index}` },
        ips[index % 2],
      );
      expect(res.status).toBe(201);
    }

    const eleventh = await postComment(
      video.public_id,
      viewerToken,
      { body: 'one too many' },
      '192.0.2.44',
    );
    expect(eleventh.status).toBe(429);

    const owner = await postComment(video.public_id, ownerToken, {
      body: 'owner still allowed',
    });
    expect(owner.status).toBe(201);
  });

  const seedListing = async () => {
    const a = await createComment(viewerToken, { body: 'A' });
    const b = await createComment(viewerToken, { body: 'B' });
    const c = await createComment(viewerToken, { body: 'C' });
    const r1 = await createComment(ownerToken, { body: 'R1', parent_id: a.id });
    const r2 = await createComment(ownerToken, { body: 'R2', parent_id: a.id });
    return { a, b, c, r1, r2 };
  };

  test('raizes-mais-novas-primeiro-paginadas', async () => {
    const { a, b, c } = await seedListing();

    const first = await listRoots('?limit=2');
    expect(first.status).toBe(200);
    const firstPage = first.body as PageBody;
    expect(firstPage.items.map((item) => item.id)).toEqual([c.id, b.id]);
    expect(firstPage.items.every((item) => item.my_reaction === null)).toBe(
      true,
    );
    expect(firstPage.next_cursor).not.toBeNull();

    const second = await listRoots(`?limit=2&cursor=${firstPage.next_cursor}`);
    expect(second.status).toBe(200);
    expect((second.body as PageBody).items.map((item) => item.id)).toEqual([
      a.id,
    ]);
    expect((second.body as PageBody).next_cursor).toBeNull();

    const malformed = await listRoots('?cursor=abc!');
    expect(malformed.status).toBe(400);
    expect((malformed.body as ErrorBody).error).toBe('VALIDATION_ERROR');
  });

  test('respostas-mais-antigas-primeiro', async () => {
    const { a, r1, r2 } = await seedListing();

    const replies = await request(ctx.app.getHttpServer()).get(
      `/comments/${a.id}/replies`,
    );
    expect(replies.status).toBe(200);
    const items = (replies.body as PageBody).items;
    expect(items.map((item) => item.id)).toEqual([r1.id, r2.id]);
    expect(items.every((item) => item.parent_id === a.id)).toBe(true);

    const ofReply = await request(ctx.app.getHttpServer()).get(
      `/comments/${r1.id}/replies`,
    );
    expect(ofReply.status).toBe(404);
    expect((ofReply.body as ErrorBody).error).toBe('COMMENT_NOT_FOUND');
  });
});
