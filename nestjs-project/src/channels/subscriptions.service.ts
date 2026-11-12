import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { SelfSubscriptionNotAllowedException } from '../common/exceptions/domain.exception';
import { findChannelByNicknameOrFail } from './channel-lookup';
import type { SubscribedChannelPageDto } from './dto/subscribed-channel.dto';
import type { SubscriptionStateDto } from './dto/subscription-state.dto';
import { Subscription } from './entities/subscription.entity';
import {
  decodeSubscriptionCursor,
  encodeSubscriptionCursor,
} from './subscription-cursor.util';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Follows a channel (phase-06 TD-07). Idempotent: `subscriber_count` grows
   * only when a row was really inserted, so repeats and concurrent calls never
   * drift the counter (TD-02). Following one's own channel is rejected.
   */
  async subscribe(
    nickname: string,
    userId: string,
  ): Promise<SubscriptionStateDto> {
    const channel = await findChannelByNicknameOrFail(
      this.dataSource,
      nickname,
    );
    if (channel.user_id === userId) {
      throw new SelfSubscriptionNotAllowedException();
    }
    return this.dataSource.transaction(async (manager) => {
      const inserted = await manager.query<unknown[]>(
        `INSERT INTO "subscriptions" ("user_id", "channel_id")
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING
         RETURNING "user_id"`,
        [userId, channel.id],
      );
      const delta = inserted.length > 0 ? 1 : 0;
      return {
        subscriber_count: await applyDelta(manager, channel.id, delta),
        is_subscribed: true,
      };
    });
  }

  /** Unfollows a channel. Idempotent: the count drops only when a row was deleted. */
  async unsubscribe(
    nickname: string,
    userId: string,
  ): Promise<SubscriptionStateDto> {
    const channel = await findChannelByNicknameOrFail(
      this.dataSource,
      nickname,
    );
    return this.dataSource.transaction(async (manager) => {
      // The postgres driver returns `[rows, rowCount]` for DELETE … RETURNING.
      const [deleted] = await manager.query<[unknown[], number]>(
        `DELETE FROM "subscriptions"
         WHERE "user_id" = $1 AND "channel_id" = $2
         RETURNING "user_id"`,
        [userId, channel.id],
      );
      const delta = deleted.length > 0 ? -1 : 0;
      return {
        subscriber_count: await applyDelta(manager, channel.id, delta),
        is_subscribed: false,
      };
    });
  }

  /**
   * Channels the caller follows, most recent subscription first (`nickname`
   * breaks ties), keyset-paginated (phase-06 TD-09).
   */
  async listMine(
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<SubscribedChannelPageDto> {
    const params: unknown[] = [userId];
    let keyset = '';
    if (cursor !== undefined) {
      const after = decodeSubscriptionCursor(cursor);
      params.push(after.created_at, after.nickname);
      keyset = `AND (s."created_at" < $2 OR (s."created_at" = $2 AND ch."nickname" > $3))`;
    }
    params.push(limit + 1);

    const rows = await this.dataSource.query<
      {
        nickname: string;
        name: string;
        subscriber_count: number;
        subscribed_at: Date;
      }[]
    >(
      `SELECT ch."nickname", ch."name", ch."subscriber_count",
              s."created_at" AS "subscribed_at"
       FROM "subscriptions" s
       JOIN "channels" ch ON ch."id" = s."channel_id"
       WHERE s."user_id" = $1 ${keyset}
       ORDER BY s."created_at" DESC, ch."nickname" ASC
       LIMIT $${params.length}`,
      params,
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map((row) => ({
        nickname: row.nickname,
        name: row.name,
        subscriber_count: row.subscriber_count,
        subscribed_at: row.subscribed_at.toISOString(),
      })),
      next_cursor:
        hasMore && last
          ? encodeSubscriptionCursor({
              created_at: last.subscribed_at.toISOString(),
              nickname: last.nickname,
            })
          : null,
    };
  }

  /** Viewer state for optional-auth reads (TD-08): `false` for anonymous viewers. */
  async isSubscribed(
    channelId: string,
    userId: string | undefined,
  ): Promise<boolean> {
    if (!userId) return false;
    return this.dataSource
      .getRepository(Subscription)
      .existsBy({ user_id: userId, channel_id: channelId });
  }
}

async function applyDelta(
  manager: EntityManager,
  channelId: string,
  delta: number,
): Promise<number> {
  if (delta !== 0) {
    // Atomic `col = col ± 1` — never read-modify-write.
    await manager.query(
      `UPDATE "channels" SET "subscriber_count" = "subscriber_count" + $2 WHERE "id" = $1`,
      [channelId, delta],
    );
  }
  // Read-your-own-write: the count includes this transaction's delta.
  const rows = await manager.query<{ subscriber_count: number }[]>(
    `SELECT "subscriber_count" FROM "channels" WHERE "id" = $1`,
    [channelId],
  );
  return rows[0].subscriber_count;
}
