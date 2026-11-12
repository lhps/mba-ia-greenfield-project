import { InvalidPaginationCursorException } from '../common/exceptions/domain.exception';
import {
  decodeCommentCursor,
  encodeCommentCursor,
} from './comment-cursor.util';

describe('comment-cursor.util', () => {
  const position = {
    created_at: '2026-11-11T12:00:00.123Z',
    id: '3f1c2b4a-8d9e-4f10-9a2b-1c3d4e5f6a7b',
  };

  it('should round-trip a position through an opaque base64url token', () => {
    const token = encodeCommentCursor(position);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain(position.id);
    expect(decodeCommentCursor(token)).toEqual(position);
  });

  const encodeRaw = (value: string) =>
    Buffer.from(value, 'utf8').toString('base64url');

  it.each([
    ['plain garbage', 'abc!'],
    ['empty string', ''],
    ['missing separator', encodeRaw('2026-11-11T12:00:00.123Z')],
    [
      'extra segment',
      encodeRaw(
        '2026-11-11T12:00:00.123Z|3f1c2b4a-8d9e-4f10-9a2b-1c3d4e5f6a7b|x',
      ),
    ],
    [
      'non-ISO timestamp',
      encodeRaw('yesterday|3f1c2b4a-8d9e-4f10-9a2b-1c3d4e5f6a7b'),
    ],
    [
      'impossible day',
      encodeRaw(
        '2026-02-30T12:00:00.123Z|3f1c2b4a-8d9e-4f10-9a2b-1c3d4e5f6a7b',
      ),
    ],
    ['non-uuid id', encodeRaw("2026-11-11T12:00:00.123Z|' OR 1=1 --")],
  ])('should reject a %s cursor with VALIDATION_ERROR', (_label, raw) => {
    let thrown: unknown;
    try {
      decodeCommentCursor(raw);
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
