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

const OWNER = 'reaction_owner@example.com';
const VIEWER = 'reaction_viewer@example.com';

describe('videos-reaction', () => {
  let ctx: VideosE2eContext;
  let ownerToken: string;
  let viewerToken: string;
  let video: Video;

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
  });

  const putReaction = (publicId: string, token: string, value: string) =>
    request(ctx.app.getHttpServer())
      .put(`/videos/${publicId}/reaction`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value });

  const deleteReaction = (publicId: string, token: string) =>
    request(ctx.app.getHttpServer())
      .delete(`/videos/${publicId}/reaction`)
      .set('Authorization', `Bearer ${token}`);

  const counters = (id: string) =>
    ctx.dataSource.getRepository(Video).findOneOrFail({
      where: { id },
      select: ['like_count', 'dislike_count'],
    });

  test('like-idempotente', async () => {
    const first = await putReaction(video.public_id, viewerToken, 'like');
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ like_count: 1, my_reaction: 'like' });

    const second = await putReaction(video.public_id, viewerToken, 'like');
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ like_count: 1, my_reaction: 'like' });
  });

  test('troca-like-para-dislike', async () => {
    const like = await putReaction(video.public_id, viewerToken, 'like');
    expect(like.status).toBe(200);
    expect(like.body).toMatchObject({ like_count: 1 });

    const dislike = await putReaction(video.public_id, viewerToken, 'dislike');
    expect(dislike.status).toBe(200);
    expect(dislike.body).toEqual({ like_count: 0, my_reaction: 'dislike' });

    await expect(counters(video.id)).resolves.toMatchObject({
      like_count: 0,
      dislike_count: 1,
    });
  });

  test('delete-idempotente', async () => {
    await putReaction(video.public_id, viewerToken, 'like').expect(200);

    const first = await deleteReaction(video.public_id, viewerToken);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ like_count: 0, my_reaction: null });

    const second = await deleteReaction(video.public_id, viewerToken);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ like_count: 0, my_reaction: null });
  });

  test('valor-invalido-e-sem-token', async () => {
    const invalid = await putReaction(video.public_id, viewerToken, 'love');
    expect(invalid.status).toBe(400);
    expect((invalid.body as ErrorBody).error).toBe('VALIDATION_ERROR');

    await request(ctx.app.getHttpServer())
      .put(`/videos/${video.public_id}/reaction`)
      .send({ value: 'like' })
      .expect(401);
  });

  test('rascunho-404-e-nao-pronto-409', async () => {
    const draft = await seedVideo(ctx, OWNER, {
      processing_status: 'ready',
      publication_status: 'draft',
    });
    const processing = await seedVideo(ctx, OWNER, {
      processing_status: 'processing',
      publication_status: 'published',
      visibility: 'public',
      published_at: new Date(),
    });

    const notFound = await putReaction(draft.public_id, viewerToken, 'like');
    expect(notFound.status).toBe(404);
    expect((notFound.body as ErrorBody).error).toBe('VIDEO_NOT_FOUND');

    const notReady = await putReaction(
      processing.public_id,
      viewerToken,
      'like',
    );
    expect(notReady.status).toBe(409);
    expect((notReady.body as ErrorBody).error).toBe('VIDEO_NOT_READY');

    await expect(counters(draft.id)).resolves.toMatchObject({ like_count: 0 });
    await expect(counters(processing.id)).resolves.toMatchObject({
      like_count: 0,
    });
  });

  test('dono-curte-proprio-video', async () => {
    const response = await putReaction(video.public_id, ownerToken, 'like');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ like_count: 1, my_reaction: 'like' });
  });
});
