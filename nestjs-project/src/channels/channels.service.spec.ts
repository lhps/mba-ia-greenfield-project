import { DataSource, QueryFailedError } from 'typeorm';
import {
  ChannelNotFoundException,
  NicknameChangeCooldownException,
  NicknameReservedException,
  NicknameTakenException,
} from '../common/exceptions/domain.exception';
import { NICKNAME_CHANGE_COOLDOWN_MS } from './channels.constants';
import { ChannelsService } from './channels.service';
import { Channel } from './entities/channel.entity';

type ManagerMock = {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

function makeManager(overrides: Partial<ManagerMock> = {}): ManagerMock {
  return {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    ...overrides,
  };
}

function makeChannel(nickname: string): Channel {
  const c = new Channel();
  c.id = 'uuid';
  c.nickname = nickname;
  c.name = nickname;
  c.user_id = 'user-id';
  c.description = null;
  c.created_at = new Date();
  c.updated_at = new Date();
  return c;
}

function makeUniqueError(): QueryFailedError {
  const err = new QueryFailedError('INSERT', [], new Error());
  Object.assign(err, {
    code: '23505',
    detail: 'Key (nickname)=(abc) already exists.',
  });
  return err;
}

function makeDataSource(manager: ManagerMock): DataSource {
  return {
    transaction: jest.fn((cb: (manager: ManagerMock) => Promise<unknown>) =>
      cb(manager),
    ),
  } as unknown as DataSource;
}

describe('ChannelsService', () => {
  describe('createChannel', () => {
    it('derives nickname from email prefix and saves when no collision', async () => {
      const channel = makeChannel('test');
      const manager = makeManager({
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(channel),
        save: jest.fn().mockResolvedValue(channel),
      });
      const service = new ChannelsService(makeDataSource(manager));

      const result = await service.createChannel('user-id', 'test@example.com');

      expect(manager.findOne).toHaveBeenCalledWith(Channel, {
        where: { nickname: 'test' },
      });
      expect(manager.save).toHaveBeenCalledTimes(1);
      expect(result.nickname).toBe('test');
    });

    it('retries with suffix when pre-check finds existing nickname', async () => {
      const colliding = makeChannel('john');
      const resolved = makeChannel('john_abc');
      const manager = makeManager({
        findOne: jest
          .fn()
          .mockResolvedValueOnce(colliding)
          .mockResolvedValueOnce(null),
        create: jest.fn().mockReturnValue(resolved),
        save: jest.fn().mockResolvedValue(resolved),
      });
      const service = new ChannelsService(makeDataSource(manager));

      const result = await service.createChannel('user-id', 'john@example.com');

      expect(manager.findOne).toHaveBeenCalledTimes(2);
      expect(manager.save).toHaveBeenCalledTimes(1);
      expect(result.nickname).toMatch(/^john_[a-z0-9]{3}$/);
    });

    it('retries with suffix on concurrent unique constraint violation', async () => {
      const resolved = makeChannel('alice_abc');
      const manager = makeManager({
        findOne: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        create: jest.fn().mockReturnValue(resolved),
        save: jest
          .fn()
          .mockRejectedValueOnce(makeUniqueError())
          .mockResolvedValueOnce(resolved),
      });
      const service = new ChannelsService(makeDataSource(manager));

      const result = await service.createChannel(
        'user-id',
        'alice@example.com',
      );

      expect(manager.save).toHaveBeenCalledTimes(2);
      expect(result.nickname).toMatch(/^alice/);
    });

    it('throws after exhausting max retries', async () => {
      const existing = makeChannel('bob');
      const manager = makeManager({
        findOne: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
        save: jest.fn(),
      });
      const service = new ChannelsService(makeDataSource(manager));

      await expect(
        service.createChannel('user-id', 'bob@example.com'),
      ).rejects.toThrow(
        'Nickname conflict could not be resolved after max retries',
      );
    });

    it('re-throws non-unique-constraint errors immediately', async () => {
      const unexpectedError = new Error('Connection lost');
      const channel = makeChannel('carol');
      const manager = makeManager({
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(channel),
        save: jest.fn().mockRejectedValue(unexpectedError),
      });
      const service = new ChannelsService(makeDataSource(manager));

      await expect(
        service.createChannel('user-id', 'carol@example.com'),
      ).rejects.toThrow('Connection lost');
      expect(manager.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateProfile', () => {
    const NOW = new Date('2026-11-04T12:00:00.000Z');

    type RepoMock = { findOneBy: jest.Mock; save: jest.Mock };

    function makeRepoService(channel: Channel | null): {
      service: ChannelsService;
      repo: RepoMock;
    } {
      const repo: RepoMock = {
        findOneBy: jest.fn().mockResolvedValue(channel),
        save: jest.fn((c: Channel) => Promise.resolve(c)),
      };
      const dataSource = {
        getRepository: jest.fn().mockReturnValue(repo),
      } as unknown as DataSource;
      return { service: new ChannelsService(dataSource), repo };
    }

    function changedAgo(ms: number): Date {
      return new Date(NOW.getTime() - ms);
    }

    beforeEach(() => {
      jest.useFakeTimers({ now: NOW });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('treats the current nickname as a no-op without starting a cooldown', async () => {
      const channel = makeChannel('same');
      channel.nickname_changed_at = null;
      const { service, repo } = makeRepoService(channel);

      const result = await service.updateProfile('user-id', {
        nickname: 'same',
      });

      expect(result.nickname).toBe('same');
      expect(result.nickname_changed_at).toBeNull();
      expect(result.next_nickname_change_at).toBeNull();
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ nickname_changed_at: null }),
      );
    });

    it('allows the current nickname while in cooldown (no-op)', async () => {
      const channel = makeChannel('same');
      channel.nickname_changed_at = changedAgo(1000);
      const { service } = makeRepoService(channel);

      await expect(
        service.updateProfile('user-id', { nickname: 'same' }),
      ).resolves.toMatchObject({ nickname: 'same' });
    });

    it('rejects a reserved nickname without saving', async () => {
      const { service, repo } = makeRepoService(makeChannel('owner'));

      await expect(
        service.updateProfile('user-id', { nickname: 'admin' }),
      ).rejects.toBeInstanceOf(NicknameReservedException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects a nickname change 1 ms before the 14-day cooldown ends', async () => {
      const channel = makeChannel('owner');
      channel.nickname_changed_at = changedAgo(NICKNAME_CHANGE_COOLDOWN_MS - 1);
      const { service, repo } = makeRepoService(channel);

      await expect(
        service.updateProfile('user-id', { nickname: 'novo' }),
      ).rejects.toBeInstanceOf(NicknameChangeCooldownException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('allows a nickname change exactly 14 days after the last one', async () => {
      const channel = makeChannel('owner');
      channel.nickname_changed_at = changedAgo(NICKNAME_CHANGE_COOLDOWN_MS);
      const { service } = makeRepoService(channel);

      const result = await service.updateProfile('user-id', {
        nickname: 'novo',
      });

      expect(result.nickname).toBe('novo');
      expect(result.nickname_changed_at).toBe(NOW.toISOString());
      expect(result.next_nickname_change_at).toBe(
        new Date(NOW.getTime() + NICKNAME_CHANGE_COOLDOWN_MS).toISOString(),
      );
    });

    it('allows name/description edits during the cooldown', async () => {
      const channel = makeChannel('owner');
      const changedAt = changedAgo(1000);
      channel.nickname_changed_at = changedAt;
      const { service } = makeRepoService(channel);

      const result = await service.updateProfile('user-id', {
        name: 'Novo nome',
        description: null,
      });

      expect(result).toMatchObject({
        nickname: 'owner',
        name: 'Novo nome',
        description: null,
        nickname_changed_at: changedAt.toISOString(),
      });
    });

    it('maps a 23505 unique violation on nickname to NicknameTakenException', async () => {
      const { service, repo } = makeRepoService(makeChannel('owner'));
      repo.save.mockRejectedValueOnce(makeUniqueError());

      await expect(
        service.updateProfile('user-id', { nickname: 'abc' }),
      ).rejects.toBeInstanceOf(NicknameTakenException);
    });

    it('re-throws other save errors unchanged', async () => {
      const { service, repo } = makeRepoService(makeChannel('owner'));
      const failure = new Error('Connection lost');
      repo.save.mockRejectedValueOnce(failure);

      await expect(
        service.updateProfile('user-id', { name: 'x' }),
      ).rejects.toBe(failure);
    });

    it('throws ChannelNotFoundException when the user has no channel', async () => {
      const { service } = makeRepoService(null);

      await expect(
        service.updateProfile('user-id', { name: 'x' }),
      ).rejects.toBeInstanceOf(ChannelNotFoundException);
    });
  });

  describe('findByNicknameOrFail / getPublicProfile', () => {
    function makeLookupService(channel: Channel | null): {
      service: ChannelsService;
      findOneBy: jest.Mock;
    } {
      const findOneBy = jest.fn().mockResolvedValue(channel);
      const dataSource = {
        getRepository: jest.fn().mockReturnValue({ findOneBy }),
      } as unknown as DataSource;
      return { service: new ChannelsService(dataSource), findOneBy };
    }

    it('returns the channel, looking the handle up lowercased', async () => {
      const channel = makeChannel('meu_canal');
      const { service, findOneBy } = makeLookupService(channel);

      await expect(service.findByNicknameOrFail('Meu_Canal')).resolves.toBe(
        channel,
      );
      expect(findOneBy).toHaveBeenCalledWith({ nickname: 'meu_canal' });
    });

    it('throws ChannelNotFoundException (CHANNEL_NOT_FOUND) for an unknown handle', async () => {
      const { service } = makeLookupService(null);

      await expect(
        service.findByNicknameOrFail('nao_existe'),
      ).rejects.toMatchObject({
        constructor: ChannelNotFoundException,
        errorCode: 'CHANNEL_NOT_FOUND',
        httpStatus: 404,
      });
    });

    it('exposes only the public fields on the public profile', async () => {
      const channel = makeChannel('meu_canal');
      channel.description = 'sobre';
      channel.nickname_changed_at = new Date('2026-11-01T00:00:00.000Z');
      channel.created_at = new Date('2026-10-01T08:00:00.000Z');
      const { service } = makeLookupService(channel);

      await expect(service.getPublicProfile('meu_canal')).resolves.toEqual({
        nickname: 'meu_canal',
        name: 'meu_canal',
        description: 'sobre',
        created_at: '2026-10-01T08:00:00.000Z',
      });
    });
  });
});
