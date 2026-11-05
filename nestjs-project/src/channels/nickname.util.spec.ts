import { appendRandomSuffix, sanitizeNickname } from './nickname.util';

describe('sanitizeNickname', () => {
  it('lowercases and strips invalid chars', () => {
    const result = sanitizeNickname('Hello.World+Test');
    expect(result).toBe('helloworldtest');
  });

  it('preserves underscores', () => {
    const result = sanitizeNickname('john_doe');
    expect(result).toBe('john_doe');
  });

  it('preserves digits', () => {
    const result = sanitizeNickname('user123');
    expect(result).toBe('user123');
  });

  it('truncates to 30 characters', () => {
    const long = 'a'.repeat(60);
    const result = sanitizeNickname(long);
    expect(result.length).toBe(30);
  });

  it('pads a prefix shorter than 3 chars with _ + random hex', () => {
    expect(sanitizeNickname('ab')).toMatch(/^ab_[a-z0-9]{3}$/);
    expect(sanitizeNickname('A.')).toMatch(/^a_[a-z0-9]{3}$/);
  });

  it('keeps a 3-char prefix unpadded', () => {
    expect(sanitizeNickname('abc')).toBe('abc');
  });

  it.each(['admin', 'Me', 'API', 'streamtube', 'n.u.l.l'])(
    'falls back to user_ + 8 random chars when %s sanitizes to a reserved word',
    (prefix) => {
      expect(sanitizeNickname(prefix)).toMatch(/^user_[a-z0-9]{8}$/);
    },
  );

  it('always yields 3–30 chars of [a-z0-9_]', () => {
    for (const prefix of ['a', 'ab', 'x'.repeat(31), 'John.Doe', '!!']) {
      expect(sanitizeNickname(prefix)).toMatch(/^[a-z0-9_]{3,30}$/);
    }
  });

  it('returns user_ + 8 random chars when result is empty', () => {
    const result = sanitizeNickname('!!!---');
    expect(result).toMatch(/^user_[a-z0-9]{8}$/);
  });

  it('returns user_ + 8 random chars for empty string', () => {
    const result = sanitizeNickname('');
    expect(result).toMatch(/^user_[a-z0-9]{8}$/);
  });

  it('produces different fallbacks on repeated empty-prefix calls', () => {
    const a = sanitizeNickname('!!!');
    const b = sanitizeNickname('!!!');
    expect(a).toMatch(/^user_[a-z0-9]{8}$/);
    expect(b).toMatch(/^user_[a-z0-9]{8}$/);
  });
});

describe('appendRandomSuffix', () => {
  it('appends underscore and 3 alphanumeric chars', () => {
    const result = appendRandomSuffix('john');
    expect(result).toMatch(/^john_[a-z0-9]{3}$/);
  });

  it('keeps total length at most 30 chars', () => {
    const long = 'a'.repeat(26);
    const result = appendRandomSuffix(long);
    expect(result.length).toBe(30);
  });

  it('truncates base to 26 before appending suffix', () => {
    const long = 'a'.repeat(30);
    const result = appendRandomSuffix(long);
    expect(result.length).toBe(30);
    expect(result).toMatch(/^a{26}_[a-z0-9]{3}$/);
  });

  it('produces only lowercase letters and digits in suffix', () => {
    for (let i = 0; i < 10; i++) {
      const result = appendRandomSuffix('base');
      expect(result).toMatch(/^base_[a-z0-9]{3}$/);
    }
  });
});
