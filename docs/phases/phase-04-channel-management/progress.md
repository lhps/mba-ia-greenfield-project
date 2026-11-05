# phase-04-channel-management — Progress

**Status:** completed
**SIs:** 11/11 completed

### SI-04.1 — Category Catalog and GET /categories
- **Status:** completed
- **Tests:** 10 passing (category.entity + categories.service integration, categories.module, migrations.integration-spec, test/categories-list.e2e-spec.ts)
- **Observations:**
  - `Category` also has `updated_at` (`@UpdateDateColumn`) — required by `.claude/rules/nestjs-entities.md`; the plan's Data Model listed only `created_at`. Not exposed on the wire.
  - `Category` is not yet added to the test `ALL_ENTITIES` lists: it has no relation until SI-04.2 adds `Video.category`, which is when those lists need it.
  - `migrations.integration-spec.ts` now reverts `CreateCategories` (the latest migration) instead of `CreateVideos`, and asserts the 10-row seed. Migration applied to the dev DB with `npm run migration:run`.

### SI-04.2 — Video and Channel Schema for Management, Draft Title Default
- **Status:** completed
- **Tests:** 40 passing in the SI's 5 files + `test/videos-create.e2e-spec.ts` 5 passing; regression check: full unit/integration 250/250, full e2e 80/80
- **Observations:**
  - Migration `1793794482102-AddVideoChannelManagement` adds `title` nullable → backfill (`file_name` minus last extension, whole name when empty, ≤100) → `SET NOT NULL`; applied to the dev DB.
  - The migration's `down()` demotes `published` rows to `draft` before restoring the Phase 03 enum (otherwise the cast fails) — published state is lost on rollback.
  - `migrations.integration-spec.ts` backfill test depends on running right after the revert test (documented in the file).
  - Adding `Category` to `Video`'s relations required `Category` in every test entity list (11 `ALL_ENTITIES` + 3 inline lists in video-upload/processing/reconciliation specs + the 3 SI-04.1 category specs) and in `WorkerModule`'s `TypeOrmModule.forFeature`.
  - Non-null `title` required adding it to raw video seeds in the two processing integration specs and in the e2e helper `seedVideo`.

### SI-04.3 — Public Thumbnail Delivery (Public-read Prefix, Versioned Keys)
- **Status:** completed
- **Tests:** 22 passing (SI files + videos.service.spec); regression: full unit/integration 261/261, full e2e 82/82
- **Observations:**
  - SeaweedFS already runs with S3 identities, so anonymous reads were denied everywhere before the policy; after `PutBucketPolicy` on `thumbnails/*`, thumbnails return 200 and `videos/` stays 403. No infra change. Bootstrap re-run twice on `streamtube-videos` and `streamtube-videos-test` (idempotent).
  - Environment limit (pre-existing, out of scope): the single SeaweedFS data node is full (8/8 volumes) and each bucket is its own collection, so a new bucket cannot store objects ("No writable volumes"). Tests use the shared `${S3_BUCKET}-test` bucket. Raising `-volume.max` in Compose is a possible separate task.
  - The worker now also deletes the previous thumbnail object after re-pointing `thumbnail_key` (and deletes the just-uploaded object if the row update fails).
  - The processor test that asserted `thumbnail_key === STORAGE_KEYS.thumbnail(id)` now asserts the versioned key pattern + object existence (keys are random per write). Added two `test/videos-get.e2e-spec.ts` scenarios: public unsigned URL for versioned keys, presigned URL for legacy keys.
  - Known race for SI-04.7: the worker checks `has_custom_thumbnail` on the row read at job start; a custom upload landing mid-processing could be overwritten. SI-04.7 should guard (e.g., update `thumbnail_key` only where `has_custom_thumbnail = false`).

### SI-04.4 — Read Access by Publication State (GET /videos/:id, /stream)
- **Status:** completed
- **Tests:** 26 unit (guard, video-access, videos.service) + 16 e2e (new `test/videos-read-access.e2e-spec.ts` 5 + updated Phase 03 get/stream); regression: full unit/integration 277/277, full e2e 87/87
- **Observations:**
  - `toVideoDetail` is an async method on `VideosService` (needs the async `ThumbnailUrlResolver`), not a function in the DTO file; reused by SI-04.5/04.6.
  - `OptionalJwtAuthGuard` gets `JwtService` by importing `AuthModule` into `VideosModule` (no cycle; the worker does not import `VideosModule`).
  - Phase 03 e2e `videos-get` / `videos-stream-download` and their specs (`specs/videos-get.plan.md`, `specs/videos-stream-download.plan.md`) now seed published videos for anonymous reads; only the `publication_status` expectation changed (`draft` → `published`). Their `Last sync` was re-stamped.
  - Removed the now-unused `src/videos/dto/video-response.dto.ts` (replaced by `VideoDetailDto`).
  - Pre-existing gap (out of scope): `specs/videos-get.plan.md` does not describe the two thumbnail scenarios added to `videos-get.e2e-spec.ts` in SI-04.3.

