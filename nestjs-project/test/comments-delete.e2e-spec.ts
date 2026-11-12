import { randomUUID } from 'node:crypto';
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
  reply_count: number;
};
type PageBody = { items: CommentBody[]; next_cursor: string | null };

const OWNER = 'delete_owner@example.com';
const AUTHOR = 'delete_author@example.com';
const THIRD = 'delete_third@example.com';

describe('comments-delete', () => {
  let ctx: VideosE2eContext;
  let authorToken: string;
  let thirdToken: string;
  let video: Video;

  beforeAll(async () => {
    ctx = await createVideosApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetVideosState(ctx);
    await createConfirmedUser(ctx.app, OWNER);
    authorToken = await createConfirmedUser(ctx.app, AUTHOR);
    thirdToken = await createConfirmedUser(ctx.app, THIRD);
    video = await seedVideo(ctx, OWNER, {
      processing_status: 'ready',
      publication_status: 'published',
      visibility: 'public',
      published_at: new Date(),
    });
  });

  const createComment = async (
    token: string,
    payload: Record<string, unknown>,
  ): Promise<CommentBody> => {
    const res = await request(ctx.app.getHttpServer())
      .post(`/videos/${video.public_id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res.status).toBe(201);
    return res.body as CommentBody;
  };

  const deleteComment = (id: string, token?: string) => {
    const req = request(ctx.app.getHttpServer()).delete(`/comments/${id}`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  const listRoots = async (): Promise<CommentBody[]> => {
    const res = await request(ctx.app.getHttpServer()).get(
      `/videos/${video.public_id}/comments`,
    );
    expect(res.status).toBe(200);
    return (res.body as PageBody).items;
  };

  // GET /videos/:id exposes comment_count from SI-06.7; the stored counter is checked here.
  const commentCount = async (): Promise<number> =>
    (
      await ctx.dataSource.getRepository(Video).findOneOrFail({
        where: { id: video.id },
        select: ['comment_count'],
      })
    ).comment_count;

  test('raiz-sem-respostas-removida', async () => {
    const x = await createComment(authorToken, { body: 'X' });

    const res = await deleteComment(x.id, authorToken);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');

    expect((await listRoots()).map((item) => item.id)).not.toContain(x.id);
    await expect(commentCount()).resolves.toBe(0);
  });

  test('raiz-com-respostas-vira-placeholder', async () => {
    const x = await createComment(authorToken, { body: 'X' });
    const r = await createComment(thirdToken, { body: 'R', parent_id: x.id });

    const res = await deleteComment(x.id, authorToken);
    expect(res.status).toBe(204);

    const placeholder = (await listRoots()).find((item) => item.id === x.id);
    expect(placeholder).toMatchObject({
      deleted: true,
      body: null,
      author: null,
      reply_count: 1,
    });

    const replies = await request(ctx.app.getHttpServer()).get(
      `/comments/${x.id}/replies`,
    );
    expect(replies.status).toBe(200);
    expect((replies.body as PageBody).items.map((item) => item.id)).toEqual([
      r.id,
    ]);
    await expect(commentCount()).resolves.toBe(1);
  });

  test('apagar-resposta-decrementa', async () => {
    const x = await createComment(thirdToken, { body: 'X' });
    const r = await createComment(authorToken, { body: 'R', parent_id: x.id });

    const res = await deleteComment(r.id, authorToken);
    expect(res.status).toBe(204);

    const root = (await listRoots()).find((item) => item.id === x.id);
    expect(root?.reply_count).toBe(0);
    await expect(commentCount()).resolves.toBe(1);
  });

  test('placeholder-some-com-ultima-resposta', async () => {
    const x = await createComment(authorToken, { body: 'X' });
    const r = await createComment(thirdToken, { body: 'R', parent_id: x.id });
    expect((await deleteComment(x.id, authorToken)).status).toBe(204);

    const res = await deleteComment(r.id, thirdToken);
    expect(res.status).toBe(204);

    expect((await listRoots()).map((item) => item.id)).not.toContain(x.id);
    await expect(commentCount()).resolves.toBe(0);
  });

  test('outro-usuario-403-e-inexistente-404', async () => {
    const x = await createComment(authorToken, { body: 'X' });
    const r = await createComment(thirdToken, { body: 'R', parent_id: x.id });
    expect((await deleteComment(x.id, authorToken)).status).toBe(204);

    const denied = await deleteComment(r.id, authorToken);
    expect(denied.status).toBe(403);
    expect((denied.body as ErrorBody).error).toBe('COMMENT_ACCESS_DENIED');

    const unknown = await deleteComment(randomUUID(), authorToken);
    expect(unknown.status).toBe(404);
    expect((unknown.body as ErrorBody).error).toBe('COMMENT_NOT_FOUND');

    const placeholder = await deleteComment(x.id, authorToken);
    expect(placeholder.status).toBe(404);
    expect((placeholder.body as ErrorBody).error).toBe('COMMENT_NOT_FOUND');

    const anonymous = await deleteComment(r.id);
    expect(anonymous.status).toBe(401);
  });
});
