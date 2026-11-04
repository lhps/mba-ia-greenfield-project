import { generatePublicId, isPublicId } from './public-id.util';

describe('generatePublicId', () => {
  it('should produce 11 URL-safe characters', () => {
    const id = generatePublicId();

    expect(id).toMatch(/^[A-Za-z0-9_-]{11}$/);
  });

  it('should produce distinct values across many calls', () => {
    const ids = new Set(Array.from({ length: 10000 }, generatePublicId));

    expect(ids.size).toBe(10000);
  });
});

describe('isPublicId', () => {
  it.each(['AbC_def-123', generatePublicId()])('should accept %s', (value) => {
    expect(isPublicId(value)).toBe(true);
  });

  it.each(['abc', 'AbC_def-1234', 'AbC def-123', 'AbC/def+123', ''])(
    'should reject %p',
    (value) => {
      expect(isPublicId(value)).toBe(false);
    },
  );
});