### SI-04.5 — Endpoint PATCH /videos/:id (Edit Video Information)
- **Status:** completed
- **Tests:** 16 unit/integration (video-management.service spec 10 + integration 5, video-access.service +1) + 6 e2e (`test/videos-update.e2e-spec.ts`); regression: full unit/integration 293/293, full e2e 93/93
- **Observations:**
  - The "at least one field" rule (`VALIDATION_ERROR`) lives on a hidden carrier property `atLeastOneField?: never` (`@ApiHideProperty()`), because class-validator has no class-level decorators.
  - `VideoAccessService.findOwnedOrFail` gained an optional `relations` argument (merged with `channel`), so a partial edit returns the current category; existing callers are unchanged. Not listed in the plan.
  - New exceptions live in `src/common/exceptions/domain.exception.ts`; `VIDEO_DESCRIPTION_MAX_LENGTH` and `UPDATABLE_VIDEO_FIELDS` were added to `videos.constants.ts`. `VIDEO_TITLE_MAX_LENGTH` stays in `video-title.util.ts`.
  - `test/swagger.e2e-spec.ts` does not list `PATCH /videos/{id}` yet; deferred to SI-04.11.

### SI-04.6 — Endpoints POST /videos/:id/publish and /unpublish (Draft → Publication Flow)
- **Status:** completed
- **Tests:** 10 unit/integration (video-management.service spec 8 + integration 2) + 6 e2e (`test/videos-publish.e2e-spec.ts`); regression: full unit/integration 303/303, full e2e 99/99
- **Observations:**
  - Publish/unpublish live in `VideoManagementService`; already-published publish and draft unpublish return unchanged without saving; `published_at` is set only when null.
  - The e2e asserts "stays draft" after the 409 by reading back with owner `GET /videos/:id` (no direct DB query).
  - Reused `VideoNotReadyException` (per Error Catalog) — its message "Video is not ready for playback" reads oddly on publish; wording change is out of scope.

### SI-04.7 — Endpoint PUT /videos/:id/thumbnail (Custom Thumbnail)
- **Status:** completed
- **Tests:** 49 in SI suites (media, thumbnail service unit/integration, filter, processing) + 5 e2e (`test/videos-thumbnail.e2e-spec.ts`); regression: full unit/integration 323/323, full e2e 104/104
- **Observations:**
  - Response is `{ thumbnail_url }` per the plan's API contract (not `VideoDetail`).
  - Multer's size-limit error arrives as `PayloadTooLargeException`; a route-scoped `ThumbnailTooLargeFilter` maps it to the 413 `THUMBNAIL_TOO_LARGE` envelope (no try/catch in the controller).
  - `normalizeThumbnail` adds `-xerror -err_detect explode`, since a truncated JPEG otherwise decodes with exit 0.
  - Worker race fixed: the worker writes `thumbnail_key` with `WHERE has_custom_thumbnail = false`; on 0 rows it saves the metadata only and deletes its own auto object. `VideoThumbnailService` swaps the key in a transaction with a `pessimistic_write` lock and deletes the key it actually replaced. Covered by a new processor integration test.
  - A local `UploadedImage { buffer; size }` type is used instead of adding `@types/multer`.
  - The e2e bootstraps the test bucket policy in `beforeAll` and rewrites `S3_PUBLIC_ENDPOINT` → `S3_ENDPOINT` for anonymous GETs from inside the container.
  - Out of scope:
    - Decompression bombs: a ≤2 MB PNG declaring huge dimensions is bounded only by the ffmpeg timeout. An ffprobe pixel check would be a separate hardening task.
    - A wrong multipart field name returns 400 `VALIDATION_ERROR`, not `INVALID_THUMBNAIL`.
    - The e2e leaves thumbnail objects in the test bucket.

