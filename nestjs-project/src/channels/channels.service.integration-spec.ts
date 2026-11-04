import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { NicknameTakenException } from '../common/exceptions/domain.exception';
import { NICKNAME_CHANGE_COOLDOWN_MS } from './channels.constants';
import { ChannelsService } from './channels.service';
import { Channel } from './entities/channel.entity';
import { Video } from '../videos/entities/video.entity';
import { Category } from '../categories/entities/category.entity';

const ALL_ENTITIES = [
  User,
  Channel,
  RefreshToken,
  VerificationToken,
  Video,
  Category,
];

describe('ChannelsService (integration)', () => {
  let dataSource: DataSource;
  let channelsService: ChannelsService;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    channelsService = new ChannelsService(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  let userCounter = 0;
  async function createUser(): Promise<User> {
    return userRepository.save(
      userRepository.create({
        email: `ch_svc_${++userCounter}@example.com`,
        password: 'hashed',
      }),
    );
  }

  describe('createChannel', () => {
    it('persists a channel derived from email', async () => {
      const user = await createUser();

      const channel = await channelsService.createChannel(
        user.id,
        'mynick@example.com',
      );

      expect(channel.id).toBeDefined();
      expect(channel.nickname).toBe('mynick');
      expect(channel.name).toBe('mynick');
      expect(channel.user_id).toBe(user.id);

      const persisted = await channelRepository.findOneBy({ user_id: user.id });
      expect(persisted).not.toBeNull();
      expect(persisted!.nickname).toBe('mynick');
    });

    it('derives nickname from email prefix', async () => {
      const user = await createUser();

      const channel = await channelsService.createChannel(
        user.id,
        'John.Doe+tag@example.com',
      );

      expect(channel.nickname).toBe('johndoetag');
    });

    it('resolves nickname collision by appending a suffix', async () => {
      const user1 = await createUser();
      const user2 = await createUser();

      await channelsService.createChannel(user1.id, 'shared@example.com');
      const channel2 = await channelsService.createChannel(
        user2.id,
        'shared@example.com',
      );

      expect(channel2.nickname).toMatch(/^shared_[a-z0-9]{3}$/);

      const channels = await channelRepository.find();
      expect(channels).toHaveLength(2);
    });
  });

  describe('updateProfile', () => {
    it('maps the unique violation on a taken nickname to NicknameTakenException and persists nothing', async () => {
      const owner = await createUser();
      const other = await createUser();
      await channelsService.createChannel(owner.id, 'owner@example.com');
      await channelsService.createChannel(other.id, 'taken@example.com');

      await expect(
        channelsService.updateProfile(owner.id, {
          nickname: 'taken',
          name: 'Should not persist',
        }),
      ).rejects.toBeInstanceOf(NicknameTakenException);

      const persisted = await channelRepository.findOneByOrFail({
        user_id: owner.id,
      });
      expect(persisted.nickname).toBe('owner');
      expect(persisted.name).toBe('owner');
      expect(persisted.nickname_changed_at).toBeNull();
    });

    it('keeps a grandfathered out-of-rule handle when only name changes', async () => {
      const owner = await createUser();
      await channelRepository.save(
        channelRepository.create({
          user_id: owner.id,
          nickname: 'ab',
          name: 'ab',
        }),
      );

      const profile = await channelsService.updateProfile(owner.id, {
        name: 'Renamed',
      });

      expect(profile).toMatchObject({ nickname: 'ab', name: 'Renamed' });
    });

    it('persists the new nickname and nickname_changed_at', async () => {
      const owner = await createUser();
      await channelsService.createChannel(owner.id, 'owner@example.com');
      const before = Date.now();

      const profile = await channelsService.updateProfile(owner.id, {
        nickname: 'novo_canal',
      });

      const persisted = await channelRepository.findOneByOrFail({
        user_id: owner.id,
      });
      expect(persisted.nickname).toBe('novo_canal');
      expect(persisted.nickname_changed_at).not.toBeNull();
      const changedAt = persisted.nickname_changed_at!.getTime();
      expect(changedAt).toBeGreaterThanOrEqual(before - 1000);
      expect(profile.nickname_changed_at).toBe(
        persisted.nickname_changed_at!.toISOString(),
      );
      expect(profile.next_nickname_change_at).toBe(
        new Date(changedAt + NICKNAME_CHANGE_COOLDOWN_MS).toISOString(),
      );
    });
  });
});
