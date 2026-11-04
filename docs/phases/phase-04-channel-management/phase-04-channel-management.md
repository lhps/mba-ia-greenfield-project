---
kind: phase
name: phase-04-channel-management
test_specs_aware: true
sources_mtime:
  docs/phases/phase-04-channel-management/context.md: "2026-11-04T00:14:37-03:00"
  docs/decisions/technical-decisions-phase-04-channel-management.md: "2026-11-04T00:14:19-03:00"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-next-frontend-openapi-typing.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-next-frontend-config-base.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-next-frontend-msw-foundation.md: "2026-10-21T16:43:34-03:00"
---

# Phase 04 — Gerenciamento de Vídeos e Canal (backend slice)

## Objective

Deliver the `nestjs-project` API for video and channel management — video categories, editing of title, description, category and custom thumbnail, public/unlisted visibility, the draft → publication flow, the owner's video management panel (thumbnail, title, views, likes, comments, publication time and status) with editing from the panel, channel editing (nickname, name, description) and the public channel page with its video listing — so the deliverables "edição completa de vídeos, rascunho/publicação, painel de gerenciamento, edição de canal, página pública do canal" are available to the frontend slice.

---

## Step Implementations

### SI-04.1 — Category Catalog and GET /categories

**Route:** GET /categories
**Test Specs:** see `nestjs-project/specs/categories-list.plan.md`
**Authorization:** Anonymous

**Description:** Introduce the platform's fixed category catalog as seeded reference data and expose it publicly, so videos can be categorized and Phase 05 can filter suggestions by category.

**Technical actions:**

