---
kind: phase
name: phase-05-video-watch
test_specs_aware: true
sources_mtime:
  docs/phases/phase-05-video-watch/context.md: "2026-11-06T10:20:49-03:00"
  docs/phases/phase-05-video-watch/library-refs.md: "2026-11-06T10:20:49-03:00"
  docs/decisions/technical-decisions-phase-05-video-watch.md: "2026-11-06T10:20:01-03:00"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-next-frontend-openapi-typing.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-next-frontend-config-base.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-next-frontend-msw-foundation.md: "2026-10-21T16:43:34-03:00"
---

# Phase 05 — Página de Visualização do Vídeo (backend slice)

## Objective

Deliver the backend of the video watch page — view counting (`POST /videos/:id/views`, deduplicated per viewer in Redis), same-category suggestions for the sidebar (`GET /videos/:id/suggestions`), a `GET /videos/:id` response that carries `view_count` and the channel summary, and verified anonymous access, owner-only download and link-only unlisted videos — so the sibling slice `phase-05-video-watch-frontend` can build the player page on a fixed contract.

---

## Step Implementations

### SI-05.1 — Proxy Trust at Bootstrap (Client IP Behind the BFF)

**Description:** Make `req.ip` resolve to the client address appended by the Next BFF, so the anonymous viewer key and the auth rate limit use the real client instead of the BFF container.

**Technical actions:**

