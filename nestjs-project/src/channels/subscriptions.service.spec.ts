import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  ChannelNotFoundException,
  SelfSubscriptionNotAllowedException,
} from '../common/exceptions/domain.exception';
import { Channel } from './entities/channel.entity';
import { SubscriptionsService } from './subscriptions.service';

const CHANNEL = {
  id: 'channel-id',
  user_id: 'owner-id',
  nickname: 'canal',
} as Channel;

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let findOneBy: jest.Mock;
  let manager: { query: jest.Mock };

  /** Routes the manager's SQL by statement; returns the given INSERT/DELETE result. */
  function respond(writeResult: unknown): void {
    manager.query.mockImplementation((sql: string) => {
      if (sql.includes('INSERT') || sql.includes('DELETE')) {
        return Promise.resolve(writeResult);
      }
      if (sql.includes('SELECT')) {
        return Promise.resolve([{ subscriber_count: 4 }]);
      }
      return Promise.resolve([]);
    });
  }

  const counterUpdates = (): unknown[][] =>
    (manager.query.mock.calls as [string, unknown[]][])
      .filter(([sql]) => sql.includes('UPDATE'))
      .map(([, params]) => params);

  beforeEach(async () => {
    findOneBy = jest.fn().mockResolvedValue(CHANNEL);
    manager = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        {
          provide: DataSource,
          useValue: {
            getRepository: jest.fn().mockReturnValue({ findOneBy }),
            transaction: jest.fn((cb: (m: typeof manager) => unknown) =>
              cb(manager),
            ),
          },
        },
      ],
    }).compile();
    service = module.get(SubscriptionsService);
  });

  it('should reject the caller own channel with SELF_SUBSCRIPTION_NOT_ALLOWED', async () => {
    await expect(service.subscribe('canal', 'owner-id')).rejects.toBeInstanceOf(
      SelfSubscriptionNotAllowedException,
    );
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('should reject an unknown nickname with CHANNEL_NOT_FOUND', async () => {
    findOneBy.mockResolvedValue(null);

    await expect(
      service.subscribe('Nao_Existe', 'viewer-id'),
    ).rejects.toBeInstanceOf(ChannelNotFoundException);
    expect(findOneBy).toHaveBeenCalledWith({ nickname: 'nao_existe' });
  });

  it('should increment the count only when a row was inserted', async () => {
    respond([{ user_id: 'viewer-id' }]);
    await expect(service.subscribe('canal', 'viewer-id')).resolves.toEqual({
      subscriber_count: 4,
      is_subscribed: true,
    });
    expect(counterUpdates()).toEqual([['channel-id', 1]]);

    manager.query.mockReset();
    respond([]);
    await service.subscribe('canal', 'viewer-id');
    expect(counterUpdates()).toEqual([]);
  });

  it('should decrement the count only when a row was deleted', async () => {
    respond([[{ user_id: 'viewer-id' }], 1]);
    await expect(service.unsubscribe('canal', 'viewer-id')).resolves.toEqual({
      subscriber_count: 4,
      is_subscribed: false,
    });
    expect(counterUpdates()).toEqual([['channel-id', -1]]);

    manager.query.mockReset();
    respond([[], 0]);
    await service.unsubscribe('canal', 'viewer-id');
    expect(counterUpdates()).toEqual([]);
  });

  it('should report anonymous viewers as not subscribed without querying', async () => {
    await expect(service.isSubscribed('channel-id', undefined)).resolves.toBe(
      false,
    );
  });
});
