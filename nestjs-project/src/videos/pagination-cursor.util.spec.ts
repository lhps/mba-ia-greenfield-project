import { InvalidPaginationCursorException } from '../common/exceptions/domain.exception';
import { decodeCursor, encodeCursor } from './pagination-cursor.util';

describe('pagination-cursor.util', () => {
  const position = {
    published_at: '2026-11-02T12:00:00.123456Z',
    public_id: 'aB3_-xYz9Qw',
  };

  it('should round-trip a microsecond-precision position through an opaque base64url token', () => {
    const token = encodeCursor(position);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain(position.public_id);
    expect(decodeCursor(token)).toEqual(position);
  });

  it('should accept millisecond precision', () => {
    const millis = { ...position, published_at: '2026-11-02T12:00:00.123Z' };

    expect(decodeCursor(encodeCursor(millis))).toEqual(millis);
  });

  const encodeRaw = (value: string) =>
    Buffer.from(value, 'utf8').toString('base64url');

  it.each([
    ['plain garbage', 'garbage'],
    ['empty string', ''],
    ['non-base64url characters', 'abc$%^'],
    ['missing separator', encodeRaw('2026-11-02T12:00:00.123Z')],
    ['extra segment', encodeRaw('2026-11-02T12:00:00.123Z|aB3_-xYz9Qw|extra')],
    ['non-ISO timestamp', encodeRaw('yesterday|aB3_-xYz9Qw')],
    [
      'timestamp without zone',
      encodeRaw('2026-11-02T12:00:00.123|aB3_-xYz9Qw'),
    ],
    ['impossible month', encodeRaw('2026-13-02T12:00:00.123Z|aB3_-xYz9Qw')],
    ['impossible day', encodeRaw('2026-02-30T12:00:00.123Z|aB3_-xYz9Qw')],
    ['malformed public_id', encodeRaw('2026-11-02T12:00:00.123Z|short')],
    ['SQL in public_id', encodeRaw("2026-11-02T12:00:00.123Z|' OR 1=1 --")],
  ])('should reject a %s cursor with VALIDATION_ERROR', (_label, raw) => {
    let thrown: unknown;
    try {
      decodeCursor(raw);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(InvalidPaginationCursorException);
    expect(thrown).toMatchObject({
      errorCode: 'VALIDATION_ERROR',
      httpStatus: 400,
    });
  });

  it('should reject a tampered token', () => {
    const token = encodeCursor(position);
    const tampered = `${token.slice(0, 5)}${token[5] === 'A' ? 'B' : 'A'}${token.slice(6)}`;

    expect(() => decodeCursor(tampered)).toThrow(
      InvalidPaginationCursorException,
    );
  });
});