1. Update `src/main.ts` — create the app as `NestExpressApplication` and call `app.set('trust proxy', 1)` before `listen` (per `phase-05-video-watch/TD-01` revision — trust exactly one proxy hop)
2. Apply the same `app.set('trust proxy', 1)` in every e2e app factory that reproduces `main.ts` global config — `test/helpers/videos-e2e.ts` (`createVideosApp`), `test/auth.e2e-spec.ts`, `test/swagger.e2e-spec.ts` — so tests exercise the production IP resolution
3. Document in `nestjs-project/CLAUDE.md` (§ Development Environment) that the API must be reachable only through the BFF in deployment and that the published port `3000` is a dev-only exception (per `phase-05-video-watch/TD-01` revision — ICC-1)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Auth throttling keyed by the trusted client IP | E2E: 11th `POST /auth/login` from the same last `X-Forwarded-For` entry → `429`; a different last entry is not throttled; extra entries prepended before the last one are ignored | `test/auth.e2e-spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- After 10 `POST /auth/login` calls with `X-Forwarded-For: 203.0.113.7`, the 11th call with the same header returns `429`
- In the same window, a `POST /auth/login` with `X-Forwarded-For: 198.51.100.9` is not rejected with `429`
- After 10 calls with `X-Forwarded-For: 203.0.113.7`, a call with `X-Forwarded-For: 10.9.9.9, 203.0.113.7` (forged entry prepended) still returns `429`

---

### SI-05.2 — Infra: View Dedup Store on Redis and Dedup Window Config

**Description:** Provide a Redis-backed "first view in the window" primitive and its configurable window, separate from the BullMQ connection, so the view endpoint can deduplicate views without touching the queue.

**Technical actions:**

1. Add `VIEW_DEDUP_WINDOW_SECONDS: Joi.number().integer().min(1).default(86400)` to `src/config/env.validation.ts`, add it to `.env.example`, and create `src/config/views.config.ts` — `registerAs('views', () => ({ dedupWindowSeconds }))` (per `phase-05-video-watch/TD-01` revision; inherited `phase-01-configuracao-base/TD-02`, `phase-01-configuracao-base/TD-03`)
2. Create `src/views/redis-client.provider.ts` — `REDIS_CLIENT` provider building `new Redis({ host, port })` (named `import { Redis } from 'ioredis'`) from the existing `queueConfig` `REDIS_HOST`/`REDIS_PORT` values; closed with `await redis.quit()` in `onModuleDestroy` (per `phase-05-video-watch/TD-01`; library-refs.md § ioredis)
3. Create `src/views/view-dedup.store.ts` — `ViewDedupStore.markFirstView(publicId, viewerKey): Promise<boolean>` running `SET views:{public_id}:{viewer_key} '1' EX <dedupWindowSeconds> NX` and returning `true` only on `'OK'` (per `### Data Model` → View dedup marker)
4. Create `src/views/views.module.ts` — `ViewsModule` importing `ConfigModule.forFeature(viewsConfig)` + `queueConfig`, providing and exporting `ViewDedupStore`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `envValidationSchema` | Unit: `VIEW_DEDUP_WINDOW_SECONDS` defaults to `86400`; `0` and non-integer values rejected | `src/config/env.validation.spec.ts` |
| `ViewDedupStore` | Integration (real Redis): first call → `true` with TTL ≤ window; repeat → `false`; different viewer key or video → `true` | `src/views/view-dedup.store.integration-spec.ts` |
| `ViewsModule` | Unit: compilation test resolves `ViewDedupStore` | `src/views/views.module.spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- Booting the API without `VIEW_DEDUP_WINDOW_SECONDS` uses a 24 h window; `VIEW_DEDUP_WINDOW_SECONDS=0` makes startup fail with a validation error
- The first `markFirstView` for a `(video, viewer)` pair creates `views:{public_id}:{viewer_key}` in Redis with a TTL equal to the window; a second call within the window leaves the key unchanged
- Shutting down the Nest application closes the dedup Redis connection (no open handle in Jest)

---

### SI-05.3 — VideoDetail with View Count and Channel Summary (GET /videos/:id)

**Route:** GET /videos/:id
**Test Specs:** see `nestjs-project/specs/videos-detail-summary.plan.md`
**Authorization:** Anonymous (optional auth) — read rule unchanged

**Description:** Let the watch page render its info block from one call by adding `view_count` and the channel summary to the shared `VideoDetail` shape.

**Technical actions:**

1. Update `src/videos/dto/video-detail.dto.ts` — add `view_count: number` and `channel: VideoChannelDto` (`nickname`, `name`) with `@ApiProperty` metadata, field names verbatim from `### API Contracts` → `GET /videos/:id` (per `phase-05-video-watch/TD-01` revision — AMB-2)
2. Update `VideosService.toVideoDetail(video)` in `src/videos/videos.service.ts` — map `video.view_count` and `{ nickname: video.channel.nickname, name: video.channel.name }`; every caller already loads `channel` through `VideoAccessService` (`findReadableOrFail`, `findOwnedOrFail`)
3. Update the `GET :id` Swagger description in `src/videos/videos.controller.ts` — mention `channel.nickname` as the value the frontend compares with the session `channelSlug` to show the download button (per `phase-05-video-watch/TD-03` Note)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `toVideoDetail` | Unit: maps `view_count` and `channel { nickname, name }`; never exposes `channel.id` or `user_id` | `src/videos/videos.service.spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- `GET /videos/:id` for a published video returns `200` with `view_count` (integer) and `channel: { nickname, name }` of the owning channel
- `PATCH /videos/:id`, `POST /videos/:id/publish` and `POST /videos/:id/unpublish` responses carry the same `view_count` and `channel` fields
- The `channel` object in the response contains only `nickname` and `name` (no internal ids)

---

### SI-05.4 — Endpoint POST /videos/:id/views (View Counting)

**Route:** POST /videos/:id/views
**Test Specs:** see `nestjs-project/specs/videos-views.plan.md`
**Authorization:** Anonymous (optional auth) — owner views not counted

**Description:** Count a view when the player starts playback, at most once per viewer per dedup window, never for the channel owner.

**Technical actions:**

1. Create `src/views/view-counting.service.ts` — `ViewCountingService.record(publicId, viewer: { userId?, ip, userAgent })`: resolves the video with `VideoAccessService.findReadableOrFail` (404 rule), throws `VideoNotReadyException` when `processing_status != ready`, returns without side effects when `video.channel.user_id === userId`, builds `viewer_key` (`user:{sub}` or `anon:{sha256(ip + '|' + user_agent)}`) and increments only when `ViewDedupStore.markFirstView` returns `true` (per `phase-05-video-watch/TD-01` + revisions; `### API Contracts` → `POST /videos/:id/views` Behavior)
2. Implement the increment as one atomic statement — `Repository<Video>.increment({ id: video.id }, 'view_count', 1)` (`UPDATE videos SET view_count = view_count + 1`), never read-modify-write (per `### Data Model` → Video; inherited `phase-04-channel-management/TD-08`)
3. Create `src/views/video-views.controller.ts` — `@Controller('videos')` with `POST :id/views`: `@Public()` + `@UseGuards(OptionalJwtAuthGuard)` + `@HttpCode(HttpStatus.NO_CONTENT)`, passing `user?.sub`, `@Ip()` (resolved under `trust proxy` = 1) and the `User-Agent` header (empty string when absent); Swagger `@ApiTags`/`@ApiOperation` + `@ApiResponse` 204/404/409 with `errorSchema` (inherited `openapi-docs-nestjs/TD-01` revision)
4. Wire modules one-way (no circular import): `VideosModule` adds `VideoAccessService` to `exports`; `ViewsModule` imports `VideosModule`, `AuthModule` (JwtService for the optional guard) and `TypeOrmModule.forFeature([Video])`, registers `ViewCountingService` + `VideoViewsController`; `ViewsModule` is registered in `AppModule`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `ViewCountingService` | Unit (mocked store + repo + access): owner skip; not-ready → `VIDEO_NOT_READY`; user key vs anonymous hash key; increment only on first view | `src/views/view-counting.service.spec.ts` |
| `ViewCountingService` | Integration (real DB + Redis): two calls by one viewer → `view_count` 1; two distinct anonymous viewers → 2; concurrent calls by distinct viewers lose no increment | `src/views/view-counting.service.integration-spec.ts` |

