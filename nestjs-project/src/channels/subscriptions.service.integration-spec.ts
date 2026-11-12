import { DataSource } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Category } from '../categories/entities/category.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { Video } from '../videos/entities/video.entity';
import { Channel } from './entities/channel.entity';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionsService } from './subscriptions.service';

const USER_COUNT = 10;

describe('SubscriptionsService (integration)', () => {
  let dataSource: DataSource;
  let service: SubscriptionsService;
  let channel: Channel;
  let userIds: string[];

  beforeAll(async () => {
    dataSource = createTestDataSource(
      [
        User,
        Channel,
        RefreshToken,
        VerificationToken,
        Video,
        Category,
        Subscription,
      ],
      { synchronize: false },
    );
    await dataSource.initialize();
    service = new SubscriptionsService(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    const users = await dataSource.getRepository(User).save(
      Array.from({ length: USER_COUNT + 1 }, (_, index) => ({
        email: `subscriber${index}@example.com`,
        password: 'hashed',
      })),
    );
    channel = await dataSource.getRepository(Channel).save({
      name: 'Owner',
      nickname: 'subscriptions_owner',
      user_id: users[0].id,
    });
    userIds = users.slice(1).map((user) => user.id);
  });

  const expectCountToMatchRows = async (): Promise<number> => {
    const rows = await dataSource
      .getRepository(Subscription)
      .countBy({ channel_id: channel.id });
    const { subscriber_count } = await dataSource
      .getRepository(Channel)
      .findOneByOrFail({ id: channel.id });
    expect(subscriber_count).toBe(rows);
    return rows;
  };

  it('should keep subscriber_count equal to the row count across repeated calls', async () => {
    await service.subscribe('Subscriptions_Owner', userIds[0]);
    await service.subscribe('subscriptions_owner', userIds[0]);
    await service.subscribe('subscriptions_owner', userIds[1]);
    await service.unsubscribe('subscriptions_owner', userIds[1]);
    await service.unsubscribe('subscriptions_owner', userIds[1]);
    await service.unsubscribe('subscriptions_owner', userIds[2]);

    await expect(expectCountToMatchRows()).resolves.toBe(1);
    await expect(service.isSubscribed(channel.id, userIds[0])).resolves.toBe(
      true,
    );
    await expect(service.isSubscribed(channel.id, userIds[1])).resolves.toBe(
      false,
    );
  });

  it('should count concurrent subscribes by distinct users', async () => {
    await Promise.all(
      userIds.map((userId) => service.subscribe('subscriptions_owner', userId)),
    );

    await expect(expectCountToMatchRows()).resolves.toBe(USER_COUNT);
  });

  it('should not drift when one user subscribes and unsubscribes concurrently', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        index % 2 === 0
          ? service.subscribe('subscriptions_owner', userIds[0])
          : service.unsubscribe('subscriptions_owner', userIds[0]),
      ),
    );

    const rows = await expectCountToMatchRows();
    expect(rows).toBeLessThanOrEqual(1);
  });

  describe('listMine', () => {
    const subscribeAt = async (
      userId: string,
      channelId: string,
      createdAt: string,
    ) =>
      dataSource.getRepository(Subscription).save({
        user_id: userId,
        channel_id: channelId,
        created_at: new Date(createdAt),
      });

    it('should list only the caller subscriptions, most recent first, across keyset pages', async () => {
      const owners = await dataSource.getRepository(User).save(
        ['a', 'b', 'c'].map((suffix) => ({
          email: `listed_${suffix}@example.com`,
          password: 'hashed',
        })),
      );
      const channels = await dataSource.getRepository(Channel).save(
        owners.map((owner, index) => ({
          name: `Listed ${index}`,
          nickname: `listed_${index}`,
          user_id: owner.id,
        })),
      );
      await subscribeAt(userIds[0], channels[0].id, '2026-11-01T10:00:00.000Z');
      await subscribeAt(userIds[0], channels[2].id, '2026-11-03T10:00:00.000Z');
      await subscribeAt(userIds[0], channels[1].id, '2026-11-02T10:00:00.000Z');
      await subscribeAt(userIds[1], channel.id, '2026-11-04T10:00:00.000Z');

      const first = await service.listMine(userIds[0], undefined, 2);
      const second = await service.listMine(userIds[0], first.next_cursor!, 2);

      expect(first.items.map((item) => item.nickname)).toEqual([
        'listed_2',
        'listed_1',
      ]);
      expect(first.items[0]).toMatchObject({
        name: 'Listed 2',
        subscriber_count: 0,
        subscribed_at: '2026-11-03T10:00:00.000Z',
      });
      expect(second.items.map((item) => item.nickname)).toEqual(['listed_0']);
      expect(second.next_cursor).toBeNull();
    });

    it('should break ties on the same subscription instant by nickname', async () => {
      const owners = await dataSource.getRepository(User).save(
        ['x', 'y'].map((suffix) => ({
          email: `tie_${suffix}@example.com`,
          password: 'hashed',
        })),
      );
      const [zeta, alpha] = await dataSource.getRepository(Channel).save([
        { name: 'Zeta', nickname: 'tie_zeta', user_id: owners[0].id },
        { name: 'Alpha', nickname: 'tie_alpha', user_id: owners[1].id },
      ]);
      const instant = '2026-11-05T10:00:00.000Z';
      await subscribeAt(userIds[0], zeta.id, instant);
      await subscribeAt(userIds[0], alpha.id, instant);

      const first = await service.listMine(userIds[0], undefined, 1);
      const second = await service.listMine(userIds[0], first.next_cursor!, 1);

      expect([...first.items, ...second.items].map((i) => i.nickname)).toEqual([
        'tie_alpha',
        'tie_zeta',
      ]);
    });

    it('should return an empty page when the caller follows nobody', async () => {
      await expect(
        service.listMine(userIds[5], undefined, 24),
      ).resolves.toEqual({ items: [], next_cursor: null });
    });
  });
});
