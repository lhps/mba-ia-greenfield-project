import { InvalidPaginationCursorException } from '../common/exceptions/domain.exception';
import { isValidUtcInstant } from '../videos/pagination-cursor.util';

/** Keyset position of GET /me/subscriptions: last row's `(created_at, nickname)` (phase-06 TD-09). */
export interface SubscriptionCursor {
  /** UTC ISO-8601 instant with millisecond precision (`timestamptz(3)`). */
  created_at: string;
  nickname: string;
}

const SEPARATOR = '|';
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
/** Stored handles are lowercase `[a-z0-9_]` (grandfathered ones may be shorter/longer). */
const STORED_NICKNAME_PATTERN = /^[a-z0-9_]{1,50}$/;

/** Opaque base64url of `created_at|nickname`. */
export function encodeSubscriptionCursor(cursor: SubscriptionCursor): string {
  return Buffer.from(
    `${cursor.created_at}${SEPARATOR}${cursor.nickname}`,
    'utf8',
  ).toString('base64url');
}

/** Decodes a client-supplied cursor; anything malformed or tampered → `VALIDATION_ERROR`. */
export function decodeSubscriptionCursor(raw: string): SubscriptionCursor {
  if (!BASE64URL_PATTERN.test(raw)) {
    throw new InvalidPaginationCursorException();
  }
  const parts = Buffer.from(raw, 'base64url').toString('utf8').split(SEPARATOR);
  if (parts.length !== 2) throw new InvalidPaginationCursorException();

  const [createdAt, nickname] = parts;
  if (
    !isValidUtcInstant(createdAt) ||
    !STORED_NICKNAME_PATTERN.test(nickname)
  ) {
    throw new InvalidPaginationCursorException();
  }
  return { created_at: createdAt, nickname };
}