**Dependencies:** SI-05.1 — `req.ip` must be the client address; SI-05.2 — `ViewDedupStore`; SI-05.3 — `view_count` visible on `GET /videos/:id` for observation

**Acceptance criteria:**

- `POST /videos/:id/views` without a token on a published, ready video returns `204` and `GET /videos/:id` then shows `view_count` increased by 1
- A second `POST /videos/:id/views` with the same `X-Forwarded-For` and `User-Agent` within the window returns `204` and leaves `view_count` unchanged
- Two anonymous calls with different `X-Forwarded-For` values each increase `view_count` by 1
- An authenticated user's second call within the window does not increase `view_count`, even from a different IP
- `POST /videos/:id/views` with the owner's token returns `204` and leaves `view_count` unchanged
- `POST /videos/:id/views` on a draft without the owner's token returns `404` with `error: "VIDEO_NOT_FOUND"`; on a published video still `processing` returns `409` with `error: "VIDEO_NOT_READY"`

---

### SI-05.5 — Endpoint GET /videos/:id/suggestions (Same-category Sidebar)

**Route:** GET /videos/:id/suggestions
**Test Specs:** see `nestjs-project/specs/videos-suggestions.plan.md`
**Authorization:** Anonymous (optional auth) — 404 when the current video is not readable

**Description:** Return up to 12 sidebar suggestions — the most viewed public videos of the same category, topped up with recent videos from other categories — never exposing drafts or unlisted videos.

**Technical actions:**

