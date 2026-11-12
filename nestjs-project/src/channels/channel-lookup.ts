import type { DataSource, EntityManager } from 'typeorm';
import { ChannelNotFoundException } from '../common/exceptions/domain.exception';
import { Channel } from './entities/channel.entity';

/**
 * Channel addressed by its public handle (TD-10). Handles are stored
 * lowercased (`[a-z0-9_]`), so the lookup is case-insensitive by
 * normalizing the input. Shared by `ChannelsService` and
 * `SubscriptionsService` so neither depends on the other.
 */
export async function findChannelByNicknameOrFail(
  source: DataSource | EntityManager,
  nickname: string,
): Promise<Channel> {
  const channel = await source
    .getRepository(Channel)
    .findOneBy({ nickname: nickname.toLowerCase() });
  if (!channel) throw new ChannelNotFoundException();
  return channel;
}
