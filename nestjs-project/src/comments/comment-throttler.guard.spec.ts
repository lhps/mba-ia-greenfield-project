import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, type ThrottlerStorage } from '@nestjs/throttler';
import { CommentThrottlerGuard } from './comment-throttler.guard';

class CommentsHandlerHost {}
function create(): void {}

function contextFor(sub: string, ip: string): ExecutionContext {
  const req = { user: { sub }, ip, headers: {} };
  const res = { header: jest.fn() };
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getClass: () => CommentsHandlerHost,
    getHandler: () => create,
  } as unknown as ExecutionContext;
}

describe('CommentThrottlerGuard', () => {
  let hits: Map<string, number>;
  let storage: { increment: jest.Mock };
  let guard: CommentThrottlerGuard;

  beforeEach(() => {
    hits = new Map();
    storage = {
      increment: jest.fn((key: string, _ttl: number, limit: number) => {
        const totalHits = (hits.get(key) ?? 0) + 1;
        hits.set(key, totalHits);
        return Promise.resolve({
          totalHits,
          timeToExpire: 60,
          isBlocked: totalHits > limit,
          timeToBlockExpire: 60,
        });
      }),
    };
    guard = new CommentThrottlerGuard(
      [],
      storage as unknown as ThrottlerStorage,
      new Reflector(),
      { rateLimit: 2, rateTtlSeconds: 60 },
    );
  });

  it('should count by the JWT sub, not the IP', async () => {
    await guard.canActivate(contextFor('user-1', '203.0.113.7'));
    await guard.canActivate(contextFor('user-1', '198.51.100.9'));

    const keys = (storage.increment.mock.calls as [string][]).map(
      ([key]) => key,
    );
    expect(keys[0]).toBe(keys[1]);
    await expect(
      guard.canActivate(contextFor('user-1', '192.0.2.44')),
    ).rejects.toBeInstanceOf(ThrottlerException);
  });

  it('should keep separate counters per user', async () => {
    await guard.canActivate(contextFor('user-1', '203.0.113.7'));
    await guard.canActivate(contextFor('user-1', '203.0.113.7'));

    await expect(
      guard.canActivate(contextFor('user-2', '203.0.113.7')),
    ).resolves.toBe(true);
  });

  it('should pass the configured limit and TTL in milliseconds to the storage', async () => {
    await guard.canActivate(contextFor('user-1', '203.0.113.7'));

    expect(storage.increment).toHaveBeenCalledWith(
      expect.any(String),
      60000,
      2,
      60000,
      'comments',
    );
  });
});