1. Generate a TypeORM migration adding the composite index `(category_id, view_count, published_at)` on `videos` and declare it with `@Index` on `Video` (per `### Data Model` → Video; `phase-05-video-watch/TD-02` — "needs an index on `(category_id, view_count)`")
2. Add `VideoListingService.listSuggestions(current: Video): Promise<PublicVideoDto[]>` in `src/videos/video-listing.service.ts` — candidate filter (published + public + ready + `published_at IS NOT NULL` + `id != current`); same-category query ordered `view_count DESC, published_at DESC, public_id DESC` limited to `SUGGESTIONS_LIMIT = 12`; when short, a second query excluding the current category and already-picked ids ordered `published_at DESC, public_id DESC`; no category → the second query only; items mapped with the existing `toPublicVideo` (per `phase-05-video-watch/TD-02` + revision; `### API Contracts` → `GET /videos/:id/suggestions` Selection rule)
3. Create `src/videos/dto/video-suggestions.dto.ts` — `VideoSuggestionsDto { items: PublicVideoDto[] }` and update the `PublicVideoDto.view_count` Swagger description (no longer "Always 0 in Phase 04")
4. Add `GET :id/suggestions` to `src/videos/videos.controller.ts` — `@Public()` + `@UseGuards(OptionalJwtAuthGuard)`; resolves the current video with `VideoAccessService.findReadableOrFail(publicId, user?.sub)` (404 rule, per `phase-05-video-watch/TD-02` revision and inherited `phase-04-channel-management/TD-04`), returns `{ items }`; Swagger 200/404 with `errorSchema`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideoListingService.listSuggestions` | Integration (real DB): view-count ordering with recency tie-break; fill from other categories by recency; excludes current, drafts, unlisted and non-ready videos; no-category current → recent public videos; never more than 12 | `src/videos/video-listing.service.integration-spec.ts` |

**Dependencies:** SI-05.4 — view counts are the primary ordering key (testable with seeded counts, but the feature is meaningful once views are recorded)

**Acceptance criteria:**

- `GET /videos/:id/suggestions` for a published video returns `200` with `items` from the same category sorted by `view_count` descending, ties broken by the most recent `published_at`
- When the category has fewer than 12 other eligible videos, `items` is completed with the most recent public videos from other categories, up to 12 in total
- `items` never contains the current video, a draft, an unlisted video, or a video that is not `ready`
- For the owner's draft without a category, `GET /videos/:id/suggestions` with the owner's token returns the most recent public videos
- `GET /videos/:id/suggestions` for a draft without the owner's token returns `404` with `error: "VIDEO_NOT_FOUND"`
- With no other eligible video, the response is `200` with `items: []`

---

### SI-05.6 — Watch-page Access Verification (Anonymous, Unlisted, Owner-only Download)

**Route:** GET /videos/:id, GET /videos/:id/stream, GET /videos/:id/download
**Test Specs:** see `nestjs-project/specs/videos-watch-access.plan.md`
**Authorization:** per `### Authorization Matrix` — reads anonymous, download owner-only

**Description:** Verify on the watch-page routes the access rules this phase relies on without reopening them: anonymous viewing, unlisted by link only, and download kept owner-only.

**Technical actions:**

1. Keep `GET :id/download` owner-only and unchanged in behavior; extend its Swagger description to state that the watch page shows the download button only to the channel owner (per `phase-05-video-watch/TD-03` — Option A + Note; inherited `phase-03-videos/TD-08` revision 2026-11-03)
2. Confirm no read route added in this phase (`POST :id/views`, `GET :id/suggestions`) bypasses `VideoAccessService.findReadableOrFail`, and no listing returns unlisted videos — fix any gap found (per inherited `phase-04-channel-management/TD-04` + revision)

**Tests:** _(empty — no new unit or integration artifact; the access scenarios are verified by the E2E spec authored by /plan-test-specs)_

**Dependencies:** SI-05.3, SI-05.4, SI-05.5 — the watch-page routes under verification

**Acceptance criteria:**

- `GET /videos/:id` and `GET /videos/:id/stream` for a published, ready video return `200` without any token
- A published `unlisted` video is readable by its id without a token but never appears in `GET /videos/:id/suggestions` or `GET /channels/:nickname/videos`
- `GET /videos/:id/download` without a token returns `401`, with a non-owner's token returns `403` with `error: "VIDEO_ACCESS_DENIED"`, and with the owner's token returns `200` with a presigned URL

---

### SI-05.7 — OpenAPI Contract Export and HTTP Examples for the Watch Page

