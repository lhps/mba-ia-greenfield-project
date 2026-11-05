import { InvalidPaginationCursorException } from '../common/exceptions/domain.exception';
import { isPublicId } from './public-id.util';

/** Keyset position of public listings: last row's `(published_at, public_id)` (TD-09). */
export interface PublicationCursor {
  /** UTC ISO-8601 instant with millisecond or microsecond precision (as stored). */
  published_at: string;
  public_id: string;
}

const SEPARATOR = '|';
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
/** Exact UTC instant as rendered by PostgreSQL `to_char(..., 'US')` or `Date#toISOString`. */
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/;
/** `YYYY-MM-DDTHH:MM:SS.mmm` — the part `Date#toISOString` reproduces exactly. */
const MILLIS_PREFIX_LENGTH = 23;

/** Opaque base64url of `published_at|public_id` — never carries internal ids. */
export function encodeCursor(cursor: PublicationCursor): string {
  return Buffer.from(
    `${cursor.published_at}${SEPARATOR}${cursor.public_id}`,
    'utf8',
  ).toString('base64url');
}

/** Decodes a client-supplied cursor; anything malformed or tampered → `VALIDATION_ERROR`. */
export function decodeCursor(raw: string): PublicationCursor {
  if (!BASE64URL_PATTERN.test(raw)) {
    throw new InvalidPaginationCursorException();
  }
  const parts = Buffer.from(raw, 'base64url').toString('utf8').split(SEPARATOR);
  if (parts.length !== 2) throw new InvalidPaginationCursorException();

  const [publishedAt, publicId] = parts;
  if (!isValidUtcInstant(publishedAt) || !isPublicId(publicId)) {
    throw new InvalidPaginationCursorException();
  }
  return { published_at: publishedAt, public_id: publicId };
}

/** Rejects impossible calendar values (e.g. month 13, Feb 30) that the pattern lets through. */
function isValidUtcInstant(value: string): boolean {
  if (!UTC_INSTANT_PATTERN.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return (
    parsed.toISOString().slice(0, MILLIS_PREFIX_LENGTH) ===
    value.slice(0, MILLIS_PREFIX_LENGTH)
  );
}
