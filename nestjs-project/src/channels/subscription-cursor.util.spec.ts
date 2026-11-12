import { InvalidPaginationCursorException } from '../common/exceptions/domain.exception';
import {
  decodeSubscriptionCursor,
  encodeSubscriptionCursor,
} from './subscription-cursor.util';

describe('subscription-cursor.util', () => {
  const position = {
    created_at: '2026-11-11T12:00:00.123Z',
    nickname: 'meu_canal',
  };

  it('should round-trip a position through an opaque base64url token', () => {
    const token = encodeSubscriptionCursor(position);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain(position.nickname);
    expect(decodeSubscriptionCursor(token)).toEqual(position);
  });

  const encodeRaw = (value: string) =>
    Buffer.from(value, 'utf8').toString('base64url');

  it.each([
    ['plain garbage', 'abc!'],
    ['empty string', ''],
    ['missing separator', encodeRaw('2026-11-11T12:00:00.123Z')],
    ['extra segment', encodeRaw('2026-11-11T12:00:00.123Z|meu_canal|x')],
    ['non-ISO timestamp', encodeRaw('yesterday|meu_canal')],
    ['impossible day', encodeRaw('2026-02-30T12:00:00.123Z|meu_canal')],
    ['uppercase nickname', encodeRaw('2026-11-11T12:00:00.123Z|Meu_Canal')],
    ['SQL in nickname', encodeRaw("2026-11-11T12:00:00.123Z|' OR 1=1 --")],
  ])('should reject a %s cursor with VALIDATION_ERROR', (_label, raw) => {
    let thrown: unknown;
    try {
      decodeSubscriptionCursor(raw);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(InvalidPaginationCursorException);
    expect(thrown).toMatchObject({
      errorCode: 'VALIDATION_ERROR',
      httpStatus: 400,
    });
  });
});
