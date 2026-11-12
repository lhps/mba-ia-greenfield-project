import type { EntityManager } from 'typeorm';
import { REACTION_VALUE, type ReactionValue } from './videos.constants';

/** Tables of one reaction target: the reaction rows and the row holding the counters. */
export interface ReactionTarget {
  reactionTable: string;
  targetColumn: string;
  counterTable: string;
}

export const VIDEO_REACTION_TARGET: ReactionTarget = {
  reactionTable: 'video_reactions',
  targetColumn: 'video_id',
  counterTable: 'videos',
};

export interface ReactionCounterDeltas {
  like: number;
  dislike: number;
}

export interface ReactionWriteResult {
  like_count: number;
  my_reaction: ReactionValue | null;
}

/** Counter deltas of moving a user's reaction from `previous` to `next` (phase-06 TD-02). */
export function reactionDeltas(
  previous: ReactionValue | null,
  next: ReactionValue | null,
): ReactionCounterDeltas {
  const deltas = { like: 0, dislike: 0 };
  if (previous === next) return deltas;
  if (previous) deltas[counterKey(previous)] -= 1;
  if (next) deltas[counterKey(next)] += 1;
  return deltas;
}

function counterKey(value: ReactionValue): keyof ReactionCounterDeltas {
  return value === REACTION_VALUE.LIKE ? 'like' : 'dislike';
}

/**
 * Sets (`next`) or clears (`null`) the caller's reaction and applies the counter
 * deltas atomically. Must run inside a transaction: the caller's reaction row is
 * locked with `FOR UPDATE` before the delta is computed, so concurrent writes of
 * the same user never drift the counters (phase-06 TD-02, TD-03).
 */
export async function writeReaction(
  manager: EntityManager,
  target: ReactionTarget,
  userId: string,
  targetId: string,
  next: ReactionValue | null,
): Promise<ReactionWriteResult> {
  const { reactionTable, targetColumn } = target;
  let previous = await lockCurrentValue(manager, target, userId, targetId);

  // No row to lock yet: insert without raising, so a concurrent first write of
  // the same user waits on ours instead of aborting the transaction. On a
  // conflict, lock the winner's row; if a concurrent clear removed it in the
  // meantime, try the insert again.
  while (previous === null && next !== null) {
    const inserted = await manager.query<unknown[]>(
      `INSERT INTO "${reactionTable}" ("user_id", "${targetColumn}", "value")
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING "user_id"`,
      [userId, targetId, next],
    );
    if (inserted.length > 0) {
      return applyDeltas(
        manager,
        target,
        targetId,
        reactionDeltas(null, next),
        next,
      );
    }
    previous = await lockCurrentValue(manager, target, userId, targetId);
  }

  if (previous !== next) {
    if (next === null) {
      await manager.query(
        `DELETE FROM "${reactionTable}" WHERE "user_id" = $1 AND "${targetColumn}" = $2`,
        [userId, targetId],
      );
    } else {
      await manager.query(
        `UPDATE "${reactionTable}" SET "value" = $3, "updated_at" = now()
         WHERE "user_id" = $1 AND "${targetColumn}" = $2`,
        [userId, targetId, next],
      );
    }
  }
  return applyDeltas(
    manager,
    target,
    targetId,
    reactionDeltas(previous, next),
    next,
  );
}

async function lockCurrentValue(
  manager: EntityManager,
  { reactionTable, targetColumn }: ReactionTarget,
  userId: string,
  targetId: string,
): Promise<ReactionValue | null> {
  const rows = await manager.query<{ value: ReactionValue }[]>(
    `SELECT "value" FROM "${reactionTable}"
     WHERE "user_id" = $1 AND "${targetColumn}" = $2
     FOR UPDATE`,
    [userId, targetId],
  );
  return rows[0]?.value ?? null;
}

async function applyDeltas(
  manager: EntityManager,
  { counterTable }: ReactionTarget,
  targetId: string,
  deltas: ReactionCounterDeltas,
  myReaction: ReactionValue | null,
): Promise<ReactionWriteResult> {
  if (deltas.like !== 0 || deltas.dislike !== 0) {
    // Atomic `col = col ± n` — never read-modify-write.
    await manager.query(
      `UPDATE "${counterTable}"
       SET "like_count" = "like_count" + $2, "dislike_count" = "dislike_count" + $3
       WHERE "id" = $1`,
      [targetId, deltas.like, deltas.dislike],
    );
  }
  // Read-your-own-write: the count includes this transaction's delta.
  const rows = await manager.query<{ like_count: number }[]>(
    `SELECT "like_count" FROM "${counterTable}" WHERE "id" = $1`,
    [targetId],
  );
  return { like_count: rows[0].like_count, my_reaction: myReaction };
}