**Description:** Publish this phase's contract changes in the committed OpenAPI document that the `phase-05-video-watch-frontend` slice will consume, and document the watch-page flow for manual testing.

**Technical actions:**

1. Run `npm run openapi:export` and commit the regenerated `nestjs-project/openapi.json` with `POST /videos/{id}/views`, `GET /videos/{id}/suggestions` and the extended `VideoDetail` schema (inherited `openapi-docs-nestjs/TD-01`, `openapi-docs-nestjs/TD-02`, `next-frontend-openapi-typing/TD-02`)
2. Extend `test/swagger.e2e-spec.ts` — assert the document lists `/videos/{id}/views` (POST) and `/videos/{id}/suggestions` (GET) without bearer security, and that `VideoDetail` has `view_count` and `channel`
3. Add to `nestjs-project/api.http` — get video → record view (with `X-Forwarded-For` / `User-Agent`) → repeat view (deduplicated) → suggestions → owner download

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Swagger document | E2E: Phase 05 paths, security and `VideoDetail` fields present | `test/swagger.e2e-spec.ts` |

**Dependencies:** SI-05.3, SI-05.4, SI-05.5, SI-05.6 — all Phase 05 contract changes implemented

**Acceptance criteria:**

- `nestjs-project/openapi.json` contains `POST /videos/{id}/views` (204/404/409) and `GET /videos/{id}/suggestions` (200/404) with snake_case schemas matching `### API Contracts`
- Running `npm run openapi:export` again produces no diff
- `GET /api/docs-json` shows `VideoDetail` with `view_count` and `channel { nickname, name }`

---

## Technical Specifications

### Data Model

#### Video (modified — index only)

No new columns. `view_count` (integer, default 0) exists since Phase 04 (phase-04-channel-management/TD-08); this phase is the first writer, through a single atomic `UPDATE videos SET view_count = view_count + 1 WHERE id = :id` *(per phase-05-video-watch/TD-01)*.

| Field | Type | Constraints |
|-------|------|-------------|
| view_count | integer | not null, default 0 — incremented only by the view-counting path |

**Relations:** unchanged (`Video` many-to-one `Channel`, many-to-one `Category`).
**Indexes:** new composite index on `(category_id, view_count, published_at)` backing the suggestions ordering *(per phase-05-video-watch/TD-02 — "needs an index on `(category_id, view_count)`")*; created by a new TypeORM migration and declared with `@Index` on the entity.

#### View dedup marker (Redis, not a table)

| Key | Value | TTL |
|-----|-------|-----|
| `views:{public_id}:{viewer_key}` | `'1'` | `VIEW_DEDUP_WINDOW_SECONDS` (default `86400`) |

- `viewer_key` = `user:{sub}` when the caller is authenticated; otherwise `anon:{sha256(ip + '|' + user_agent)}` hex digest, where `ip` is `req.ip` under `trust proxy` = 1 and `user_agent` is the `User-Agent` header (empty string when absent) *(per phase-05-video-watch/TD-01 revisions)*.
- Written with `SET key '1' EX <window> NX`; a reply of `'OK'` means first view in the window (increment), `null` means repeat (no increment) — see library-refs.md § ioredis.

#### Environment keys

| Key | Joi rule | Purpose |
|-----|----------|---------|
| VIEW_DEDUP_WINDOW_SECONDS | `Joi.number().integer().min(1).default(86400)` | Dedup window of the view marker *(per phase-05-video-watch/TD-01 revision)* |

`REDIS_HOST` / `REDIS_PORT` are reused (already validated); no new Redis keys.

### API Contracts

All routes live under the `/videos` path — `POST /videos/:id/views` in a new `VideoViewsController` (`ViewsModule`), the others in the existing `VideosController`; `:id` is the 11-char `public_id`. Wire fields are snake_case (phase-03-videos/TD-09 revision). Errors use the `{ statusCode, error, message }` envelope (phase-02-auth/TD-07).

#### GET /videos/:id (SI-05.3)

