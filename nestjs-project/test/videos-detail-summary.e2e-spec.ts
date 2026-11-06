import request from 'supertest';
import { Category } from '../src/categories/entities/category.entity';
import { User } from '../src/users/entities/user.entity';
import {
  createConfirmedUser,
  createVideosApp,
  resetVideosState,
  seedVideo,
  type VideosE2eContext,
} from './helpers/videos-e2e';

type ChannelSummary = { nickname: string; name: string };
type VideoDetailBody = { view_count: number; channel: ChannelSummary };

const OWNER = 'detail_summary_owner@example.com';

describe('videos-detail-summary', () => {
  let ctx: VideosE2eContext;
  let ownerToken: string;
  let ownerChannel: ChannelSummary;
  let publicId: string;

  beforeAll(async () => {
    ctx = await createVideosApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetVideosState(ctx);
    ownerToken = await createConfirmedUser(ctx.app, OWNER);
    const owner = await ctx.dataSource.getRepository(User).findOneOrFail({
      where: { email: OWNER },
      relations: { channel: true },
    });
    ownerChannel = {
      nickname: owner.channel.nickname,
      name: owner.channel.name,
    };
    const category = await ctx.dataSource
      .getRepository(Category)
      .findOneByOrFail({ slug: 'musica' });
    const video = await seedVideo(ctx, OWNER, {
      processing_status: 'ready',
      publication_status: 'published',
      visibility: 'public',
      published_at: new Date(),
      category_id: category.id,
      view_count: 7,
    });
    publicId = video.public_id;
  });

  const expectSummary = (body: VideoDetailBody, viewCount: number) => {
    expect(body.view_count).toBe(viewCount);
    expect(body.channel).toEqual(ownerChannel);
  };

  // 1. VideoDetail carrega contagem e canal

  it('get-publicado-traz-view-count-e-canal', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/videos/${publicId}`)
      .expect(200);

    const body = res.body as VideoDetailBody;
    expectSummary(body, 7);
    expect(Object.keys(body.channel).sort()).toEqual(['name', 'nickname']);
  });

  it('respostas-de-gestao-trazem-os-mesmos-campos', async () => {
    const auth = `Bearer ${ownerToken}`;

    const patched = await request(ctx.app.getHttpServer())
      .patch(`/videos/${publicId}`)
      .set('Authorization', auth)
      .send({ title: 'Novo título' })
      .expect(200);
    expectSummary(patched.body as VideoDetailBody, 7);

    const unpublished = await request(ctx.app.getHttpServer())
      .post(`/videos/${publicId}/unpublish`)
      .set('Authorization', auth)
      .expect(200);
    expectSummary(unpublished.body as VideoDetailBody, 7);

    const published = await request(ctx.app.getHttpServer())
      .post(`/videos/${publicId}/publish`)
      .set('Authorization', auth)
      .expect(200);
    expectSummary(published.body as VideoDetailBody, 7);
  });
});
