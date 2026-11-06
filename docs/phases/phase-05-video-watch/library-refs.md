---
libs:
  "ioredis":
    version: "^5.11.1"
    context7_id: "/redis/ioredis/v5.11.1"
    fetched_at: "2026-11-06T09:01:45-03:00"
sources_mtime:
  docs/decisions/technical-decisions-phase-05-video-watch.md: "2026-11-06T10:20:01-03:00"
---

# Library References — phase-05-video-watch

## ioredis

Used by phase-05-video-watch/TD-01 (view dedup per viewer with `SET NX EX`). Installed version `^5.11.1` (already a dependency via BullMQ); docs fetched for the matching `v5.11.1` tag.

### Import (TypeScript)

Use the named export; the default import still works but is slated for deprecation in the next major:

```typescript
import { Redis } from 'ioredis';
```

### Connection

```typescript
new Redis({
  host: 'redis', // Compose service name — reuse REDIS_HOST / REDIS_PORT already validated in src/config/env.validation.ts
  port: 6379,
  db: 0,
});
```

The project already reads `REDIS_HOST` / `REDIS_PORT` in `src/config/queue.config.ts` for BullMQ. Build the dedup client from the same values instead of introducing new keys.

### Atomic "set if absent with expiry" (dedup primitive)

All arguments of `set` are passed straight to the Redis server, so the `NX` and `EX` flags combine as in the CLI (`SET key value EX <seconds> NX`):

```typescript
const result = await redis.set(key, '1', 'EX', windowSeconds, 'NX');
// result === 'OK'  → key was absent: first view in the window → increment view_count
// result === null  → key already existed: repeated view → do not increment
```

`EX` sets the TTL in seconds (equivalent to `SET key data EX 60`). With `NX`, Redis returns a nil reply when the key exists, and ioredis resolves it to `null`.

### Lifecycle

Commands return promises; the client connects immediately on construction. Close it on module shutdown (e.g., in `onModuleDestroy`) with `await redis.quit()` so Jest suites and the app exit without open handles.
