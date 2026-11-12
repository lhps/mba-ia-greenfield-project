import { reactionDeltas } from './reaction-writer';

describe('reactionDeltas', () => {
  it.each([
    [null, 'like', { like: 1, dislike: 0 }],
    [null, 'dislike', { like: 0, dislike: 1 }],
    ['like', 'dislike', { like: -1, dislike: 1 }],
    ['dislike', 'like', { like: 1, dislike: -1 }],
    ['like', null, { like: -1, dislike: 0 }],
    ['dislike', null, { like: 0, dislike: -1 }],
    ['like', 'like', { like: 0, dislike: 0 }],
    [null, null, { like: 0, dislike: 0 }],
  ] as const)('should move %s → %s by %o', (previous, next, expected) => {
    expect(reactionDeltas(previous, next)).toEqual(expected);
  });
});
