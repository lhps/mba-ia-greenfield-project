import request from 'supertest';
import { User } from '../src/users/entities/user.entity';
import {
  createConfirmedUser,
  createVideosApp,
  resetVideosState,
  type VideosE2eContext,
} from './helpers/videos-e2e';

type ErrorBody = { error: string };
type ChannelProfileBody = {
  nickname: string;
  name: string;
  description: string | null;
  nickname_changed_at: string | null;
  next_nickname_change_at: string | null;
  created_at: string;
};

const OWNER = 'canal@example.com';
const SECOND = 'segundo@example.com';
const RESERVED_EMAIL = 'admin@example.com';
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

describe('channels-me', () => {
  let ctx: VideosE2eContext;
  let ownerToken: string;

  beforeAll(async () => {
    ctx = await createVideosApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetVideosState(ctx);
  });

  const getMine = (token: string) =>
    request(ctx.app.getHttpServer())
      .get('/channels/me')
      .set('Authorization', `Bearer ${token}`);

  const patchMine = (body: Record<string, unknown>, token = ownerToken) =>
    request(ctx.app.getHttpServer())
      .patch('/channels/me')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const nicknameOf = async (email: string): Promise<string> => {
    const user = await ctx.dataSource.getRepository(User).findOneOrFail({
      where: { email },
      relations: { channel: true },
    });
    return user.channel.nickname;
  };

  // 1. Ler e editar o perfil

  test('retorna-o-perfil-do-canal', async () => {
    ownerToken = await createConfirmedUser(ctx.app, OWNER);

    const res = await getMine(ownerToken).expect(200);

    const body = res.body as ChannelProfileBody;
    expect(body.nickname).toBe('canal');
    expect(body.name).toBe('canal');
    expect(body).toHaveProperty('description');
    expect(body.nickname_changed_at).toBeNull();
    expect(body.next_nickname_change_at).toBeNull();
    expect(Number.isNaN(Date.parse(body.created_at))).toBe(false);
  });

  test('troca-de-nickname-inicia-cooldown', async () => {
    ownerToken = await createConfirmedUser(ctx.app, OWNER);

    const changed = await patchMine({ nickname: 'novo_canal' }).expect(200);
    const changedBody = changed.body as ChannelProfileBody;
    expect(changedBody.nickname).toBe('novo_canal');
    expect(changedBody.nickname_changed_at).not.toBeNull();
    expect(Date.parse(changedBody.next_nickname_change_at!)).toBe(
      Date.parse(changedBody.nickname_changed_at!) + COOLDOWN_MS,
    );

    const cooldown = await patchMine({ nickname: 'outro_canal' }).expect(409);
    expect((cooldown.body as ErrorBody).error).toBe('NICKNAME_CHANGE_COOLDOWN');

    const edited = await patchMine({
      name: 'Meu Canal',
      description: 'Sobre',
    }).expect(200);
    expect(edited.body as ChannelProfileBody).toMatchObject({
      name: 'Meu Canal',
      description: 'Sobre',
      nickname: 'novo_canal',
    });
  });

  // 2. Regras do nickname

  test('nickname-em-uso-ou-reservado-retorna-409', async () => {
    ownerToken = await createConfirmedUser(ctx.app, OWNER);
    await createConfirmedUser(ctx.app, SECOND);
    const secondNickname = await nicknameOf(SECOND);

    const taken = await patchMine({ nickname: secondNickname }).expect(409);
    expect((taken.body as ErrorBody).error).toBe('NICKNAME_TAKEN');

    const reserved = await patchMine({ nickname: 'admin' }).expect(409);
    expect((reserved.body as ErrorBody).error).toBe('NICKNAME_RESERVED');
  });

  test('formato-invalido-ou-body-vazio-retorna-400', async () => {
    ownerToken = await createConfirmedUser(ctx.app, OWNER);

    for (const body of [{ nickname: 'ab' }, { nickname: 'Bad-Name' }, {}]) {
      const res = await patchMine(body).expect(400);
      expect((res.body as ErrorBody).error).toBe('VALIDATION_ERROR');
    }
  });

  // 3. Geração no cadastro

  test('email-reservado-gera-user-random', async () => {
    const token = await createConfirmedUser(ctx.app, RESERVED_EMAIL);

    const res = await getMine(token).expect(200);

    expect((res.body as ChannelProfileBody).nickname).toMatch(
      /^user_[a-z0-9]{8}$/,
    );
  });
});