Existing route (`@Public()` + `OptionalJwtAuthGuard`); read rule unchanged (phase-04-channel-management/TD-04). The shared `VideoDetail` shape gains two fields *(per phase-05-video-watch/TD-01 revision — AMB-2)*; every endpoint that already returns `VideoDetail` (`PATCH /videos/:id`, `POST /videos/:id/publish`, `POST /videos/:id/unpublish`) returns them too.

**Request headers:**
- Authorization: Bearer {access_token}, optional — identifies the owner; missing/invalid/expired → anonymous

**Response 200:** `VideoDetail` — existing fields plus:
- view_count: integer — current `videos.view_count`
- channel: object
  - nickname: string — the channel handle (frontend compares it with the session `channelSlug` to decide whether to show the download button — per phase-05-video-watch/TD-03 Note)
  - name: string — channel display name

**Error responses:**
- 404 VIDEO_NOT_FOUND: unknown id, malformed id, or a draft read by a non-owner

---

#### POST /videos/:id/views (SI-05.4)

Records one view when playback starts *(per phase-05-video-watch/TD-01 — Option B)*. `@Public()` + `OptionalJwtAuthGuard`; not throttled.

**Request headers:**
- Authorization: Bearer {access_token}, optional
- User-Agent: forwarded by the BFF; part of the anonymous viewer key
- X-Forwarded-For: appended by the BFF; `req.ip` resolves to its last entry (`trust proxy` = 1)

**Request body:** none.

**Response 204:** No content. Returned whether the view was counted, deduplicated inside the window, or skipped because the caller owns the video.

**Behavior:**
1. Resolve the video with the read rule (same as `GET /videos/:id`) — not readable → 404.
2. `processing_status != ready` → 409 (a view cannot start before the video is playable).
3. Caller is the channel owner → 204 without touching Redis or the counter.
4. `SET views:{public_id}:{viewer_key} '1' EX VIEW_DEDUP_WINDOW_SECONDS NX` → `'OK'`: atomic increment of `view_count`; `null`: no increment.

**Error responses:**
- 404 VIDEO_NOT_FOUND: unknown id, malformed id, or a draft for a non-owner
- 409 VIDEO_NOT_READY: the video is not `ready`

---

#### GET /videos/:id/suggestions (SI-05.5)

Fixed-size sidebar list, no pagination *(per phase-05-video-watch/TD-02 — Option B + revision)*. `@Public()` + `OptionalJwtAuthGuard`.

**Request headers:**
- Authorization: Bearer {access_token}, optional — only affects whether a draft current video is readable

**Response 200:**
- items: PublicVideoDto[] — at most 12 (code constant), each `{ public_id, title, thumbnail_url, duration_seconds, published_at, view_count }` (the existing public listing card shape)

