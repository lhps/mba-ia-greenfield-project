import request from 'supertest';
import { Category } from '../src/categories/entities/category.entity';
import type { Video } from '../src/videos/entities/video.entity';
import { User } from '../src/users/entities/user.entity';
import {
  createConfirmedUser,
  createVideosApp,
  resetVideosState,
  seedVideo,
  type VideosE2eContext,
} from './helpers/videos-e2e';

type ErrorBody = { error: string };
type PresignedBody = { url: string };
type ListBody = { items: { public_id: string }[] };

const OWNER = 'watch_owner@example.com';
const OTHER = 'watch_other@example.com';

describe('videos-watch-access', () => {
  let ctx: VideosE2eContext;
  let ownerToken: string;
  let otherToken: string;
  let ownerNickname: string;
  let publicVideo: Video;
  let unlistedVideo: Video;

  beforeAll(async () => {
    ctx = await createVideosApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetVideosState(ctx);
    ownerToken = await createConfirmedUser(ctx.app, OWNER);
    otherToken = await createConfirmedUser(ctx.app, OTHER);
    ownerNickname = (
      await ctx.dataSource.getRepository(User).findOneOrFail({
        where: { email: OWNER },
        relations: { channel: true },
      })
    ).channel.nickname;
    const categoryId = (
      await ctx.dataSource
        .getRepository(Category)
        .findOneByOrFail({ slug: 'musica' })
    ).id;
    const published = {
      processing_status: 'ready',
      publication_status: 'published',
      category_id: categoryId,
      published_at: new Date(),
    } as const;
    publicVideo = await seedVideo(ctx, OWNER, {
      ...published,
      visibility: 'public',
    });
    await ctx.dataSource.query(
      'UPDATE videos SET video_key = $1 WHERE id = $2',
      [`videos/${publicVideo.id}/video.mp4`, publicVideo.id],
    );
    unlistedVideo = await seedVideo(ctx, OWNER, {
      ...published,
      visibility: 'unlisted',
    });
  });

  const get = (path: string, token?: string) => {
    const req = request(ctx.app.getHttpServer()).get(path);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  // 1. Acesso anônimo e não listados

  it('publicado-assistivel-sem-login', async () => {
    await get(`/videos/${publicVideo.public_id}`).expect(200);

    const res = await get(`/videos/${publicVideo.public_id}/stream`).expect(
      200,
    );
    expect((res.body as PresignedBody).url).toMatch(/^https?:\/\//);
  });

  it('nao-listado-por-link-fora-das-listagens', async () => {
    await get(`/videos/${unlistedVideo.public_id}`).expect(200);

    const suggestions = await get(
      `/videos/${publicVideo.public_id}/suggestions`,
    ).expect(200);
    const suggested = (suggestions.body as ListBody).items.map(
      (i) => i.public_id,
    );
    expect(suggested).not.toContain(unlistedVideo.public_id);

    const channel = await get(`/channels/${ownerNickname}/videos`).expect(200);
    const listed = (channel.body as ListBody).items.map((i) => i.public_id);
    expect(listed).toContain(publicVideo.public_id);
    expect(listed).not.toContain(unlistedVideo.public_id);
  });

  // 2. Download exclusivo do dono

  it('download-so-para-o-dono', async () => {
    const path = `/videos/${publicVideo.public_id}/download`;

    await get(path).expect(401);

    const denied = await get(path, otherToken).expect(403);
    expect((denied.body as ErrorBody).error).toBe('VIDEO_ACCESS_DENIED');

    const res = await get(path, ownerToken).expect(200);
    expect((res.body as PresignedBody).url).toMatch(/^https?:\/\//);
  });
});