1. Create `src/categories/entities/category.entity.ts` — columns of `### Data Model → Category` verbatim (`id`, `slug` unique, `name`, `created_at`) (per `phase-04-channel-management/TD-01`)
2. Generate migration `CreateCategories` via the TypeORM CLI and add the data seed for the 10 categories listed in `### Data Model → Category → Seed` (`musica` … `outros`); `down` drops the table (per `phase-04-channel-management/TD-01` revision 2026-11-04)
3. Create `src/categories/categories.service.ts` — `findAll()` ordered by `name`, `findBySlug(slug)` returning `Category | null` (used by SI-04.5)
4. Create `src/categories/categories.controller.ts` with `@Public() @Get()` + `src/categories/dto/category-response.dto.ts` (`slug`, `name`) and the `items` list DTO, with `@ApiProperty`/`@ApiOkResponse` metadata
5. Create `src/categories/categories.module.ts` (TypeORM feature `Category`, exports `CategoriesService`) and register it in `AppModule`; add `Category` to the test data source entity lists that enumerate all entities

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `Category` | Integration: unique `slug` constraint | `src/categories/entities/category.entity.integration-spec.ts` |
| `CategoriesService` | Integration: seeded rows returned ordered by `name`; `findBySlug` hit/miss | `src/categories/categories.service.integration-spec.ts` |
| `CategoriesModule` | Unit: module compilation | `src/categories/categories.module.spec.ts` |
| `CreateCategories` migration | Integration: up seeds 10 rows, down removes the table | `src/database/migrations.integration-spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- `GET /categories` without a token returns `200` with 10 items `{ slug, name }` ordered by `name`
- The response never contains the internal category `id`
- Inserting a second category with an existing `slug` fails with a unique-constraint violation
- Reverting the migration removes the `categories` table and its rows

---

### SI-04.2 — Video and Channel Schema for Management, Draft Title Default

**Description:** Extend the `Video` and `Channel` schemas with the Phase 04 columns (metadata, category, publication/visibility, counters, custom-thumbnail flag, nickname cooldown) and give every new draft a title derived from its file name.

**Technical actions:**

1. Update `src/videos/entities/video.entity.ts` and `src/videos/videos.constants.ts` — columns of `### Data Model → Video (modified)` verbatim (`title`, `description`, `category_id` + `@ManyToOne(() => Category)` nullable `ON DELETE RESTRICT`, `publication_status` adds `PUBLISHED: 'published'`, new `VISIBILITY` constant + `visibility` enum default `'public'`, `published_at`, `has_custom_thumbnail`, `view_count`, `like_count`, `comment_count`); add the inverse `Category.videos` `@OneToMany` (per `phase-04-channel-management/TD-02`, `TD-03`, `TD-08`)
2. Update `src/channels/entities/channel.entity.ts` — `nickname_changed_at` timestamptz nullable (per `phase-04-channel-management/TD-11`)
3. Generate migration `AddVideoChannelManagement` via the TypeORM CLI — add enum value `'published'`, create `videos_visibility_enum`, add columns, FK and indexes `(category_id)`, `(channel_id, created_at)`, `(channel_id, published_at, public_id)`; backfill `title` for existing rows from `file_name` with the extension stripped, truncated to 100 (whole `file_name` when stripping leaves it empty), then set `NOT NULL`
4. Create `src/videos/video-title.util.ts` — `deriveTitleFromFileName(fileName)` with the same rule as the backfill; call it in `VideoUploadService` when the draft row is created by `POST /videos` (request contract unchanged) (per `phase-04-channel-management/TD-02`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `Video` | Integration: defaults (`visibility` public, counters 0, `has_custom_thumbnail` false), `'published'` accepted, `category_id` FK restrict | `src/videos/entities/video.entity.integration-spec.ts` |
| `Channel` | Integration: `nickname_changed_at` nullable default | `src/channels/entities/channel.entity.integration-spec.ts` |
| `deriveTitleFromFileName` | Unit: extension stripping, dotfile/no-extension, 100-char truncation | `src/videos/video-title.util.spec.ts` |
| `VideoUploadService` | Unit: draft created with the derived `title` | `src/videos/video-upload.service.spec.ts` |
| `AddVideoChannelManagement` migration | Integration: backfill of `title` on existing rows; down restores the Phase 03 schema | `src/database/migrations.integration-spec.ts` |

**Dependencies:** SI-04.1 — `Category` entity for the FK

**Acceptance criteria:**

- `POST /videos` with `file_name: "Minha viagem.mp4"` creates a draft whose `title` is `"Minha viagem"`
- After the migration, every pre-existing video has a non-null `title` derived from its `file_name`
- A new video row defaults to `visibility = 'public'`, `view_count = like_count = comment_count = 0` and `has_custom_thumbnail = false`
- Deleting a category referenced by a video fails (FK `RESTRICT`)

---

### SI-04.3 — Public Thumbnail Delivery (Public-read Prefix, Versioned Keys)

**Description:** Serve thumbnails from a public-read `thumbnails/` prefix with versioned keys so listings get stable, cacheable URLs, while video objects stay private.

**Technical actions:**

1. Extend `src/storage/bucket-bootstrap.ts` — idempotent `PutBucketPolicy` granting anonymous `s3:GetObject` on `arn:aws:s3:::{S3_BUCKET}/thumbnails/*` only (SeaweedFS 4.51 bucket policies, per `phase-04-channel-management/TD-07` and `phase-03-videos/TD-12`)
2. Change `STORAGE_KEYS.thumbnail` in `src/videos/videos.constants.ts` to `thumbnails/{id}/{version}.jpg` with a crypto-random `version` per write; add `StorageService.publicObjectUrl(key)` → `{S3_PUBLIC_ENDPOINT}/{S3_BUCKET}/{key}`
3. Create `src/videos/thumbnail-url.resolver.ts` — `resolve(thumbnailKey)` returns the public URL for keys under `thumbnails/`, a presigned GET for legacy Phase 03 keys, `null` when absent (per `### API Contracts` preamble); use it in `VideosService` instead of the direct presign
4. Update `src/videos/processing/video-processing.service.ts` — upload the auto-generated frame to the new versioned key and set `thumbnail_key` only when `has_custom_thumbnail` is `false` (never overwrite a custom thumbnail)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `bootstrapBuckets` | Integration: anonymous GET of a `thumbnails/` object returns 200, of a `videos/` object is denied; rerun is idempotent | `src/storage/bucket-bootstrap.integration-spec.ts` |
| `ThumbnailUrlResolver` | Unit: public URL for `thumbnails/` keys, presign for legacy keys, `null` | `src/videos/thumbnail-url.resolver.spec.ts` |
| `VideoProcessingService` | Integration: auto thumbnail stored under `thumbnails/{id}/…jpg`; custom thumbnail kept when `has_custom_thumbnail` is true | `src/videos/processing/video-processing.processor.integration-spec.ts` |

**Dependencies:** SI-04.2 — `has_custom_thumbnail` column

**Acceptance criteria:**

- After processing a new upload, `GET /videos/:id` returns a `thumbnail_url` of the form `{S3_PUBLIC_ENDPOINT}/{S3_BUCKET}/thumbnails/…jpg`
- An anonymous GET of that `thumbnail_url` returns `200 image/jpeg`; an anonymous GET of the video's `videos/{id}/video.mp4` object is denied
- A video processed before this phase still returns a working (presigned) `thumbnail_url`
- Reprocessing a video with `has_custom_thumbnail = true` leaves its `thumbnail_key` unchanged

---

### SI-04.4 — Read Access by Publication State (GET /videos/:id, /stream)

**Route:** GET /videos/:id, GET /videos/:id/stream
**Test Specs:** see `nestjs-project/specs/videos-read-access.plan.md`
**Authorization:** Anonymous (optional auth) — drafts owner-only

**Description:** Make drafts private and return the full `VideoDetail` shape: published videos (public or unlisted) stay readable by link, drafts only by their owner.

**Technical actions:**

1. Create `src/auth/guards/optional-jwt-auth.guard.ts` — on `@Public()` routes, verifies a bearer token when present and sets the request user; a missing or invalid token leaves the request anonymous (no 401) (per `phase-04-channel-management/TD-04`, `phase-02-auth/TD-02`)
2. Add `VideoAccessService.findReadableOrFail(publicId, userId?)` — `VideoNotFoundException` when the video is `draft` and `userId` is not the owner (per `phase-04-channel-management/TD-04` + revision)
3. Create `src/videos/dto/video-detail.dto.ts` — `VideoDetail` fields verbatim from `### API Contracts` (category as `{ slug, name } | null`, `thumbnail_url` via `ThumbnailUrlResolver`) and a `toVideoDetail(video)` mapper reused by SI-04.5/04.6
4. Update `VideosController` `GET :id` and `GET :id/stream` to use the optional guard + `findReadableOrFail`; `GET :id` returns `VideoDetail` (category relation loaded); Swagger 200/404 (and 409 for stream) updated

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `OptionalJwtAuthGuard` | Unit: valid token sets user; missing/invalid/expired token stays anonymous | `src/auth/guards/optional-jwt-auth.guard.spec.ts` |
| `VideoAccessService.findReadableOrFail` | Unit: published readable by anyone; draft readable by owner; draft by non-owner/anonymous → `VIDEO_NOT_FOUND` | `src/videos/video-access.service.spec.ts` |
| `toVideoDetail` | Unit: entity → `VideoDetail` mapping, internal fields omitted | `src/videos/videos.service.spec.ts` |

**Dependencies:** SI-04.2 — new columns; SI-04.3 — `ThumbnailUrlResolver`

**Acceptance criteria:**

- `GET /videos/:id` for a `draft` video without a token, or with another user's token, returns `404` with `error: "VIDEO_NOT_FOUND"`
- `GET /videos/:id` for a `draft` video with the owner's token returns `200` with `publication_status: "draft"`
- `GET /videos/:id` for a `published` + `unlisted` video without a token returns `200`
- `GET /videos/:id/stream` for a `ready` `draft` video without a token returns `404`; with the owner's token returns `200`
- `GET /videos/:id` with an expired token on a published video returns `200` (treated as anonymous)
- The `200` body has every `VideoDetail` field and never the internal `id`, `channel_id` or storage keys

---

### SI-04.5 — Endpoint PATCH /videos/:id (Edit Video Information)

**Route:** PATCH /videos/:id
**Test Specs:** see `nestjs-project/specs/videos-update.plan.md`
**Authorization:** Owner

**Description:** Let the owner edit a video's title, description, category and visibility from any screen, including the management panel.

**Technical actions:**

1. Create `src/videos/dto/update-video.dto.ts` — optional `title`, `description`, `category`, `visibility` with the `#### Validation Rules — Phase 04` constraints and a class-level "at least one field" constraint (→ `VALIDATION_ERROR`) (per `phase-04-channel-management/TD-02`, `TD-03`)
2. Add `InvalidCategoryException` (`INVALID_CATEGORY`, 400) and `PublishRequirementsNotMetException` (`PUBLISH_REQUIREMENTS_NOT_MET`, 409) to `src/common/exceptions/domain.exception.ts` per `### Error Catalog`
3. Create `src/videos/video-management.service.ts` — `update(publicId, userId, dto)`: `findOwnedOrFail`, resolve `category` slug via `CategoriesService.findBySlug` (unknown → `InvalidCategoryException`), reject `category: null` on a `published` video (`PublishRequirementsNotMetException`), persist, return `toVideoDetail`; import `CategoriesModule` in `VideosModule`
4. Add `@Patch(':id')` to `VideosController` with Swagger request/response/error decorators

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideoManagementService.update` | Unit: unknown category, clearing category on published, partial updates | `src/videos/video-management.service.spec.ts` |
| `VideoManagementService.update` | Integration: fields persisted, category relation resolved by slug | `src/videos/video-management.service.integration-spec.ts` |

**Dependencies:** SI-04.1 — `CategoriesService`; SI-04.4 — `toVideoDetail`

**Acceptance criteria:**

- `PATCH /videos/:id` by the owner with `{ "title": "Novo título", "category": "jogos" }` returns `200` with the new `title` and `category: { slug: "jogos", name: "Jogos" }`
- `PATCH /videos/:id` with `{}` or a 101-character `title` returns `400` with `error: "VALIDATION_ERROR"`
- `PATCH /videos/:id` with `{ "category": "inexistente" }` returns `400` with `error: "INVALID_CATEGORY"`
- `PATCH /videos/:id` with `{ "category": null }` on a published video returns `409` with `error: "PUBLISH_REQUIREMENTS_NOT_MET"`
- `PATCH /videos/:id` by another user returns `403` with `error: "VIDEO_ACCESS_DENIED"`; without a token returns `401`
- `PATCH /videos/:id` with `{ "visibility": "unlisted" }` on a draft returns `200` with `visibility: "unlisted"` and `publication_status: "draft"`

---

### SI-04.6 — Endpoints POST /videos/:id/publish and /unpublish (Draft → Publication Flow)

**Route:** POST /videos/:id/publish, POST /videos/:id/unpublish
**Test Specs:** see `nestjs-project/specs/videos-publish.plan.md`
**Authorization:** Owner

**Description:** Implement the draft → publication flow with its preconditions, keeping the first publication time across unpublish/re-publish.

**Technical actions:**

1. Add `VideoManagementService.publish(publicId, userId)` — `findOwnedOrFail`; `processing_status ≠ 'ready'` → `VideoNotReadyException`; `category_id` null → `PublishRequirementsNotMetException`; set `publication_status = 'published'` and `published_at` only when `null`; already published → return unchanged (per `phase-04-channel-management/TD-03`, `TD-02`)
2. Add `VideoManagementService.unpublish(publicId, userId)` — set `publication_status = 'draft'`, keep `published_at`; already draft → return unchanged (per `phase-04-channel-management/TD-03`)
3. Add `@Post(':id/publish')` and `@Post(':id/unpublish')` (HTTP 200) to `VideosController` with Swagger decorators

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideoManagementService.publish/unpublish` | Unit: not ready, missing category, first publish sets `published_at`, re-publish keeps it, idempotency | `src/videos/video-management.service.spec.ts` |
| `VideoManagementService.publish/unpublish` | Integration: state and `published_at` persisted across publish → unpublish → publish | `src/videos/video-management.service.integration-spec.ts` |

**Dependencies:** SI-04.5 — `VideoManagementService` + exceptions

**Acceptance criteria:**

- `POST /videos/:id/publish` by the owner on a `ready` video with a category returns `200` with `publication_status: "published"` and a non-null `published_at`
- `POST /videos/:id/publish` on a video still `processing` returns `409` with `error: "VIDEO_NOT_READY"`
- `POST /videos/:id/publish` on a `ready` video without a category returns `409` with `error: "PUBLISH_REQUIREMENTS_NOT_MET"`
- `POST /videos/:id/unpublish` returns `200` with `publication_status: "draft"` and the same `published_at`; publishing again keeps that `published_at`
- Calling `publish` on a published video (or `unpublish` on a draft) returns `200` with no change
- `POST /videos/:id/publish` by another user returns `403` with `error: "VIDEO_ACCESS_DENIED"`

---

### SI-04.7 — Endpoint PUT /videos/:id/thumbnail (Custom Thumbnail)

**Route:** PUT /videos/:id/thumbnail
**Test Specs:** see `nestjs-project/specs/videos-thumbnail.plan.md`
**Authorization:** Owner

**Description:** Let the owner replace a video's thumbnail with a custom image that the API caps, validates and re-encodes into a uniform 16:9 JPEG before storing it.

**Technical actions:**

1. Add `FfmpegService.normalizeThumbnail(inputPath, outputPath)` in `src/media/ffmpeg.service.ts` — single-frame decode, scale to cover + center-crop to 1280×720, JPEG output (EXIF dropped); decode failure → existing media error (per `phase-04-channel-management/TD-06` + revision: runs in the API process, video processing stays in the worker)
2. Add `InvalidThumbnailException` (`INVALID_THUMBNAIL`, 400) and `ThumbnailTooLargeException` (`THUMBNAIL_TOO_LARGE`, 413) per `### Error Catalog`
3. Create `src/videos/video-thumbnail.service.ts` — `replace(publicId, userId, file)`: `findOwnedOrFail`; content sniffing for JPEG/PNG/WebP signatures (else `InvalidThumbnailException`); temp file → `normalizeThumbnail` (failure → `InvalidThumbnailException`); `uploadFile` to a new versioned `thumbnails/` key; update `thumbnail_key` + `has_custom_thumbnail = true`; then delete the previous thumbnail object; temp files removed in `finally` (per `phase-04-channel-management/TD-05`, `TD-07`)
4. Add `@Put(':id/thumbnail')` to `VideosController` with `FileInterceptor('file', { limits: { fileSize: 2_097_152 } })`, mapping Multer's size-limit error to `ThumbnailTooLargeException`; returns `{ thumbnail_url }` via `ThumbnailUrlResolver`; `@ApiConsumes('multipart/form-data')` + body schema; import `MediaModule` in `VideosModule`
5. Add image fixtures `test/fixtures/thumbnail.png` (non-16:9) and `test/fixtures/thumbnail-invalid.jpg` (JPEG signature, truncated body)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `FfmpegService.normalizeThumbnail` | Integration (real ffmpeg): PNG → 1280×720 JPEG; corrupt input fails | `src/media/ffmpeg.service.integration-spec.ts` |
| `VideoThumbnailService.replace` | Unit: signature rejection, normalize failure mapping, old object deleted after row update | `src/videos/video-thumbnail.service.spec.ts` |
| `VideoThumbnailService.replace` | Integration: real storage + ffmpeg — new key under `thumbnails/`, flag set, previous object removed | `src/videos/video-thumbnail.service.integration-spec.ts` |

**Dependencies:** SI-04.3 — versioned keys, `ThumbnailUrlResolver`; SI-04.4 — owner access helpers in `VideosController`

**Acceptance criteria:**

- `PUT /videos/:id/thumbnail` by the owner with a valid PNG returns `200` with a `thumbnail_url` under `thumbnails/`, and fetching it returns a `1280×720` `image/jpeg`
- A second upload returns a different `thumbnail_url`, and the previous URL no longer resolves
- `PUT /videos/:id/thumbnail` with a 3 MB file returns `413` with `error: "THUMBNAIL_TOO_LARGE"`
- `PUT /videos/:id/thumbnail` with a text file renamed `.jpg`, or a corrupt JPEG, returns `400` with `error: "INVALID_THUMBNAIL"`
- `PUT /videos/:id/thumbnail` by another user returns `403` with `error: "VIDEO_ACCESS_DENIED"`
- After a custom upload, the video keeps that thumbnail even if the worker finishes processing later

---

### SI-04.8 — Endpoint GET /channels/me/videos (Video Management Panel)

**Route:** GET /channels/me/videos
**Test Specs:** see `nestjs-project/specs/channels-me-videos.plan.md`
**Authorization:** Authenticated (own channel)

**Description:** List all of the caller's videos for the management panel with thumbnail, title, counters, publication time and status, paginated by page.

**Technical actions:**

1. Create `src/videos/dto/channel-videos-query.dto.ts` (`page` ≥ 1 default 1, `per_page` 1–50 default 20) and `src/videos/dto/panel-video.dto.ts` with the item and page-envelope fields of `### API Contracts → GET /channels/me/videos` verbatim (per `phase-04-channel-management/TD-09`, `TD-08` + revision)
2. Create `src/videos/video-listing.service.ts` — `listOwn(userId, page, perPage)`: resolve the channel via `ChannelsService.findByUserId`, query all its videos ordered by `created_at` desc, `public_id` desc with `skip/take` + total count, map items with `ThumbnailUrlResolver`
3. Create `src/videos/channel-videos.controller.ts` (`@Controller('channels')`, declared in `VideosModule` to avoid a `ChannelsModule` ↔ `VideosModule` cycle) with `@Get('me/videos')` and Swagger decorators

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideoListingService.listOwn` | Integration: only the caller's videos, all statuses, `created_at` desc, page/total math, counters 0 | `src/videos/video-listing.service.integration-spec.ts` |

**Dependencies:** SI-04.2 — counters/columns; SI-04.3 — `ThumbnailUrlResolver`

**Acceptance criteria:**

- `GET /channels/me/videos` returns the caller's videos (drafts, published, processing and failed) newest first, each with `view_count`, `like_count` and `comment_count` equal to `0`
- `GET /channels/me/videos?page=2&per_page=1` with 3 videos returns 1 item, `page: 2`, `per_page: 1`, `total: 3`
- Videos of other channels never appear in the response
- `GET /channels/me/videos?per_page=51` returns `400` with `error: "VALIDATION_ERROR"`; without a token returns `401`

---

### SI-04.9 — Endpoints GET/PATCH /channels/me (Channel Profile Edit, Nickname Rules)

**Route:** GET /channels/me, PATCH /channels/me
**Test Specs:** see `nestjs-project/specs/channels-me.plan.md`
**Authorization:** Authenticated (own channel)

**Description:** Let the user read and edit their channel's nickname, name and description under the shared nickname rules (format, reserved words, 14-day cooldown), and align registration-time nickname generation with those rules.

**Technical actions:**

1. Create `src/channels/channels.constants.ts` — `RESERVED_NICKNAMES` (list verbatim from `#### Validation Rules — Phase 04`), `NICKNAME_PATTERN` `^[a-z0-9_]{3,30}$`, `NICKNAME_CHANGE_COOLDOWN_DAYS = 14` (per `phase-04-channel-management/TD-11` + revision)
2. Update `src/channels/nickname.util.ts` — generation pads a sanitized prefix shorter than 3, truncates the base so `appendRandomSuffix` keeps the total ≤ 30, and maps a reserved match to `user_<8-char-random>`; existing handles untouched (per `phase-02-auth/TD-10` revision 2026-11-04)
3. Add `NicknameTakenException`, `NicknameReservedException`, `NicknameChangeCooldownException` (all 409) per `### Error Catalog`; add `ChannelsService.getProfile(userId)` and `updateProfile(userId, dto)` — same nickname → no-op; reserved → `NicknameReservedException`; `nickname_changed_at` < 14 days → `NicknameChangeCooldownException`; unique violation `23505` on `nickname` → `NicknameTakenException`; on change set `nickname_changed_at = now()`
4. Create `src/channels/dto/update-channel.dto.ts` (optional `nickname` lowercased, `name`, `description`; at least one field) and `src/channels/dto/channel-profile.dto.ts` (`ChannelProfile` fields verbatim, `next_nickname_change_at` computed)
5. Create `src/channels/channels.controller.ts` with `@Get('me')` and `@Patch('me')` (declared before any `:nickname` route) + Swagger decorators; register it in `ChannelsModule`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `sanitizeNickname` / `appendRandomSuffix` | Unit: short prefix padded to ≥ 3, long prefix + suffix ≤ 30, reserved → `user_<random>` | `src/channels/nickname.util.spec.ts` |
| `ChannelsService.updateProfile` | Unit: no-op same nickname, reserved, cooldown boundary, `23505` mapping | `src/channels/channels.service.spec.ts` |
| `ChannelsService.updateProfile` | Integration: unique violation on a taken nickname, `nickname_changed_at` persisted | `src/channels/channels.service.integration-spec.ts` |
| `UsersService` (registration) | Integration: `ab@x.com` → nickname length ≥ 3; `admin@x.com` → `user_<random>` | `src/users/users.service.integration-spec.ts` |

**Dependencies:** SI-04.2 — `nickname_changed_at` column

**Acceptance criteria:**

- `GET /channels/me` returns `200` with `nickname`, `name`, `description`, `nickname_changed_at`, `next_nickname_change_at` and `created_at`
- `PATCH /channels/me` with `{ "nickname": "novo_canal" }` returns `200` with the new `nickname` and `next_nickname_change_at` 14 days ahead
- A second nickname change within 14 days returns `409` with `error: "NICKNAME_CHANGE_COOLDOWN"`; changing only `name`/`description` in that window returns `200`
- `PATCH /channels/me` with a nickname used by another channel returns `409` with `error: "NICKNAME_TAKEN"`; with `"admin"` returns `409` with `error: "NICKNAME_RESERVED"`
- `PATCH /channels/me` with `{ "nickname": "ab" }`, `{ "nickname": "Bad-Name" }` or `{}` returns `400` with `error: "VALIDATION_ERROR"`
- Registering `admin@example.com` creates a channel whose nickname matches `^user_[a-z0-9]{8}$`; a user whose generated handle is outside 3–30 keeps it until they submit a new one

---

### SI-04.10 — Endpoints GET /channels/:nickname and /channels/:nickname/videos (Public Channel Page)

**Route:** GET /channels/:nickname, GET /channels/:nickname/videos
**Test Specs:** see `nestjs-project/specs/channels-public.plan.md`
**Authorization:** Anonymous

**Description:** Expose the public channel page — channel information by nickname handle and its listing of published public videos with keyset pagination.

**Technical actions:**

1. Add `ChannelNotFoundException` (`CHANNEL_NOT_FOUND`, 404) and `ChannelsService.findByNicknameOrFail(nickname)`; add `@Public() @Get(':nickname')` to `ChannelsController` returning `nickname`, `name`, `description`, `created_at` (per `phase-04-channel-management/TD-10`)
2. Create `src/videos/pagination-cursor.util.ts` — encode/decode an opaque base64url cursor of `{ published_at, public_id }`; malformed input → domain exception mapped to `VALIDATION_ERROR` (400) (per `phase-04-channel-management/TD-09`)
3. Add `VideoListingService.listPublicByChannel(nickname, cursor, limit)` — filter `publication_status = 'published'` AND `visibility = 'public'` AND `processing_status = 'ready'`, order `published_at` desc, `public_id` desc, keyset `(published_at, public_id) < cursor`, fetch `limit + 1` to compute `next_cursor`, map items per `### API Contracts → GET /channels/:nickname/videos` (per `phase-04-channel-management/TD-04` + revision, `TD-09`)
4. Add `@Public() @Get(':nickname/videos')` to `ChannelVideosController` (after `me/videos`) with query DTO (`cursor`, `limit` 1–50 default 24) and Swagger decorators

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `pagination-cursor.util` | Unit: round-trip, malformed/tampered cursor rejected | `src/videos/pagination-cursor.util.spec.ts` |
| `VideoListingService.listPublicByChannel` | Integration: drafts, unlisted and non-ready excluded; order; `next_cursor` walks all pages without duplicates; `null` on last page | `src/videos/video-listing.service.integration-spec.ts` |
| `ChannelsService.findByNicknameOrFail` | Unit: found / `CHANNEL_NOT_FOUND` | `src/channels/channels.service.spec.ts` |

**Dependencies:** SI-04.8 — `VideoListingService`, `ChannelVideosController`; SI-04.9 — `ChannelsController`

**Acceptance criteria:**

- `GET /channels/:nickname` without a token returns `200` with `nickname`, `name`, `description` and `created_at`; an unknown nickname returns `404` with `error: "CHANNEL_NOT_FOUND"`
- `GET /channels/:nickname/videos` lists only published, public, ready videos, newest `published_at` first — drafts and unlisted videos of that channel never appear, even for the owner
- Following `next_cursor` with `limit=2` over 5 published videos returns 2, 2 and 1 items with no duplicates, and the last page has `next_cursor: null`
- `GET /channels/:nickname/videos?cursor=garbage` returns `400` with `error: "VALIDATION_ERROR"`
- `GET /channels/me` still resolves to the authenticated profile endpoint, not to a channel named `me`

---

### SI-04.11 — OpenAPI Contract Export and HTTP Examples for Video and Channel Management

**Description:** Publish the Phase 04 endpoints in the committed OpenAPI contract that the `phase-04-channel-management-frontend` slice will consume, and document the management flows for manual testing.

**Technical actions:**

1. Run `npm run openapi:export` and commit the regenerated `nestjs-project/openapi.json` with every `### API Contracts` operation of this phase, including the multipart body of `PUT /videos/{id}/thumbnail` and the error envelopes (inherited `openapi-docs-nestjs/TD-01`, `openapi-docs-nestjs/TD-02`, `next-frontend-openapi-typing/TD-02`)
2. Extend `test/swagger.e2e-spec.ts` — assert the document lists `/categories`, `/videos/{id}` (GET + PATCH), `/videos/{id}/publish`, `/videos/{id}/unpublish`, `/videos/{id}/thumbnail`, `/channels/me`, `/channels/me/videos`, `/channels/{nickname}`, `/channels/{nickname}/videos` with bearer security only on the authenticated ones
3. Add to `nestjs-project/api.http` — list categories → edit video → upload custom thumbnail → publish → panel listing → edit channel → public channel page + next page via `next_cursor`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Swagger document | E2E: Phase 04 paths and security requirements present | `test/swagger.e2e-spec.ts` |

**Dependencies:** SI-04.1, SI-04.4, SI-04.5, SI-04.6, SI-04.7, SI-04.8, SI-04.9, SI-04.10 — all Phase 04 endpoints implemented

**Acceptance criteria:**

- `nestjs-project/openapi.json` contains every Phase 04 operation with snake_case schemas matching `### API Contracts`
- Running `npm run openapi:export` again produces no diff
- `GET /api/docs-json` marks `GET /categories`, `GET /channels/{nickname}` and `GET /channels/{nickname}/videos` without security, and `PATCH /videos/{id}`, `PUT /videos/{id}/thumbnail`, `/channels/me*` with bearer security

---

## Technical Specifications

### Data Model

#### Category (new)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | Internal identifier; never exposed on the wire |
| slug | varchar(50) | unique, not null | Stable wire identifier for the category (per `phase-04-channel-management/TD-01`) |
| name | varchar(50) | not null | Display name |
| created_at | timestamp | not null, auto-generated | `@CreateDateColumn` |

**Relations:** Category → Video (one-to-many, inverse side `videos`)
**Indexes:** `(slug)` — unique
**Seed (data migration, per `phase-04-channel-management/TD-01` revision 2026-11-04):** `musica` Música, `jogos` Jogos, `educacao` Educação, `esportes` Esportes, `entretenimento` Entretenimento, `tecnologia` Tecnologia, `noticias` Notícias, `humor` Humor, `viagens` Viagens, `outros` Outros.

#### Video (modified)

New and changed columns only — the Phase 03 columns are unchanged (see `phase-03-videos` Data Model).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| title | varchar(100) | not null | Defaulted at draft creation from `file_name` with the extension stripped, truncated to 100; the migration backfills existing rows the same way (per `phase-04-channel-management/TD-02`) |
| description | text | nullable | ≤ 5000 chars, validated in the DTO (per `phase-04-channel-management/TD-02`) |
| category_id | uuid | FK → categories.id, nullable, `ON DELETE RESTRICT` | Optional while draft; required to publish (per `phase-04-channel-management/TD-02`) |
| publication_status | enum | not null, default `'draft'`, values: `'draft'`, `'published'` | Adds `'published'` to `videos_publication_status_enum` (per `phase-04-channel-management/TD-03`) |
| visibility | enum | not null, default `'public'`, values: `'public'`, `'unlisted'` | New PostgreSQL enum `videos_visibility_enum`; editable at any time, independent of publication (per `phase-04-channel-management/TD-03`) |
| published_at | timestamptz | nullable | Set on the first publish; kept on unpublish and re-publish (per `phase-04-channel-management/TD-03`) |
| thumbnail_key | varchar | nullable | Now holds a versioned key `thumbnails/{id}/{version}.jpg` for new thumbnails; Phase 03 keys (`videos/{id}/thumbnail.jpg`) remain valid and are served via presigned GET (per `phase-04-channel-management/TD-07`) |
| has_custom_thumbnail | boolean | not null, default `false` | Set when the owner uploads a custom thumbnail; the processing worker never overwrites `thumbnail_key` when `true` |
| view_count | integer | not null, default `0` | Always `0` in Phase 04; incremented by Phase 05 (per `phase-04-channel-management/TD-08` + revision) |
| like_count | integer | not null, default `0` | Always `0` in Phase 04; incremented by Phase 06 (per `phase-04-channel-management/TD-08` + revision) |
| comment_count | integer | not null, default `0` | Always `0` in Phase 04; incremented by Phase 06 (per `phase-04-channel-management/TD-08` + revision) |

**Relations:** Video → Category (many-to-one, owning side via `category_id`, nullable)
**Indexes:** `(category_id)` — FK (Phase 05 suggestions filter on it); `(channel_id, created_at)` — owner panel ordering; `(channel_id, published_at, public_id)` — public channel listing keyset; `public_id` is the unique tie-breaker so the opaque cursor never carries the internal `id` (per `phase-04-channel-management/TD-09`)
**Storage objects (bucket `S3_BUCKET`):** thumbnails move to the public-read prefix `thumbnails/{id}/{version}.jpg` (`{version}` = random token generated per write, so a new thumbnail always gets a new URL); the previous thumbnail object is deleted after the row points at the new key (per `phase-04-channel-management/TD-07`). Video objects under `videos/{id}/` stay private.

#### Channel (modified)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| nickname_changed_at | timestamptz | nullable | Set when the nickname is changed via the API; a new change is allowed only when `null` or ≥ 14 days ago (per `phase-04-channel-management/TD-11`) |

Existing `name` varchar(50), `nickname` varchar(50) unique and `description` text are unchanged at the schema level; new edit limits are enforced in the DTO (see Validation Rules).

### API Contracts

Wire fields are snake_case (per `phase-03-videos/TD-09` revision). Errors use the inherited envelope `{ statusCode, error, message }` (per `phase-02-auth/TD-07`). `thumbnail_url` is a stable public URL `{S3_PUBLIC_ENDPOINT}/{S3_BUCKET}/{thumbnail_key}` for keys under `thumbnails/`, a presigned GET for legacy Phase 03 keys, and `null` when no thumbnail exists (per `phase-04-channel-management/TD-07`).

**Shared shape — `VideoDetail`** (returned by `GET /videos/:id`, `PATCH /videos/:id`, `POST /videos/:id/publish`, `POST /videos/:id/unpublish`):
- public_id: string
- title: string
- description: string | null
- category: `{ slug: string, name: string }` | null
- file_name: string
- processing_status: `"uploading" | "processing" | "ready" | "failed"`
- publication_status: `"draft" | "published"`
- visibility: `"public" | "unlisted"`
- published_at: string (ISO-8601) | null
- duration_seconds: number | null
- width: integer | null
- height: integer | null
- thumbnail_url: string | null
- created_at: string (ISO-8601)

---

#### GET /categories (SI-04.1)

**Request headers:** none (public endpoint)

**Response 200:**
- items: array of `{ slug: string, name: string }`, ordered by `name`

**Error responses:** none

---

#### GET /videos/:id (SI-04.4)

Modified from Phase 03: response is `VideoDetail`; drafts are owner-only (per `phase-04-channel-management/TD-04` + revision).

**Request headers:**
- Authorization: Bearer {access_token} — optional; when present and valid, identifies the owner

**Response 200:** `VideoDetail`

**Error responses:**
- 404 VIDEO_NOT_FOUND: no video with this `public_id`, OR the video is `draft` and the caller is not its owner (anonymous or other user)

---

#### GET /videos/:id/stream (SI-04.4)

Modified from Phase 03: drafts are owner-only (per `phase-04-channel-management/TD-04` + revision). Response shape unchanged (`{ url, expires_at }` presigned GET).

**Request headers:**
- Authorization: Bearer {access_token} — optional; when present and valid, identifies the owner

**Error responses:**
- 404 VIDEO_NOT_FOUND: unknown `public_id`, OR `draft` video requested by a non-owner
- 409 VIDEO_NOT_READY: `processing_status ≠ 'ready'` (unchanged)

---

#### PATCH /videos/:id (SI-04.5)

**Request headers:**
- Authorization: Bearer {access_token}
- Content-Type: application/json

**Request body** (all fields optional; at least one required):
- title: string — trimmed, 1–100 characters
- description: string | null — ≤ 5000 characters; `null` clears it
- category: string | null — category `slug`; `null` clears it (rejected when the video is `published`)
- visibility: `"public" | "unlisted"`

**Response 200:** `VideoDetail`

**Error responses:**
- 400 VALIDATION_ERROR: body fails validation or is empty
- 400 INVALID_CATEGORY: `category` slug does not exist
- 401: missing/invalid access token
- 403 VIDEO_ACCESS_DENIED: caller is not the owner
- 404 VIDEO_NOT_FOUND: unknown `public_id`
- 409 PUBLISH_REQUIREMENTS_NOT_MET: `category: null` on a `published` video

---

#### POST /videos/:id/publish (SI-04.6)

Sets `publication_status = 'published'`; sets `published_at` when it is `null`. Idempotent on an already published video (200, unchanged). (per `phase-04-channel-management/TD-03`)

**Request headers:**
- Authorization: Bearer {access_token}

**Request body:** none

**Response 200:** `VideoDetail`

**Error responses:**
- 401: missing/invalid access token
- 403 VIDEO_ACCESS_DENIED: caller is not the owner
- 404 VIDEO_NOT_FOUND: unknown `public_id`
- 409 VIDEO_NOT_READY: `processing_status ≠ 'ready'`
- 409 PUBLISH_REQUIREMENTS_NOT_MET: `category_id` is `null` (per `phase-04-channel-management/TD-02`)

---

#### POST /videos/:id/unpublish (SI-04.6)

Sets `publication_status = 'draft'`; keeps `published_at`. Idempotent on a draft (200, unchanged). (per `phase-04-channel-management/TD-03`)

**Request headers:**
- Authorization: Bearer {access_token}

**Request body:** none

**Response 200:** `VideoDetail`

**Error responses:**
- 401: missing/invalid access token
- 403 VIDEO_ACCESS_DENIED: caller is not the owner
- 404 VIDEO_NOT_FOUND: unknown `public_id`

---

#### PUT /videos/:id/thumbnail (SI-04.7)

Replaces the thumbnail with a custom image: the API caps the upload, re-encodes it with FFmpeg to a 1280×720 (16:9, scaled and center-cropped) JPEG, stores it under a new versioned `thumbnails/` key, sets `has_custom_thumbnail = true` and deletes the previous thumbnail object (per `phase-04-channel-management/TD-05`, `TD-06` + revision, `TD-07`).

**Request headers:**
- Authorization: Bearer {access_token}
- Content-Type: multipart/form-data

**Request body (multipart):**
- file: binary, required — JPEG, PNG or WebP; ≤ 2 MB (2 097 152 bytes)

**Response 200:**
- thumbnail_url: string

**Error responses:**
- 400 INVALID_THUMBNAIL: `file` missing, not JPEG/PNG/WebP by content, or FFmpeg cannot decode it
- 401: missing/invalid access token
- 403 VIDEO_ACCESS_DENIED: caller is not the owner
- 404 VIDEO_NOT_FOUND: unknown `public_id`
- 413 THUMBNAIL_TOO_LARGE: file larger than 2 MB

---

#### GET /channels/me/videos (SI-04.8)

Owner management panel; all of the caller's videos regardless of status, newest first by `created_at` (per `phase-04-channel-management/TD-09` offset pagination, `TD-08` + revision counters).

**Request headers:**
- Authorization: Bearer {access_token}

**Request query parameters:**
- page: integer, optional — ≥ 1, default 1
- per_page: integer, optional — 1–50, default 20

**Response 200:**
- items: array of:
  - public_id: string
  - title: string
  - thumbnail_url: string | null
  - processing_status: `"uploading" | "processing" | "ready" | "failed"`
  - publication_status: `"draft" | "published"`
  - visibility: `"public" | "unlisted"`
  - published_at: string (ISO-8601) | null
  - created_at: string (ISO-8601)
  - duration_seconds: number | null
  - view_count: integer — always `0` in Phase 04
  - like_count: integer — always `0` in Phase 04
  - comment_count: integer — always `0` in Phase 04
- page: integer
- per_page: integer
- total: integer

**Error responses:**
- 400 VALIDATION_ERROR: invalid `page` / `per_page`
- 401: missing/invalid access token

---

#### GET /channels/me (SI-04.9)

**Request headers:**
- Authorization: Bearer {access_token}

**Response 200:** `ChannelProfile`
- nickname: string
- name: string
- description: string | null
- nickname_changed_at: string (ISO-8601) | null
- next_nickname_change_at: string (ISO-8601) | null — when the 14-day cooldown ends; `null` when a change is allowed now
- created_at: string (ISO-8601)

**Error responses:**
- 401: missing/invalid access token

---

#### PATCH /channels/me (SI-04.9)

Returns the updated channel so the frontend slice can refresh the session's `channelSlug` (per `phase-04-channel-management/TD-11` revision 2026-11-04). Submitting the current nickname is a no-op and does not start a cooldown.

**Request headers:**
- Authorization: Bearer {access_token}
- Content-Type: application/json

**Request body** (all fields optional; at least one required):
- nickname: string — lowercased; `^[a-z0-9_]{3,30}$`; not in the reserved list
- name: string — trimmed, 1–50 characters
- description: string | null — ≤ 1000 characters; `null` clears it

**Response 200:** `ChannelProfile`

**Error responses:**
- 400 VALIDATION_ERROR: body fails validation or is empty
- 401: missing/invalid access token
- 409 NICKNAME_TAKEN: another channel already uses the nickname
- 409 NICKNAME_RESERVED: nickname is in the reserved list
- 409 NICKNAME_CHANGE_COOLDOWN: nickname changed less than 14 days ago

---

#### GET /channels/:nickname (SI-04.10)

Public channel page header (per `phase-04-channel-management/TD-10`).

**Request headers:** none (public endpoint)

**Response 200:**
- nickname: string
- name: string
- description: string | null
- created_at: string (ISO-8601)

**Error responses:**
- 404 CHANNEL_NOT_FOUND: no channel with this nickname

---

#### GET /channels/:nickname/videos (SI-04.10)

Public channel listing: only `publication_status = 'published'` AND `visibility = 'public'` AND `processing_status = 'ready'`, ordered by `published_at` desc, `public_id` desc (per `phase-04-channel-management/TD-04` + revision, `TD-09` keyset pagination).

**Request headers:** none (public endpoint)

**Request query parameters:**
- cursor: string, optional — opaque value from a previous `next_cursor`
- limit: integer, optional — 1–50, default 24

**Response 200:**
- items: array of:
  - public_id: string
  - title: string
  - thumbnail_url: string | null
  - duration_seconds: number | null
  - published_at: string (ISO-8601)
  - view_count: integer — always `0` in Phase 04
- next_cursor: string | null — `null` on the last page

**Error responses:**
- 400 VALIDATION_ERROR: malformed `cursor` or invalid `limit`
- 404 CHANNEL_NOT_FOUND: no channel with this nickname

---

#### Validation Rules — Phase 04

- `title`: trimmed, 1–100 characters (per `phase-04-channel-management/TD-02`)
- `description` (video): ≤ 5000 characters, nullable (per `phase-04-channel-management/TD-02`)
- `category`: existing category `slug`, nullable (per `phase-04-channel-management/TD-01`)
- `visibility`: `public` | `unlisted` (per `phase-04-channel-management/TD-03`)
- `file` (thumbnail): JPEG/PNG/WebP by content, ≤ 2 097 152 bytes (per `phase-04-channel-management/TD-05`, `TD-06`)
- `nickname`: lowercased, `^[a-z0-9_]{3,30}$`, not reserved, unique; validated only when a new value is submitted — existing handles are grandfathered (per `phase-04-channel-management/TD-11` + revision)
- `name` (channel): trimmed, 1–50 characters (per `phase-04-channel-management/TD-11`)
- `description` (channel): ≤ 1000 characters, nullable (per `phase-04-channel-management/TD-11`)
- `page` ≥ 1; `per_page` 1–50; `limit` 1–50 (per `phase-04-channel-management/TD-09`)
- Reserved nicknames (shared by registration-time generation and edit validation, per `phase-04-channel-management/TD-11` revision): `me`, `admin`, `api`, `auth`, `login`, `logout`, `signup`, `register`, `channel`, `channels`, `video`, `videos`, `upload`, `studio`, `settings`, `help`, `about`, `support`, `root`, `null`, `undefined`, `streamtube`
- Registration-time generation (per `phase-02-auth/TD-10` revision 2026-11-04): sanitized prefix shorter than 3 chars is padded with `_` + random hex to ≥ 3; base truncated so the collision suffix (`_xxx`) keeps the total ≤ 30; a reserved match falls back to `user_<8-char-random>`

### Authorization Matrix

Owner = authenticated user whose channel owns the video (`video.channel.user_id === JwtPayload.sub`), checked after existence (404 before 403) as in Phase 03. Public endpoints use `@Public()`; "optional auth" endpoints are `@Public()` plus a guard that decodes a valid bearer token when present without requiring it (per `phase-04-channel-management/TD-04`). Phase 03 rows not listed are unchanged.

| Endpoint | Anonymous | Authenticated | Owner | Notes |
|----------|-----------|---------------|-------|-------|
| GET /categories | ✓ | ✓ | — | |
| GET /videos/:id | ✓ (published only) | ✓ (published only) | ✓ (any state) | Draft → 404 for non-owners (per `phase-04-channel-management/TD-04`); unlisted readable by link |
| GET /videos/:id/stream | ✓ (published only) | ✓ (published only) | ✓ (any state) | Same rule as `GET /videos/:id`; still `'ready'` only |
| PATCH /videos/:id | ✗ | ✗ | ✓ | |
| POST /videos/:id/publish | ✗ | ✗ | ✓ | |
| POST /videos/:id/unpublish | ✗ | ✗ | ✓ | |
| PUT /videos/:id/thumbnail | ✗ | ✗ | ✓ | |
| GET /channels/me/videos | ✗ | ✓ | — | Always the caller's own channel |
| GET /channels/me | ✗ | ✓ | — | Always the caller's own channel |
| PATCH /channels/me | ✗ | ✓ | — | Always the caller's own channel |
| GET /channels/:nickname | ✓ | ✓ | — | |
| GET /channels/:nickname/videos | ✓ | ✓ | — | Published + public + ready only, also for the owner |

### Error Catalog

Error response format inherited from `phase-02-auth/TD-07`: `{ statusCode, error, message }`; new codes are `DomainException` subclasses in `src/common/exceptions/domain.exception.ts`. Reused from earlier phases: `VALIDATION_ERROR` (400), `VIDEO_NOT_FOUND` (404), `VIDEO_ACCESS_DENIED` (403), `VIDEO_NOT_READY` (409).

| Code | HTTP | Message | Trigger |
|------|------|---------|---------|
| INVALID_CATEGORY | 400 | Category does not exist | `PATCH /videos/:id` with an unknown `category` slug |
| PUBLISH_REQUIREMENTS_NOT_MET | 409 | Video cannot be published without a category | `POST /videos/:id/publish` with `category_id = null`, or `PATCH /videos/:id` clearing the category of a published video (per `phase-04-channel-management/TD-02`) |
| INVALID_THUMBNAIL | 400 | Thumbnail must be a valid JPEG, PNG or WebP image | `PUT /videos/:id/thumbnail` with a missing file, unsupported content, or an image FFmpeg cannot decode (per `phase-04-channel-management/TD-06`) |
| THUMBNAIL_TOO_LARGE | 413 | Thumbnail exceeds the maximum allowed size | `PUT /videos/:id/thumbnail` with a file > 2 MB (per `phase-04-channel-management/TD-05`) |
| CHANNEL_NOT_FOUND | 404 | Channel not found | `GET /channels/:nickname*` with an unknown nickname |
| NICKNAME_TAKEN | 409 | Nickname is already in use | `PATCH /channels/me` with a nickname owned by another channel (unique-violation on `channels.nickname`) |
| NICKNAME_RESERVED | 409 | Nickname is reserved | `PATCH /channels/me` with a nickname in the reserved list (per `phase-04-channel-management/TD-11`) |
| NICKNAME_CHANGE_COOLDOWN | 409 | Nickname can be changed once every 14 days | `PATCH /channels/me` with a new nickname while `nickname_changed_at` is less than 14 days ago (per `phase-04-channel-management/TD-11`) |

---

## Dependency Map

```
SI-04.1 (root — Category entity, seed, GET /categories)
└── SI-04.2 — depends on SI-04.1 (category_id FK needs the categories table)
    ├── SI-04.3 — depends on SI-04.2 (has_custom_thumbnail column)
    │   ├── SI-04.4 — depends on SI-04.2 + SI-04.3 (new columns + ThumbnailUrlResolver)
    │   │   ├── SI-04.5 — depends on SI-04.1 + SI-04.4 (CategoriesService + toVideoDetail)
    │   │   │   └── SI-04.6 — depends on SI-04.5 (VideoManagementService + exceptions)
    │   │   └── SI-04.7 — depends on SI-04.3 + SI-04.4 (versioned keys + owner access in controller)
    │   └── SI-04.8 — depends on SI-04.2 + SI-04.3 (counters + ThumbnailUrlResolver)
    │       └── SI-04.10 — depends on SI-04.8 + SI-04.9 (VideoListingService + ChannelsController)
    └── SI-04.9 — depends on SI-04.2 (nickname_changed_at column)
        └── SI-04.10 — (see above)
SI-04.11 — depends on SI-04.1, SI-04.4, SI-04.5, SI-04.6, SI-04.7, SI-04.8, SI-04.9, SI-04.10 (all endpoints implemented before export)
```

---

## Deliverables

- [ ] SI-04.1 — Category Catalog and GET /categories
- [ ] SI-04.2 — Video and Channel Schema for Management, Draft Title Default
- [ ] SI-04.3 — Public Thumbnail Delivery (Public-read Prefix, Versioned Keys)
- [ ] SI-04.4 — Read Access by Publication State (GET /videos/:id, /stream)
- [ ] SI-04.5 — Endpoint PATCH /videos/:id (Edit Video Information)
- [ ] SI-04.6 — Endpoints POST /videos/:id/publish and /unpublish (Draft → Publication Flow)
- [ ] SI-04.7 — Endpoint PUT /videos/:id/thumbnail (Custom Thumbnail)
- [ ] SI-04.8 — Endpoint GET /channels/me/videos (Video Management Panel)
- [ ] SI-04.9 — Endpoints GET/PATCH /channels/me (Channel Profile Edit, Nickname Rules)
- [ ] SI-04.10 — Endpoints GET /channels/:nickname and /channels/:nickname/videos (Public Channel Page)
- [ ] SI-04.11 — OpenAPI Contract Export and HTTP Examples for Video and Channel Management

**Full test suites:**

- [ ] Backend unit + integration tests pass (`docker compose exec nestjs-api npm test -- --runInBand`)
- [ ] E2E tests pass (`docker compose exec nestjs-api npm run test:e2e -- --runInBand`)
- [ ] Type check passes (`docker compose exec nestjs-api npx tsc --noEmit`)
- [ ] Lint passes (`docker compose exec nestjs-api npm run lint`)
- [ ] Project builds successfully, including the worker entrypoint (`docker compose exec nestjs-api npm run build` → `dist/main.js` and `dist/worker.js`)