### SI-04.8 — Endpoint GET /channels/me/videos (Video Management Panel)
- **Status:** completed
- **Tests:** 3 integration (`video-listing.service.integration-spec.ts`) + 4 e2e (`test/channels-me-videos.e2e-spec.ts`); regression: full unit/integration 326/326, full e2e 108/108
- **Observations:**
  - Offset paging (`page` ≥1 default 1, `per_page` 1–50 default 20, bounds in `PANEL_PAGINATION`); order `created_at DESC, public_id DESC`; response `{ items, page, per_page, total }`.
  - `ChannelVideosController` (`@Controller('channels')`, `@Get('me/videos')`) lives in `VideosModule`; SI-04.10 must register `:nickname` handlers after the `me` routes (a comment on the controller records this). `me` is also a reserved nickname.
  - A user with no channel makes `listOwn` throw a plain `Error` (500), mirroring `VideoUploadService.initiate`. This breaks the DomainException-only rule in both places. A shared `ChannelsService.findByUserIdOrFail` with a domain exception is a separate follow-up task.

### SI-04.9 — Endpoints GET/PATCH /channels/me (Channel Profile Edit, Nickname Rules)
- **Status:** completed
- **Tests:** 61 in `src/channels` + `src/users` (9 new unit for `updateProfile`, new integration cases in channels/users services, nickname util cases) + 5 e2e (`test/channels-me.e2e-spec.ts`); regression: full unit/integration 348/348, full e2e 113/113
- **Observations:**
  - `nickname.util.spec.ts`: 3 existing length assertions changed (46 → 30; suffix base 46 → 26) per the TD-11 / phase-02 TD-10 revisions. New cases cover padding, the reserved → `user_<8hex>` fallback and the 3–30 bound.
  - No migration: nicknames are always lowercase (the DTO lowercases them), so the existing unique index is effectively case-insensitive.
  - Short generated prefixes are padded with `_<3hex>` (e.g. `ab` → `ab_xxx`).
  - `ChannelNotFoundException` (404 `CHANNEL_NOT_FOUND`) was added now for the no-channel case; SI-04.10 reuses it.
  - Grandfathering edge: a legacy out-of-rule handle survives edits to name/description. But PATCH resending that same handle gets 400 from the DTO pattern before the service's "same nickname = no-op" check. The frontend must send only changed fields (or the DTO must relax); open item.
  - The cooldown 409 message hardcodes "14 days" to match the Error Catalog text.

### SI-04.10 — Endpoints GET /channels/:nickname and /channels/:nickname/videos (Public Channel Page)
- **Status:** completed
- **Tests:** 23 unit/integration (cursor util 14, channels.service 3, video-listing integration 6) + 5 e2e (`test/channels-public.e2e-spec.ts`); regression: full unit/integration 371/371, full e2e 118/118
- **Observations:**
  - Cursor = base64url of `published_at|public_id` with microsecond precision (read via `to_char(... 'US')`); millisecond truncation could skip or repeat rows. Keyset uses the tuple comparison `(published_at, public_id) < (...)`, fetching `limit + 1` rows. A malformed cursor gives 400 `VALIDATION_ERROR` via a new `InvalidPaginationCursorException`, checked before the channel lookup.
  - The list query also guards `published_at IS NOT NULL` and `processing ready`, besides `published` + `public` (unlisted excluded per the TD-04 revision).
  - Route ordering: each `me` / `:nickname` pair lives in the same controller with `me` declared first. The e2e forces a channel nicknamed `me` in the DB and proves `/channels/me` and `/channels/me/videos` still reach the owner's routes.
  - Public list limit default 24, max 50 (`PUBLIC_LISTING_PAGINATION`).

### SI-04.11 — OpenAPI Contract Export and HTTP Examples for Video and Channel Management
- **Status:** completed
- **Tests:** 2 new swagger e2e tests (Phase 04 operations + auth flags table; multipart thumbnail body). Final verification: full unit/integration 371/371, full e2e 120/120, tsc 0, lint clean, build → `dist/main.js` + `dist/worker.js`
- **Observations:**
  - `openapi:export` ran under ts-node, which never applies the `@nestjs/swagger` CLI plugin, so request/query DTOs were exported empty (already true for Phase 02/03 DTOs). Changed to `nest build && node dist/openapi-export`; the regenerated `openapi.json` now has full request bodies for all phases. It is byte-identical on re-run.
  - Added a bare `@ApiPropertyOptional()` on the defaulted `page`/`per_page`/`limit` query fields (the plugin marked them required).
  - `api.http` gained the Phase 04 section (steps 16–26), including the cursor follow-up via `next_cursor`.
  - Out of scope:
    - Swagger e2e and `openapi-export.integration-spec.ts` build without the plugin under ts-jest, so DTO schemas can't be asserted there yet.
    - Integer fields export as `number`.
    - The nickname pattern appears only in the field description.
    - The export now runs `nest build` first, which is slower.
