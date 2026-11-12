import { isUUID } from 'class-validator';
import { InvalidPaginationCursorException } from '../common/exceptions/domain.exception';
import { isValidUtcInstant } from '../videos/pagination-cursor.util';

/** Keyset position of a comment page: last row's `(created_at, id)` (phase-06 TD-05). */
export interface CommentCursor {
  /** UTC ISO-8601 instant with millisecond precision (`timestamptz(3)`). */
  created_at: string;
  id: string;
}

const SEPARATOR = '|';
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Opaque base64url of `created_at|id`. */
export function encodeCommentCursor(cursor: CommentCursor): string {
  return Buffer.from(
    `${cursor.created_at}${SEPARATOR}${cursor.id}`,
    'utf8',
  ).toString('base64url');
}

/** Decodes a client-supplied cursor; anything malformed or tampered → `VALIDATION_ERROR`. */
export function decodeCommentCursor(raw: string): CommentCursor {
  if (!BASE64URL_PATTERN.test(raw)) {
    throw new InvalidPaginationCursorException();
  }
  const parts = Buffer.from(raw, 'base64url').toString('utf8').split(SEPARATOR);
  if (parts.length !== 2) throw new InvalidPaginationCursorException();

  const [createdAt, id] = parts;
  if (!isValidUtcInstant(createdAt) || !isUUID(id)) {
    throw new InvalidPaginationCursorException();
  }
  return { created_at: createdAt, id };
}
