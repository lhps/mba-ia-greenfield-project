import request from 'supertest';
import { Video } from '../src/videos/entities/video.entity';
import {
  createConfirmedUser,
  createVideosApp,
  resetVideosState,
  seedVideo,
  type VideosE2eContext,
} from './helpers/videos-e2e';

type VideoDetailBody = {
  like_count: number;
  comment_count: number;
  my_reaction: string | null;
  channel: {
    nickname: string;
    subscriber_count: number;
    is_subscribed: boolean;
  };
};

const OWNER = 'detail_social_owner@example.com';
const VIEWER = 'detail_social_viewer@example.com';

describe('videos-detail-social', () => {
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

  const getDetail = (token?: string) => {
    const req = request(ctx.app.getHttpServer()).get(
      `/videos/${video.public_id}`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  test('anonimo-recebe-contagens-e-estado-vazio', async () => {
    const res = await getDetail();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      like_count: 0,
      comment_count: 0,
      my_reaction: null,
    });
    expect((res.body as VideoDetailBody).channel).toMatchObject({
      subscriber_count: 0,
      is_subscribed: false,
    });
  });

  test('reacao-do-espectador-refletida', async () => {
    await request(ctx.app.getHttpServer())
      .put(`/videos/${video.public_id}/reaction`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ value: 'like' })
      .expect(200);

    const res = await getDetail(viewerToken);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ my_reaction: 'like', like_count: 1 });
  });

  test('inscricao-do-espectador-refletida', async () => {
    const owner = await getDetail();
    const nickname = (owner.body as VideoDetailBody).channel.nickname;
    await request(ctx.app.getHttpServer())
      .put(`/channels/${nickname}/subscription`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);

    const res = await getDetail(viewerToken);

    expect(res.status).toBe(200);
    expect((res.body as VideoDetailBody).channel).toMatchObject({
      is_subscribed: true,
      subscriber_count: 1,
    });
  });

  test('patch-do-dono-traz-mesmos-campos', async () => {
    const res = await request(ctx.app.getHttpServer())
      .patch(`/videos/${video.public_id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'New title' });

    expect(res.status).toBe(200);
    const body = res.body as VideoDetailBody;
    expect(body).toHaveProperty('like_count');
    expect(body).toHaveProperty('comment_count');
    expect(body).toHaveProperty('my_reaction');
    expect(body.channel).toHaveProperty('subscriber_count');
    expect(body.channel).toHaveProperty('is_subscribed');
  });
});
