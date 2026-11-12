import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import {
  createConfirmedUser,
  createVideosApp,
  resetVideosState,
  type VideosE2eContext,
} from './helpers/videos-e2e';

type ErrorBody = { error: string };
type JwtPayload = { sub: string };

const OWNER = 'subscription_owner@example.com';
const VIEWER = 'subscription_viewer@example.com';

describe('channels-subscription', () => {
  let ctx: VideosE2eContext;
  let ownerToken: string;
  let viewerToken: string;
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
    viewerToken = await createConfirmedUser(ctx.app, VIEWER);
    const me = await request(ctx.app.getHttpServer())
      .get('/channels/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    ownerNickname = (me.body as { nickname: string }).nickname;
  });

  const subscription = (
    method: 'put' | 'delete',
    nickname: string,
    token?: string,
  ) => {
    const req = request(ctx.app.getHttpServer())[method](
      `/channels/${nickname}/subscription`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  const channelHeader = (token?: string) => {
    const req = request(ctx.app.getHttpServer()).get(
      `/channels/${ownerNickname}`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  test('seguir-idempotente', async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await subscription('put', ownerNickname, viewerToken);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ subscriber_count: 1, is_subscribed: true });
    }
  });

  test('deixar-de-seguir-idempotente', async () => {
    const subscribed = await subscription('put', ownerNickname, viewerToken);
    expect(subscribed.status).toBe(200);
    expect(subscribed.body).toMatchObject({ subscriber_count: 1 });

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await subscription('delete', ownerNickname, viewerToken);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ subscriber_count: 0, is_subscribed: false });
    }
  });

  test('proprio-canal-inexistente-e-sem-token', async () => {
    const self = await subscription('put', ownerNickname, ownerToken);
    expect(self.status).toBe(409);
    expect((self.body as ErrorBody).error).toBe(
      'SELF_SUBSCRIPTION_NOT_ALLOWED',
    );

    const unknown = await subscription(
      'put',
      'canal_que_nao_existe',
      viewerToken,
    );
    expect(unknown.status).toBe(404);
    expect((unknown.body as ErrorBody).error).toBe('CHANNEL_NOT_FOUND');

    const anonymous = await subscription('put', ownerNickname);
    expect(anonymous.status).toBe(401);
  });

  test('cabecalho-com-estado-do-espectador', async () => {
    await subscription('put', ownerNickname, viewerToken).expect(200);

    const anonymous = await channelHeader();
    expect(anonymous.status).toBe(200);
    expect(anonymous.body).toMatchObject({
      subscriber_count: 1,
      is_subscribed: false,
    });

    const asViewer = await channelHeader(viewerToken);
    expect(asViewer.status).toBe(200);
    expect(asViewer.body).toMatchObject({ is_subscribed: true });

    const jwt = ctx.app.get(JwtService);
    const { sub } = jwt.decode<JwtPayload>(viewerToken);
    const expired = await jwt.signAsync({ sub }, { expiresIn: -60 });
    const asExpired = await channelHeader(expired);
    expect(asExpired.status).toBe(200);
    expect(asExpired.body).toMatchObject({ is_subscribed: false });
  });
});
