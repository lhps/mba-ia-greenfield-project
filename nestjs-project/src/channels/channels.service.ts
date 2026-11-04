import { Injectable } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import {
  ChannelNotFoundException,
  NicknameChangeCooldownException,
  NicknameReservedException,
  NicknameTakenException,
} from '../common/exceptions/domain.exception';
import {
  NICKNAME_CHANGE_COOLDOWN_MS,
  RESERVED_NICKNAMES,
} from './channels.constants';
import type { ChannelProfileDto } from './dto/channel-profile.dto';
import type { PublicChannelDto } from './dto/public-channel.dto';
import type { UpdateChannelDto } from './dto/update-channel.dto';
import { appendRandomSuffix, sanitizeNickname } from './nickname.util';
import { Channel } from './entities/channel.entity';

const PG_UNIQUE_VIOLATION = '23505';
const NICKNAME_COLUMN = 'nickname';
const MAX_RETRIES = 5;

function isPgUniqueViolationOnColumn(err: unknown, column: string): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const e = err as QueryFailedError & { code?: unknown; detail?: unknown };
  return (
    e.code === PG_UNIQUE_VIOLATION &&
    typeof e.detail === 'string' &&
    e.detail.includes(column)
  );
}

@Injectable()
export class ChannelsService {
  constructor(private readonly dataSource: DataSource) {}

  async findByUserId(userId: string): Promise<Channel | null> {
    return this.dataSource
      .getRepository(Channel)
      .findOneBy({ user_id: userId });
  }

  /**
   * Channel addressed by its public handle (TD-10). Handles are stored
   * lowercased (`[a-z0-9_]`), so the lookup is case-insensitive by
   * normalizing the input.
   */
  async findByNicknameOrFail(nickname: string): Promise<Channel> {
    const channel = await this.dataSource
      .getRepository(Channel)
      .findOneBy({ nickname: nickname.toLowerCase() });
    if (!channel) throw new ChannelNotFoundException();
    return channel;
  }

  /** Public channel page header (GET /channels/:nickname). */
  async getPublicProfile(nickname: string): Promise<PublicChannelDto> {
    const channel = await this.findByNicknameOrFail(nickname);
    return {
      nickname: channel.nickname,
      name: channel.name,
      description: channel.description,
      created_at: channel.created_at.toISOString(),
    };
  }

  /** The caller's own channel as `ChannelProfile` (GET /channels/me). */
  async getProfile(userId: string): Promise<ChannelProfileDto> {
    const channel = await this.findOwnOrFail(userId);
    return this.toChannelProfile(channel);
  }

  /**
   * Partial edit of the caller's channel (TD-11). A new nickname must not be
   * reserved, may change only once every 14 days (measured from
   * `nickname_changed_at`) and must be unique; submitting the current nickname
   * is a no-op that does not start a cooldown. Nothing is persisted when a
   * rule fails.
   */
  async updateProfile(
    userId: string,
    dto: UpdateChannelDto,
  ): Promise<ChannelProfileDto> {
    const channel = await this.findOwnOrFail(userId);
    const now = new Date();

    if (dto.nickname !== undefined && dto.nickname !== channel.nickname) {
      if (RESERVED_NICKNAMES.has(dto.nickname)) {
        throw new NicknameReservedException();
      }
      if (this.cooldownEndsAt(channel, now) !== null) {
        throw new NicknameChangeCooldownException();
      }
      channel.nickname = dto.nickname;
      channel.nickname_changed_at = now;
    }
    if (dto.name !== undefined) channel.name = dto.name;
    if (dto.description !== undefined) channel.description = dto.description;

    try {
      const saved = await this.dataSource.getRepository(Channel).save(channel);
      return this.toChannelProfile(saved, now);
    } catch (err) {
      if (isPgUniqueViolationOnColumn(err, NICKNAME_COLUMN)) {
        throw new NicknameTakenException();
      }
      throw err;
    }
  }

  async createChannel(userId: string, email: string): Promise<Channel> {
    const baseNickname = sanitizeNickname(email.split('@')[0]);

    return this.dataSource.transaction(async (manager) => {
      let nickname = baseNickname;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const existing = await manager.findOne(Channel, {
          where: { nickname },
        });
        if (existing) {
          nickname = appendRandomSuffix(baseNickname);
          continue;
        }

        try {
          return await manager.save(
            manager.create(Channel, {
              name: baseNickname,
              nickname,
              user_id: userId,
            }),
          );
        } catch (err) {
          if (isPgUniqueViolationOnColumn(err, NICKNAME_COLUMN)) {
            // Concurrent insert between pre-check and save — retry with new suffix
            nickname = appendRandomSuffix(baseNickname);
          } else {
            throw err;
          }
        }
      }

      throw new Error(
        'Nickname conflict could not be resolved after max retries',
      );
    });
  }

  private async findOwnOrFail(userId: string): Promise<Channel> {
    const channel = await this.findByUserId(userId);
    if (!channel) throw new ChannelNotFoundException();
    return channel;
  }

  /** End of the nickname cooldown, or `null` when a change is allowed at `now`. */
  private cooldownEndsAt(channel: Channel, now: Date): Date | null {
    if (!channel.nickname_changed_at) return null;
    const endsAt = new Date(
      channel.nickname_changed_at.getTime() + NICKNAME_CHANGE_COOLDOWN_MS,
    );
    return endsAt.getTime() > now.getTime() ? endsAt : null;
  }

  private toChannelProfile(
    channel: Channel,
    now: Date = new Date(),
  ): ChannelProfileDto {
    const cooldownEndsAt = this.cooldownEndsAt(channel, now);
    return {
      nickname: channel.nickname,
      name: channel.name,
      description: channel.description,
      nickname_changed_at: channel.nickname_changed_at
        ? channel.nickname_changed_at.toISOString()
        : null,
      next_nickname_change_at: cooldownEndsAt
        ? cooldownEndsAt.toISOString()
        : null,
      created_at: channel.created_at.toISOString(),
    };
  }
}