**Selection rule:**
- Candidates: `publication_status = published` AND `visibility = public` AND `processing_status = ready` AND `published_at IS NOT NULL` AND `id != current` — never drafts or unlisted (phase-04-channel-management/TD-04 revision).
- Current video has a category: first the same category ordered `view_count DESC, published_at DESC, public_id DESC`; when fewer than 12, fill with candidates from other categories ordered `published_at DESC, public_id DESC` (the TD-02 fill rule — most recent from other categories).
- Current video has no category (owner's own draft only): candidates from any category ordered `published_at DESC, public_id DESC`.
- Empty list is valid (`{ items: [] }`).

**Error responses:**
- 404 VIDEO_NOT_FOUND: the caller cannot read the current video (unknown, malformed, or draft for a non-owner)

---

#### GET /videos/:id/download (SI-05.6 — verification only)

Unchanged: owner-only, 401/403/404/409 as in Phase 03 *(per phase-05-video-watch/TD-03 — Option A; phase-03-videos/TD-08 revision 2026-11-03 stays in force)*.

---

#### Bootstrap — proxy trust (SI-05.1)

`app.set('trust proxy', 1)` on the Express instance in `main.ts` and in every e2e app factory that reproduces `main.ts` *(per phase-05-video-watch/TD-01 revision — ICC-1)*. Effect: `req.ip` = last `X-Forwarded-For` entry; the same value keys the anonymous viewer hash and the per-IP `ThrottlerGuard` of `AuthModule` (phase-02-auth/TD-08). The API must be reachable only through the BFF in deployment; the published dev port 3000 is an accepted exception.

### Authorization Matrix

| Endpoint | Anonymous | Authenticated | Owner |
|----------|-----------|---------------|-------|
| GET /videos/:id (published public/unlisted) | ✓ | ✓ | ✓ |
| GET /videos/:id (draft) | ✗ (404) | ✗ (404) | ✓ |
| POST /videos/:id/views (published) | ✓ counted | ✓ counted | ✓ 204, not counted |
| POST /videos/:id/views (draft) | ✗ (404) | ✗ (404) | ✓ 204, not counted |
| GET /videos/:id/suggestions (published current) | ✓ | ✓ | ✓ |
| GET /videos/:id/suggestions (draft current) | ✗ (404) | ✗ (404) | ✓ |
| GET /videos/:id/stream | ✓ published | ✓ published | ✓ |
| GET /videos/:id/download | ✗ (401) | ✗ (403) | ✓ |

### Error Catalog

No new error codes; this phase reuses existing domain exceptions from `src/common/exceptions/domain.exception.ts` (envelope per phase-02-auth/TD-07).

| errorCode | HTTP | Trigger |
|-----------|------|---------|
| VIDEO_NOT_FOUND | 404 | `GET /videos/:id`, `POST /videos/:id/views`, `GET /videos/:id/suggestions` on an unknown/malformed id or a draft read by a non-owner |
| VIDEO_NOT_READY | 409 | `POST /videos/:id/views` on a video whose `processing_status` is not `ready` |
| VIDEO_ACCESS_DENIED | 403 | `GET /videos/:id/download` by an authenticated non-owner (unchanged) |

---

## Dependency Map

SI-05.1 (root)
└── SI-05.4 — depends on SI-05.1 (anonymous viewer key needs the client IP), SI-05.2, SI-05.3
    └── SI-05.5 — depends on SI-05.4 (view counts drive the suggestion ordering)
        └── SI-05.6 — depends on SI-05.3, SI-05.4, SI-05.5 (verifies the watch-page routes)
            └── SI-05.7 — depends on SI-05.3, SI-05.4, SI-05.5, SI-05.6 (exports the final contract)
SI-05.2 (root, independent) — dedup store and window config, consumed by SI-05.4
SI-05.3 (root, independent) — VideoDetail fields, consumed by SI-05.4, SI-05.6, SI-05.7

---

## Deliverables

- [ ] SI-05.1 — Proxy Trust at Bootstrap (Client IP Behind the BFF)
- [ ] SI-05.2 — Infra: View Dedup Store on Redis and Dedup Window Config
- [ ] SI-05.3 — VideoDetail with View Count and Channel Summary (GET /videos/:id)
- [ ] SI-05.4 — Endpoint POST /videos/:id/views (View Counting)
- [ ] SI-05.5 — Endpoint GET /videos/:id/suggestions (Same-category Sidebar)
- [ ] SI-05.6 — Watch-page Access Verification (Anonymous, Unlisted, Owner-only Download)
- [ ] SI-05.7 — OpenAPI Contract Export and HTTP Examples for the Watch Page

**Full test suites:**

- [ ] Backend unit + integration tests pass (`docker compose exec nestjs-api npm test -- --runInBand`)
- [ ] E2E tests pass (`docker compose exec nestjs-api npm run test:e2e -- --runInBand`)
- [ ] Type check passes (`docker compose exec nestjs-api npx tsc --noEmit`)
- [ ] Lint passes (`docker compose exec nestjs-api npm run lint`)
- [ ] Project builds successfully, including the worker entrypoint (`docker compose exec nestjs-api npm run build` → `dist/main.js` and `dist/worker.js`)
