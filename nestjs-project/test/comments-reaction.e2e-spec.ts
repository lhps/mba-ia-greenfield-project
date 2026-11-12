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
  like_count: number;
  my_reaction: string | null;
};
type PageBody = { items: CommentBody[] };

const OWNER = 'creaction_owner@example.com';
const VIEWER = 'creaction_viewer@example.com';

describe('comments-reaction', () => {
  let ctx: VideosE2eContext;
  let ownerToken: string;
  let viewerToken: string;
  let video: Video;
  let commentC: CommentBody;

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
      processing_status: 'ready',
      publication_status: 'published',
      visibility: 'public',
      published_at: new Date(),
    });
    commentC = await createComment(video.public_id, ownerToken, { body: 'C' });
  });

  const createComment = async (
    publicId: string,
    token: string,
    payload: Record<string, unknown>,
  ): Promise<CommentBody> => {
    const res = await request(ctx.app.getHttpServer())
      .post(`/videos/${publicId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res.status).toBe(201);
    return res.body as CommentBody;
  };

  const putReaction = (id: string, value: string, token?: string) => {
    const req = request(ctx.app.getHttpServer()).put(
      `/comments/${id}/reaction`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send({ value });
  };

  const deleteReaction = (id: string, token: string) =>
    request(ctx.app.getHttpServer())
      .delete(`/comments/${id}/reaction`)
      .set('Authorization', `Bearer ${token}`);

  const listedComment = async (token?: string): Promise<CommentBody> => {
    const req = request(ctx.app.getHttpServer()).get(
      `/videos/${video.public_id}/comments`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    const res = await req;
    expect(res.status).toBe(200);
    const found = (res.body as PageBody).items.find(
      (item) => item.id === commentC.id,
    );
    expect(found).toBeDefined();
    return found!;
  };

  test('like-aparece-na-listagem', async () => {
    const like = await putReaction(commentC.id, 'like', viewerToken);
    expect(like.status).toBe(200);
    expect(like.body).toEqual({ like_count: 1, my_reaction: 'like' });

    await expect(listedComment(viewerToken)).resolves.toMatchObject({
      like_count: 1,
      my_reaction: 'like',
    });
    await expect(listedComment()).resolves.toMatchObject({
      like_count: 1,
      my_reaction: null,
    });
  });

  test('troca-remove-e-idempotencia', async () => {
    const like = await putReaction(commentC.id, 'like', viewerToken);
    expect(like.status).toBe(200);
    expect(like.body).toMatchObject({ like_count: 1 });

    for (let attempt = 0; attempt < 2; attempt++) {
      const dislike = await putReaction(commentC.id, 'dislike', viewerToken);
      expect(dislike.status).toBe(200);
      expect(dislike.body).toEqual({ like_count: 0, my_reaction: 'dislike' });
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const cleared = await deleteReaction(commentC.id, viewerToken);
      expect(cleared.status).toBe(200);
      expect(cleared.body).toEqual({ like_count: 0, my_reaction: null });
    }
  });

  const seedUnavailable = async () => {
    const reply = await createComment(video.public_id, viewerToken, {
      body: 'R',
      parent_id: commentC.id,
    });
    await request(ctx.app.getHttpServer())
      .delete(`/comments/${commentC.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    const draft = await seedVideo(ctx, OWNER, {
      processing_status: 'ready',
      publication_status: 'draft',
    });
    const onDraft = await createComment(draft.public_id, ownerToken, {
      body: 'D',
    });
    return { reply, onDraft };
  };

  test('placeholder-404', async () => {
    await seedUnavailable();

    const res = await putReaction(commentC.id, 'like', viewerToken);
    expect(res.status).toBe(404);
    expect((res.body as ErrorBody).error).toBe('COMMENT_NOT_FOUND');
  });

  test('video-rascunho-404-e-sem-token-401', async () => {
    const { reply, onDraft } = await seedUnavailable();

    const hidden = await putReaction(onDraft.id, 'like', viewerToken);
    expect(hidden.status).toBe(404);
    expect((hidden.body as ErrorBody).error).toBe('COMMENT_NOT_FOUND');

    const anonymous = await putReaction(reply.id, 'like');
    expect(anonymous.status).toBe(401);
  });
});
