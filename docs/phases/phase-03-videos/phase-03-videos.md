---
kind: phase
name: phase-03-videos
test_specs_aware: true
sources_mtime:
  docs/phases/phase-03-videos/context.md: "2026-11-03T19:01:23-03:00"
  docs/phases/phase-03-videos/library-refs.md: "2026-11-03T19:01:23-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-11-03T19:01:23-03:00"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-next-frontend-openapi-typing.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-next-frontend-config-base.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-next-frontend-msw-foundation.md: "2026-10-21T16:43:34-03:00"
---

# Phase 03 — Upload e Processamento de Vídeos

## Objective

Deliver the video upload and processing backbone — S3-compatible file storage and a background job queue, direct-to-storage upload of files up to 10GB without impacting API performance, automatic draft pre-registration when the upload starts, automatic processing after upload (duration and metadata extraction plus thumbnail generation from a video frame), a unique URL per video, streaming playback without full download, and download of the video by its owner.

---

## Step Implementations

### SI-03.1 — Infra: Dependencies, FFmpeg Image, SeaweedFS and Redis Services

**Description:** Install the Phase 03 libraries, add FFmpeg to the dev image, and add the object storage and queue backing services to Docker Compose, including an idempotent bucket bootstrap (via the S3 API) with the multipart-abort lifecycle rule and the browser CORS required by direct uploads.

_Revised 2026-11-03 during /implement: MinIO images are no longer pullable — storage service switched to SeaweedFS per `phase-03-videos/TD-12` (supersedes TD-01); `mc`-based bootstrap replaced by an S3-API bootstrap script._

**Technical actions:**

1. Install production dependencies in `nestjs-project` (inside the container): `@aws-sdk/client-s3@^3.1161.0`, `@aws-sdk/s3-request-presigner@^3.1161.0` (per `phase-03-videos/TD-12`), `@nestjs/bullmq@^11.0.5` (v12 is ESM-only — see library-refs), `bullmq@^6.5.4`, `ioredis@^5` (required peer of bullmq 6) (per `phase-03-videos/TD-02`)
2. Update `nestjs-project/Dockerfile.dev` — add `ffmpeg` to the `apt install` line so `ffmpeg`/`ffprobe` exist in the image used by API tests and the worker (per `phase-03-videos/TD-07`, `phase-03-videos/TD-11`)
3. Add `seaweedfs` service to `nestjs-project/compose.yaml` — `chrislusf/seaweedfs:4.51`, `server -s3 -s3.config=/etc/seaweedfs/s3.json` where the identities JSON is generated at container start from `S3_ACCESS_KEY`/`S3_SECRET_KEY` (single admin identity), host port `8333` (S3 only), named volume on `/data`, healthcheck `wget -qO- http://localhost:8333/healthz` (per `phase-03-videos/TD-12`)
4. Create `src/storage/bucket-bootstrap.ts` — `bootstrapBucket(client, { bucket, corsAllowedOrigins, abortIncompleteDays })`: `CreateBucket` (ignoring `BucketAlreadyOwnedByYou`/`BucketAlreadyExists`), `PutBucketCors` (`AllowedMethods: GET, PUT, HEAD`, `AllowedHeaders: *`, `ExposeHeaders: ETag`), `PutBucketLifecycleConfiguration` (`AbortIncompleteMultipartUpload.DaysAfterInitiation = 2`); plus CLI `src/storage/bootstrap-buckets.cli.ts` (reads `S3_*` + `S3_CORS_ALLOWED_ORIGINS` from env via `dotenv/config`, bootstraps `S3_BUCKET` and `<S3_BUCKET>-test`) exposed as `npm run storage:bootstrap` (per `phase-03-videos/TD-12`, `phase-03-videos/TD-10`, `library-refs.md` → `@aws-sdk/client-s3` bucket bootstrap)
5. Add `redis` (`redis:7-alpine`, port `6379`, healthcheck `redis-cli ping`) and one-shot `storage-init` (same build/volume as `nestjs-api`, `command: npm run storage:bootstrap`, `depends_on: seaweedfs: service_healthy`) services; make `nestjs-api` depend on `seaweedfs` (healthy), `storage-init` (completed successfully) and `redis` (healthy) (per `phase-03-videos/TD-02`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `bootstrapBucket` | Integration (real Compose SeaweedFS, throwaway bucket): creates bucket; CORS rule exposes `ETag` for the configured origin; lifecycle rule has `AbortIncompleteMultipartUpload` of 2 days; second run is a no-op without errors | `src/storage/bucket-bootstrap.integration-spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- `docker compose ps` shows `seaweedfs` and `redis` running and healthy; `storage-init` exited with code 0
- `docker compose exec nestjs-api ffmpeg -version` and `ffprobe -version` print version info
- After `storage-init`, `GetBucketLifecycleConfiguration` on `S3_BUCKET` returns an `AbortIncompleteMultipartUpload` rule of 2 days
- A browser-origin `OPTIONS` preflight to `http://localhost:8333/<bucket>/<key>` from the configured frontend origin returns `Access-Control-Allow-Origin` and the actual response exposes the `ETag` header
- Re-running `npm run storage:bootstrap` exits 0 without changing bucket state
- Existing test suites still pass after the image rebuild

---

### SI-03.2 — Configuration Namespaces for Storage, Queue and Upload

**Description:** Create the `storage`, `queue` and `upload` config namespaces following the inherited `registerAs` pattern and extend the Joi env schema, so every new service reads typed config and the app fails fast when storage credentials are missing.

**Technical actions:**

1. Create `src/config/storage.config.ts` — `registerAs('storage', ...)` reading `S3_ENDPOINT` (internal, Compose service name: `http://seaweedfs:8333`), `S3_PUBLIC_ENDPOINT` (host-reachable, used only for presigning: `http://localhost:8333`), `S3_REGION` (default `'us-east-1'`), `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_CORS_ALLOWED_ORIGINS` (comma-separated, default `'http://localhost:3001'`) (per `phase-03-videos/TD-12`, `phase-03-videos/TD-04`; inherited `phase-01-configuracao-base/TD-03`)
2. Create `src/config/queue.config.ts` — `registerAs('queue', ...)` reading `REDIS_HOST` (default `'redis'`), `REDIS_PORT` (default `6379`) (per `phase-03-videos/TD-02`)
3. Create `src/config/upload.config.ts` — `registerAs('upload', ...)` reading `MAX_UPLOAD_BYTES` (default `10737418240`), `UPLOAD_PART_SIZE_BYTES` (default `67108864`, min 5 MiB), `PRESIGNED_URL_TTL_SECONDS` (default `3600`), `STALE_UPLOAD_HOURS` (default `48`) (per `phase-03-videos/TD-09`, `phase-03-videos/TD-10`)
4. Update `src/config/env.validation.ts` — add the new keys to the Joi schema (`S3_*` credentials and endpoints required, numeric keys with defaults and `UPLOAD_PART_SIZE_BYTES ≥ 5242880`); add the three factories to `ConfigModule.forRoot({ load })` in `AppModule`
5. Update `.env.example` with all new variables using Compose service names for container-to-container hosts (`S3_ENDPOINT=http://seaweedfs:8333`, `REDIS_HOST=redis`) and `S3_PUBLIC_ENDPOINT=http://localhost:8333` for browser-facing signing; `S3_ACCESS_KEY`/`S3_SECRET_KEY` also feed the SeaweedFS identities JSON generated in Compose

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `envValidationSchema` | Unit: required `S3_*` keys rejected when missing; numeric defaults applied; part size below 5 MiB rejected | `src/config/env.validation.spec.ts` |

**Dependencies:** SI-03.1 — services and `.env` keys must exist for the app to boot

**Acceptance criteria:**

- The application boots with the new `.env.example` values inside Docker Compose
- Booting without `S3_BUCKET` (or any required `S3_*` key) fails at startup with a Joi validation error
- Booting with `UPLOAD_PART_SIZE_BYTES=1000` fails at startup with a Joi validation error
- With no override, `upload.maxUploadBytes` resolves to `10737418240` and `upload.partSizeBytes` to `67108864`

---

### SI-03.3 — Storage Module (S3 API Adapter)

**Description:** Create the `StorageModule` that encapsulates every S3 API call behind a typed `StorageService`, keeping the rest of the code coupled only to this adapter (and the S3 API), with separate internal and public clients so presigned URLs are browser-reachable.

**Technical actions:**

1. Create `src/storage/storage.module.ts` — provides two `S3Client` instances built from `storageConfig` (`forcePathStyle: true`, `requestChecksumCalculation: 'WHEN_REQUIRED'`, `responseChecksumValidation: 'WHEN_REQUIRED'`): `internal` (endpoint `S3_ENDPOINT`, used for every server-side call) and `public` (endpoint `S3_PUBLIC_ENDPOINT`, used only by `getSignedUrl`); exports `StorageService` (per `phase-03-videos/TD-12`, `phase-03-videos/TD-04` revision, `library-refs.md` → `@aws-sdk/client-s3`)
2. Create `src/storage/storage.service.ts` — multipart methods: `createMultipartUpload(key, contentType)` → `UploadId`; `presignUploadPart(key, uploadId, partNumber)` → url; `completeMultipartUpload(key, uploadId, parts)` translating `InvalidPart`/`InvalidPartOrder`/`NoSuchUpload` into a typed `MultipartCompletionError`; `abortMultipartUpload(key, uploadId)` ignoring `NoSuchUpload` (per `phase-03-videos/TD-04`, `phase-03-videos/TD-10`)
3. Add object methods to `StorageService`: `headObject(key)` → `{ contentLength }`, `presignGetObject(key, { downloadFileName? })` setting `ResponseContentDisposition: attachment; filename="..."` when given, `downloadToFile(key, path)` (streams `GetObject` body to disk), `uploadFile(path, key, contentType)`, `deleteObject(key)`; all presigns use `PRESIGNED_URL_TTL_SECONDS` and return `{ url, expiresAt }` (per `phase-03-videos/TD-08`, `phase-03-videos/TD-09`, `library-refs.md` → `@aws-sdk/s3-request-presigner`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `StorageModule` | Unit: compilation test (module resolves with test config) | `src/storage/storage.module.spec.ts` |
| `StorageService` | Integration (real Compose SeaweedFS, test bucket): create multipart → presign part → `PUT` via `fetch` (no checksum query params in the URL) → complete with ETag → `headObject` size; invalid ETag → `MultipartCompletionError`; abort; presigned GET honors `Range` (206) and download disposition header; signed URL host is `S3_PUBLIC_ENDPOINT` | `src/storage/storage.service.integration-spec.ts` |

**Dependencies:** SI-03.2 — `storageConfig` must exist

**Acceptance criteria:**

- A file uploaded in 2 parts through presigned `UploadPart` URLs and completed with the returned ETags becomes a single object whose `headObject` size equals the sum of the parts
- Completing a multipart upload with a wrong ETag raises `MultipartCompletionError` and leaves the upload resumable
- A presigned GET URL starts with `S3_PUBLIC_ENDPOINT`, answers a `Range: bytes=0-99` request with `206` and 100 bytes, and expires after `PRESIGNED_URL_TTL_SECONDS`
- A presigned GET with `downloadFileName` makes storage respond with `Content-Disposition: attachment; filename="..."`
- Aborting an unknown or already-aborted upload completes without throwing

---

### SI-03.4 — Video Entity, Public ID Generator and Migration

**Description:** Create the `Video` entity with orthogonal processing/publication statuses and a short random public identifier, its migration, and the `VideosModule` skeleton that owns it.

**Technical actions:**

1. Create `src/videos/entities/video.entity.ts` — `@Entity('videos')` with every column of `### Data Model → Video` verbatim (`public_id` varchar(11) unique, `processing_status` enum `'uploading' | 'processing' | 'ready' | 'failed'` default `'uploading'`, `publication_status` enum `'draft'` default `'draft'`, `file_size` bigint, nullable `upload_id`/`video_key`/`thumbnail_key`/metadata/`failure_reason`), `@ManyToOne(() => Channel, (channel) => channel.videos)` + `@JoinColumn({ name: 'channel_id' })`, indexes `(channel_id)` and `(processing_status, created_at)` (per `phase-03-videos/TD-05`, `phase-03-videos/TD-06`)
2. Update `src/channels/entities/channel.entity.ts` — add inverse `@OneToMany(() => Video, (video) => video.channel) videos: Video[]` (no column change)
3. Create `src/videos/public-id.util.ts` — `generatePublicId()`: `crypto.randomBytes(8)` → base64url → first 11 chars (alphabet `[A-Za-z0-9_-]`), plus `isPublicId(value)` regex check `^[A-Za-z0-9_-]{11}$` (per `phase-03-videos/TD-06`)
4. Generate the migration via `npm run migration:generate -- src/database/migrations/CreateVideos` and review the SQL (enum types, unique index on `public_id`, FK to `channels` with `ON DELETE CASCADE`, composite index)
5. Create `src/videos/videos.module.ts` — `TypeOrmModule.forFeature([Video])`; register `VideosModule` in `AppModule`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `Video` | Integration: unique `public_id`, defaults `processing_status = 'uploading'` / `publication_status = 'draft'`, enum rejects unknown value, FK to `channels`, `bigint` stores > 2^31 sizes, nullable columns | `src/videos/entities/video.entity.integration-spec.ts` |
| `generatePublicId` / `isPublicId` | Unit: length 11, URL-safe alphabet, distinct values across many calls, validator accepts/rejects | `src/videos/public-id.util.spec.ts` |

**Dependencies:** none _(uses existing `Channel` entity and TypeORM setup)_

**Acceptance criteria:**

- After `npm run migration:run`, table `videos` exists with the columns, enum types and indexes from `### Data Model → Video`
- Inserting a video with only `channel_id`, `public_id`, `file_name`, `file_size`, `content_type`, `original_key` persists `processing_status = 'uploading'` and `publication_status = 'draft'`
- Inserting two videos with the same `public_id` fails with a unique-constraint violation
- A `file_size` of `10737418240` round-trips without overflow
- `npm run migration:revert` drops the table and enum types cleanly

---

### SI-03.5 — Queue Infrastructure and Video Processing Producer

**Description:** Wire BullMQ into Nest with a shared Redis connection, declare the two queues of `### Events/Messages`, and provide the API-side producer that enqueues `process-video` jobs idempotently.

**Technical actions:**

1. Create `src/queue/queue.module.ts` — `BullModule.forRootAsync({ imports: [ConfigModule], inject: [queueConfig.KEY], useFactory: (cfg) => ({ connection: { host: cfg.host, port: cfg.port } }) })` and export it; import in `AppModule` (per `phase-03-videos/TD-02`, `library-refs.md` → `@nestjs/bullmq`)
2. Create `src/queue/queue.constants.ts` — `VIDEO_PROCESSING_QUEUE = 'video-processing'`, `VIDEO_MAINTENANCE_QUEUE = 'video-maintenance'`, `PROCESS_VIDEO_JOB = 'process-video'`, `RECONCILE_STALE_UPLOADS_JOB = 'reconcile-stale-uploads'`
3. Create `src/videos/video-processing.queue.ts` — `VideoProcessingQueue` injecting `@InjectQueue(VIDEO_PROCESSING_QUEUE)`; `enqueue(videoId)` adds `PROCESS_VIDEO_JOB` with payload `{ video_id }` and options `jobId: videoId`, `attempts: 3`, `backoff: { type: 'exponential', delay: 5000 }`, `removeOnComplete: true`, `removeOnFail: 1000` (per `### Events/Messages → process-video`, `library-refs.md` → `bullmq`)
4. Register `BullModule.registerQueue({ name: VIDEO_PROCESSING_QUEUE })` in `VideosModule` (producer only — no `@Processor` in the API process, per `phase-03-videos/TD-03`) and provide/export `VideoProcessingQueue`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `QueueModule` | Unit: compilation test | `src/queue/queue.module.spec.ts` |
| `VideoProcessingQueue` | Integration (real Compose Redis, test queue prefix): job stored with payload `{ video_id }`, `attempts: 3`, exponential backoff; enqueueing the same id twice yields one job | `src/videos/video-processing.queue.integration-spec.ts` |

**Dependencies:** SI-03.2 — `queueConfig`; SI-03.4 — `VideosModule` exists

**Acceptance criteria:**

- The API boots connected to the `redis` Compose service (no `localhost` in container config)
- `enqueue(id)` creates a `process-video` job in `video-processing` whose data is `{ "video_id": id }` and whose options carry `attempts: 3` and exponential backoff
- Calling `enqueue(id)` twice while the first job is pending leaves exactly one job for that id
- The API process registers no worker for `video-processing` (jobs stay `waiting` while only `nestjs-api` runs)

---

### SI-03.6 — Endpoint POST /videos (Draft Pre-registration and Upload Initiation)

**Route:** POST /videos
**Test Specs:** see `nestjs-project/specs/videos-create.plan.md`
**Authorization:** Authenticated

**Description:** Start an upload: pre-register the video as a draft under the caller's channel and open a multipart upload in storage, returning the part plan the client uses to upload bytes directly to storage.

**Technical actions:**

1. Create `src/videos/dto/create-video-upload.dto.ts` — `file_name` (`@IsString`, `@Length(1, 255)`), `file_size` (`@IsInt`, `@Min(1)`, `@Max` from `MAX_UPLOAD_BYTES` via a custom validator reading `uploadConfig`), `content_type` (`@IsIn` allowlist from `### API Contracts → Validation Rules — Upload`) (per `phase-03-videos/TD-09` + revision)
2. Create `src/videos/video-upload.service.ts` — `initiate(userId, dto)`: resolve the caller's channel via `ChannelsService` (by `user_id`), pre-generate `id = crypto.randomUUID()` and `original_key = videos/{id}/original`, call `StorageService.createMultipartUpload`, insert the `Video` row with `upload_id`, retrying `generatePublicId()` on unique violation of `public_id` (max 5 attempts); on insert failure call `abortMultipartUpload` and rethrow; return `{ public_id, processing_status, publication_status, part_size, part_count }` with `part_count = ceil(file_size / UPLOAD_PART_SIZE_BYTES)` (per `phase-03-videos/TD-04`, `phase-03-videos/TD-05`, `phase-03-videos/TD-06`)
3. Expose `ChannelsService.findByUserId(userId)` if not present (channel lookup stays in `ChannelsModule`; `VideosModule` imports it)
4. Create `src/videos/videos.controller.ts` — `@Controller('videos')`, `@Post()` returning 201, user id from `@CurrentUser().sub`; Swagger decorators `@ApiTags('videos')`, `@ApiBearerAuth()`, `@ApiOperation`, `@ApiCreatedResponse` with a response DTO, `@ApiResponse` 400/401 with the error envelope (inherited `openapi-docs-nestjs/TD-01` revision)
5. Register `VideosController`, `VideoUploadService` and imports (`StorageModule`, `ChannelsModule`, `ConfigModule`) in `VideosModule`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideoUploadService` | Unit (mocked repo/storage): `part_count` math incl. exact multiple and last partial part; `public_id` collision retry then success; retries exhausted → error; insert failure → `abortMultipartUpload` called | `src/videos/video-upload.service.spec.ts` |
| `VideoUploadService` | Integration (real DB + SeaweedFS): `initiate` persists draft row with `upload_id` and a live multipart upload exists for `original_key` | `src/videos/video-upload.service.integration-spec.ts` |

**Dependencies:** SI-03.3 — `StorageService`; SI-03.4 — `Video` entity and `public_id` util

**Acceptance criteria:**

- `POST /videos` with a valid access token and `{ "file_name": "clip.mp4", "file_size": 157286400, "content_type": "video/mp4" }` returns `201` with an 11-char `public_id`, `processing_status: "uploading"`, `publication_status: "draft"`, `part_size: 67108864`, `part_count: 3`
- The created row belongs to the caller's channel and has a non-null `upload_id`
- `POST /videos` with `file_size: 10737418241` returns `400` with `error: "VALIDATION_ERROR"`
- `POST /videos` with `content_type: "application/pdf"` returns `400` with `error: "VALIDATION_ERROR"`
- `POST /videos` without a token returns `401`
- Two uploads started by the same user get different `public_id` values

---

### SI-03.7 — Endpoint POST /videos/:id/upload/parts (Presigned Part URLs)

**Route:** POST /videos/:id/upload/parts
**Test Specs:** see `nestjs-project/specs/videos-upload-parts.plan.md`
**Authorization:** Owner

**Description:** Issue presigned `UploadPart` URLs for requested part numbers so the browser uploads bytes straight to storage in parallel and can re-request URLs to resume failed parts.

**Technical actions:**

1. Add `VideoNotFoundException` (`VIDEO_NOT_FOUND`, 404), `VideoAccessDeniedException` (`VIDEO_ACCESS_DENIED`, 403) and `UploadNotInProgressException` (`UPLOAD_NOT_IN_PROGRESS`, 409) to `src/common/exceptions/domain.exception.ts` with the messages from `### Error Catalog`
2. Create `src/videos/video-access.service.ts` — `findByPublicIdOrFail(publicId)` (malformed id per `isPublicId` or missing row → `VideoNotFoundException`) and `findOwnedOrFail(publicId, userId)` (loads `channel`, compares `channel.user_id` to `userId` → `VideoAccessDeniedException`; 404 checked before 403)
3. Create `src/videos/dto/request-upload-parts.dto.ts` — `part_numbers`: `@IsArray`, `@ArrayMinSize(1)`, `@ArrayMaxSize(100)`, `@ArrayUnique`, `@IsInt({ each: true })`, `@Min(1, { each: true })`
4. Add `VideoUploadService.presignParts(userId, publicId, partNumbers)` — owner check, `processing_status === 'uploading'` else `UploadNotInProgressException`, part numbers `> part_count` → `BadRequestException` (rendered as `VALIDATION_ERROR` by the inherited filter), returns `{ parts: [{ part_number, url }], expires_at }` via `StorageService.presignUploadPart` (per `phase-03-videos/TD-04`)
5. Add `@Post(':id/upload/parts')` (`@HttpCode(200)`) to `VideosController` with Swagger decorators for 200/400/401/403/404/409

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideoAccessService` | Unit: malformed id → 404; unknown id → 404; non-owner → 403; owner → video | `src/videos/video-access.service.spec.ts` |
| `VideoUploadService.presignParts` | Unit: status ≠ `uploading` → 409; part number above `part_count` → 400; returns one URL per requested part | `src/videos/video-upload.service.spec.ts` |

**Dependencies:** SI-03.6 — `VideosController`, `VideoUploadService` and draft rows exist

**Acceptance criteria:**

- `POST /videos/:id/upload/parts` by the owner with `{ "part_numbers": [1, 2] }` returns `200` with 2 entries whose `url` starts with `S3_PUBLIC_ENDPOINT` and an `expires_at` in the future
- A `PUT` of bytes to a returned URL succeeds and the response carries an `ETag` header
- The same request by another authenticated user returns `403` with `error: "VIDEO_ACCESS_DENIED"`
- An unknown or malformed `:id` returns `404` with `error: "VIDEO_NOT_FOUND"`
- Requesting part number `part_count + 1` returns `400` with `error: "VALIDATION_ERROR"`
- Requesting parts for a video whose `processing_status` is `processing` returns `409` with `error: "UPLOAD_NOT_IN_PROGRESS"`

---

### SI-03.8 — Endpoint POST /videos/:id/upload/complete (Finalize Upload and Enqueue Processing)

**Route:** POST /videos/:id/upload/complete
**Test Specs:** see `nestjs-project/specs/videos-upload-complete.plan.md`
**Authorization:** Owner

**Description:** Finalize the multipart upload, enforce the real size limit where the bytes now live, and hand the video to background processing.

**Technical actions:**

1. Add `UploadPartsInvalidException` (`UPLOAD_PARTS_INVALID`, 400) and `FileTooLargeException` (`FILE_TOO_LARGE`, 413) to `src/common/exceptions/domain.exception.ts` with the messages from `### Error Catalog`
2. Create `src/videos/dto/complete-upload.dto.ts` — `parts`: `@IsArray`, `@ArrayMinSize(1)`, `@ValidateNested({ each: true })` of `{ part_number: @IsInt @Min(1), etag: @IsString @IsNotEmpty }`; service checks length `=== part_count` and unique `part_number` (else `BadRequestException`)
3. Add `VideoUploadService.complete(userId, publicId, parts)` — owner + `'uploading'` checks (reuse `VideoAccessService`); `StorageService.completeMultipartUpload` (map `MultipartCompletionError` → `UploadPartsInvalidException`, row unchanged); `headObject(original_key)` — if `contentLength > MAX_UPLOAD_BYTES`: `deleteObject`, set `processing_status = 'failed'`, `failure_reason = 'FILE_TOO_LARGE'`, `upload_id = null`, throw `FileTooLargeException`; otherwise set `upload_id = null`, `processing_status = 'processing'` and call `VideoProcessingQueue.enqueue(video.id)` (per `phase-03-videos/TD-04`, `phase-03-videos/TD-09`, `phase-03-videos/TD-02`)
4. Add `@Post(':id/upload/complete')` (`@HttpCode(202)`) to `VideosController` returning `{ public_id, processing_status }`, with Swagger decorators for 202/400/401/403/404/409/413

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideoUploadService.complete` | Unit (mocked storage/queue/repo): parts count mismatch → 400; storage rejection → `UPLOAD_PARTS_INVALID` and no state change; oversize → object deleted, `failed`/`FILE_TOO_LARGE`, 413, no enqueue; success → `processing` + enqueue called once | `src/videos/video-upload.service.spec.ts` |
| `VideoUploadService.complete` | Integration (real DB + SeaweedFS + Redis): full init → presigned part PUTs → complete → row `processing`, `upload_id` null, object exists, `process-video` job present | `src/videos/video-upload.service.integration-spec.ts` |

**Dependencies:** SI-03.5 — `VideoProcessingQueue`; SI-03.7 — access checks and exceptions

**Acceptance criteria:**

- `POST /videos/:id/upload/complete` by the owner with all parts' ETags returns `202` with `processing_status: "processing"`, and a `process-video` job with `{ "video_id": <uuid> }` appears in `video-processing`
- After completion, `original_key` exists in the bucket with the uploaded size and the row's `upload_id` is `null`
- Completing with a wrong ETag returns `400` with `error: "UPLOAD_PARTS_INVALID"` and the video stays `uploading`
- Completing when the stored object exceeds `MAX_UPLOAD_BYTES` returns `413` with `error: "FILE_TOO_LARGE"`, the object is removed and the video is `failed` with `failure_reason = 'FILE_TOO_LARGE'`
- Completing a video that is already `processing` returns `409` with `error: "UPLOAD_NOT_IN_PROGRESS"`
- Completing by a non-owner returns `403` with `error: "VIDEO_ACCESS_DENIED"`

---

### SI-03.9 — FFmpeg Media Service (Typed spawn Wrapper)

**Description:** Provide a small typed wrapper over the system `ffprobe`/`ffmpeg` binaries for metadata extraction, faststart MP4 output and thumbnail capture, replacing the deprecated `fluent-ffmpeg`.

**Technical actions:**

1. Create `src/media/process-runner.ts` — `runProcess(cmd, args, { timeoutMs })` around `child_process.spawn` (no shell), collecting stdout/stderr, rejecting with `MediaProcessError { cmd, exitCode, stderrTail }` on non-zero exit or timeout (per `phase-03-videos/TD-07`)
2. Create `src/media/ffmpeg.service.ts` — `probe(path)`: `ffprobe -v error -print_format json -show_format -show_streams` parsed into `ProbeResult { duration_seconds, width, height, video_codec, audio_codec, has_video }`; `isBrowserPlayable(probe)` (`h264` video and `aac` or no audio) (per `phase-03-videos/TD-07`)
3. Add `FfmpegService.toFaststartMp4(input, output, { transcode })` — `-c copy -movflags +faststart` when playable, else `-c:v libx264 -preset veryfast -crf 23 -c:a aac -movflags +faststart`; `extractThumbnail(input, output, atSeconds)` — `-ss {at} -frames:v 1 -q:v 3` JPEG (per `phase-03-videos/TD-08`, `phase-03-videos/TD-07`)
4. Create `src/media/media.module.ts` exporting `FfmpegService`; generate the fixture `test/fixtures/sample.mp4` (~100KB, 2 s, 320×240 H.264/AAC via `ffmpeg -f lavfi testsrc`/`sine`) and `test/fixtures/not-a-video.mp4` (plain text) and commit both (per `phase-03-videos/TD-11`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `runProcess` | Unit (mocked `spawn`): resolves on exit 0; rejects with `MediaProcessError` on non-zero exit and on timeout | `src/media/process-runner.spec.ts` |
| `FfmpegService` | Unit (mocked runner): ffprobe JSON → `ProbeResult` mapping, no-audio and no-video sources, copy vs transcode argument building | `src/media/ffmpeg.service.spec.ts` |
| `FfmpegService` | Integration (real ffmpeg in container + fixtures): probe `sample.mp4` (duration ≈ 2 s, 320×240, h264/aac); faststart output has `moov` before `mdat`; thumbnail JPEG created; `not-a-video.mp4` → `has_video: false` or `MediaProcessError` | `src/media/ffmpeg.service.integration-spec.ts` |

**Dependencies:** SI-03.1 — ffmpeg installed in the image

**Acceptance criteria:**

- Probing the fixture returns `duration_seconds` ≈ 2.0, `width` 320, `height` 240, `video_codec` `h264`, `audio_codec` `aac`, `has_video` true
- The faststart output of the fixture places the `moov` atom before `mdat`
- Thumbnail extraction at 0.2 s produces a non-empty JPEG of the source resolution
- Probing a non-video file reports no video stream (or a typed `MediaProcessError`), never an unhandled crash
- No `fluent-ffmpeg` or bundled-binary package is added to `package.json`

---

### SI-03.10 — Video Worker Entrypoint and process-video Processor

**Description:** Run video processing in a dedicated `video-worker` container built from the same codebase: extract metadata, produce the streamable MP4 and the thumbnail, and move the video to `ready` or `failed` — keeping FFmpeg CPU entirely off the API.

**Technical actions:**

1. Create `src/worker.ts` — `NestFactory.createApplicationContext(WorkerModule)` + `app.enableShutdownHooks()` (no HTTP server); create `src/worker.module.ts` importing `ConfigModule` (same `load` + Joi schema), `TypeOrmModule.forRootAsync` (same `databaseConfig` factory), `TypeOrmModule.forFeature([Video])`, `QueueModule`, `StorageModule`, `MediaModule`, and `BullModule.registerQueue({ name: VIDEO_PROCESSING_QUEUE })` (per `phase-03-videos/TD-03`; inherited `phase-01-configuracao-base/TD-01`)
2. Create `src/videos/processing/video-processing.processor.ts` — `@Processor(VIDEO_PROCESSING_QUEUE, { concurrency: 1 }) extends WorkerHost`; `process(job)` loads the video by `job.data.video_id` (skip when already `ready`), runs the steps of `### Events/Messages → process-video` in a per-job temp dir (download original → probe → no video stream: set `failed`/`NO_VIDEO_STREAM` and throw `UnrecoverableError` → faststart/transcode → upload `video.mp4` → thumbnail at 10% of duration → upload `thumbnail.jpg` → persist metadata + keys + `ready` → delete original), always removing the temp dir (per `phase-03-videos/TD-07`, `phase-03-videos/TD-08`, `library-refs.md` → `@nestjs/bullmq`)
3. Add failure handling to the processor — in `onApplicationBootstrap`, `this.worker.on('failed', ...)`: when `job.attemptsMade >= job.opts.attempts` and the video is not already `failed`, set `processing_status = 'failed'`, `failure_reason = 'PROCESSING_ERROR'` (per `phase-03-videos/TD-02`, `phase-03-videos/TD-05`)
4. Add npm scripts `start:worker:dev` (`nest start --watch --entryFile worker`) and `start:worker:prod` (`node dist/worker`); ensure `WorkerModule` is never imported by `AppModule`
5. Add `video-worker` service to `nestjs-project/compose.yaml` — same build/volume as `nestjs-api`, `command: npm run start:worker:dev`, `depends_on` `db` (healthy), `redis` (healthy), `seaweedfs` (healthy), no published ports (per `phase-03-videos/TD-03`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `WorkerModule` | Unit: compilation test (resolves without `AppModule`/HTTP) | `src/worker.module.spec.ts` |
| `VideoProcessingProcessor` | Integration (real DB + SeaweedFS + ffmpeg, fixture uploaded as original): job → row `ready` with duration/size/codecs, `video.mp4` and `thumbnail.jpg` exist, original deleted; `not-a-video.mp4` → `failed`/`NO_VIDEO_STREAM`; re-running a `ready` video is a no-op | `src/videos/processing/video-processing.processor.integration-spec.ts` |
| `VideoProcessingProcessor` failed handler | Unit: last attempt → `failed`/`PROCESSING_ERROR`; earlier attempts → status untouched | `src/videos/processing/video-processing.processor.spec.ts` |

**Dependencies:** SI-03.3 — storage; SI-03.4 — entity; SI-03.5 — queue; SI-03.9 — `FfmpegService`

**Acceptance criteria:**

- `docker compose up -d` starts `video-worker` alongside `nestjs-api`; the worker logs show it listening on `video-processing` and it exposes no HTTP port
- Completing an upload of the fixture video makes the video `ready` within the worker run, with `duration_seconds` ≈ 2.0, `width` 320, `height` 240, non-null `video_key` and `thumbnail_key`
- After processing, `videos/{id}/video.mp4` and `videos/{id}/thumbnail.jpg` exist and `videos/{id}/original` no longer exists
- Processing a non-video file ends with `processing_status = 'failed'`, `failure_reason = 'NO_VIDEO_STREAM'` and no retries
- A job that fails on all 3 attempts leaves the video `failed` with `failure_reason = 'PROCESSING_ERROR'`

---

### SI-03.11 — Endpoint GET /videos/:id (Video Metadata by Unique URL)

**Route:** GET /videos/:id
**Test Specs:** see `nestjs-project/specs/videos-get.plan.md`
**Authorization:** Anonymous

**Description:** Resolve a video by its unique public URL identifier and return its processing state and extracted metadata, so clients can poll processing and render the watch page.

**Technical actions:**

1. Create `src/videos/dto/video-response.dto.ts` — fields of `### API Contracts → GET /videos/:id → Response 200` verbatim (`public_id`, `file_name`, `processing_status`, `publication_status`, `duration_seconds`, `width`, `height`, `thumbnail_url`, `created_at`) with `@ApiProperty` metadata
2. Create `src/videos/videos.service.ts` — `findPublic(publicId)` via `VideoAccessService.findByPublicIdOrFail`, mapping the entity to the response DTO (`duration_seconds` as number, `thumbnail_url` = `StorageService.presignGetObject(thumbnail_key).url` or `null`); never exposes `id`, `channel_id`, storage keys or `upload_id` (per `phase-03-videos/TD-06`, `phase-03-videos/TD-08` revision)
3. Add `@Public() @Get(':id')` to `VideosController` with Swagger decorators for 200/404

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService.findPublic` | Unit: entity → DTO mapping (null metadata while processing, presigned `thumbnail_url` when ready, internal fields omitted) | `src/videos/videos.service.spec.ts` |

**Dependencies:** SI-03.7 — `VideoAccessService`; SI-03.6 — `VideosController`

**Acceptance criteria:**

- `GET /videos/:id` without a token for a `ready` video returns `200` with its `duration_seconds`, `width`, `height` and a `thumbnail_url` starting with `S3_PUBLIC_ENDPOINT`
- `GET /videos/:id` for a video still `processing` returns `200` with `processing_status: "processing"` and `null` metadata/`thumbnail_url`
- The response body never contains the internal `id`, `channel_id`, `upload_id` or storage keys
- `GET /videos/abc` (malformed) and `GET /videos/<unknown 11-char id>` return `404` with `error: "VIDEO_NOT_FOUND"`

---

### SI-03.12 — Endpoints GET /videos/:id/stream and GET /videos/:id/download

**Route:** GET /videos/:id/stream, GET /videos/:id/download
**Test Specs:** see `nestjs-project/specs/videos-stream-download.plan.md`
**Authorization:** Anonymous (stream), Owner (download)

**Description:** Deliver playback and download through short-lived presigned URLs to the processed faststart MP4, so storage serves the bytes (with native HTTP Range for seeking) and the API/BFF never stream media.

**Technical actions:**

1. Add `VideoNotReadyException` (`VIDEO_NOT_READY`, 409) to `src/common/exceptions/domain.exception.ts`
2. Add `VideosService.getStreamUrl(publicId)` — `findByPublicIdOrFail`, `processing_status !== 'ready'` → `VideoNotReadyException`, returns `{ url, expires_at }` from `presignGetObject(video_key)` (per `phase-03-videos/TD-08` + revision: open by unique URL in Phase 03)
3. Add `VideosService.getDownloadUrl(userId, publicId)` — `findOwnedOrFail`, ready check, `presignGetObject(video_key, { downloadFileName: '<file_name without extension>.mp4' })` (per `phase-03-videos/TD-08` revision: owner-only, processed MP4)
4. Add `@Public() @Get(':id/stream')` and `@Get(':id/download')` to `VideosController` with Swagger decorators (200/401/403/404/409)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService.getStreamUrl` / `getDownloadUrl` | Unit: not ready → 409; non-owner download → 403; download URL requested with attachment file name derived from `file_name` | `src/videos/videos.service.spec.ts` |

**Dependencies:** SI-03.11 — `VideosService`; SI-03.10 — `ready` videos with `video_key`

**Acceptance criteria:**

- `GET /videos/:id/stream` without a token for a `ready` video returns `200` with a `url` that answers `Range: bytes=0-1023` with `206` and `Content-Type: video/mp4`
- `GET /videos/:id/stream` for a video not yet `ready` returns `409` with `error: "VIDEO_NOT_READY"`
- `GET /videos/:id/download` by the owner returns `200` with a `url` whose response carries `Content-Disposition: attachment; filename="<name>.mp4"`
- `GET /videos/:id/download` by another authenticated user returns `403` with `error: "VIDEO_ACCESS_DENIED"`; without a token returns `401`
- Unknown `:id` returns `404` with `error: "VIDEO_NOT_FOUND"` on both endpoints

---

### SI-03.13 — Abandoned Upload Reconciliation Job

**Description:** Keep draft states truthful and storage clean when users abandon uploads: an hourly job aborts stale multipart uploads and marks their drafts `failed`, complementing the bucket lifecycle rule from SI-03.1.

**Technical actions:**

1. Create `src/videos/processing/stale-upload-reconciliation.service.ts` — `reconcile(now)`: select videos with `processing_status = 'uploading'` and `created_at < now - STALE_UPLOAD_HOURS`; per row `StorageService.abortMultipartUpload(original_key, upload_id)` (ignores `NoSuchUpload`), then set `upload_id = null`, `processing_status = 'failed'`, `failure_reason = 'UPLOAD_ABANDONED'`; returns the count (per `phase-03-videos/TD-10`)
2. Create `src/videos/processing/stale-upload-reconciliation.processor.ts` — `@Processor(VIDEO_MAINTENANCE_QUEUE) extends WorkerHost` delegating `RECONCILE_STALE_UPLOADS_JOB` to the service
3. Register `BullModule.registerQueue({ name: VIDEO_MAINTENANCE_QUEUE })`, the processor and the service in `WorkerModule`; on worker bootstrap call `queue.upsertJobScheduler(RECONCILE_STALE_UPLOADS_JOB, { pattern: '0 * * * *' }, { name: RECONCILE_STALE_UPLOADS_JOB, data: {}, opts: { attempts: 3, removeOnFail: 1000 } })` (per `library-refs.md` → `bullmq` — v6 Job Schedulers, not legacy `repeat`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `StaleUploadReconciliationService` | Integration (real DB + SeaweedFS): stale `uploading` row with live multipart → aborted and `failed`/`UPLOAD_ABANDONED`; fresh `uploading` row and `processing`/`ready` rows untouched; already-aborted upload does not throw | `src/videos/processing/stale-upload-reconciliation.service.integration-spec.ts` |

**Dependencies:** SI-03.10 — `WorkerModule`; SI-03.3 — `abortMultipartUpload`

**Acceptance criteria:**

- A video left `uploading` for longer than `STALE_UPLOAD_HOURS` becomes `failed` with `failure_reason = 'UPLOAD_ABANDONED'` and `upload_id = null` after the job runs, and its multipart upload no longer appears in `ListMultipartUploads`
- Videos `uploading` for less than `STALE_UPLOAD_HOURS`, and videos `processing`/`ready`/`failed`, are not changed
- Restarting `video-worker` keeps exactly one `reconcile-stale-uploads` scheduler in `video-maintenance`
- Running the job twice in a row changes nothing the second time

---

### SI-03.14 — OpenAPI Contract Export and HTTP Examples for Videos

**Description:** Publish the new video endpoints in the committed OpenAPI contract that the future frontend upload screen will consume, and document the upload flow for manual testing.

**Technical actions:**

1. Run `npm run openapi:export` and commit the regenerated `nestjs-project/openapi.json` containing the six `/videos` operations with their request/response schemas and error envelopes (inherited `openapi-docs-nestjs/TD-02`, `next-frontend-openapi-typing/TD-02`)
2. Extend `test/swagger.e2e-spec.ts` — assert the document lists `/videos`, `/videos/{id}/upload/parts`, `/videos/{id}/upload/complete`, `/videos/{id}`, `/videos/{id}/stream`, `/videos/{id}/download` with bearer security on the authenticated ones
3. Add the upload flow to `nestjs-project/api.http` — init → parts → (PUT to presigned URL) → complete → poll `GET /videos/:id` → stream → download

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Swagger document | E2E: video paths and security requirements present | `test/swagger.e2e-spec.ts` |

**Dependencies:** SI-03.8, SI-03.12 — all video endpoints implemented

**Acceptance criteria:**

- `nestjs-project/openapi.json` contains the six video operations with snake_case schemas matching `### API Contracts`
- Running `npm run openapi:export` again produces no diff
- `GET /api/docs` (with `SWAGGER_ENABLED=true`) lists the `videos` tag with all six operations

---

## Technical Specifications

### Data Model

#### Video

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | Internal identifier; never exposed in URLs (per `phase-03-videos/TD-06`) |
| public_id | varchar(11) | unique, not null | Crypto-random base64url (`[A-Za-z0-9_-]`), generated on insert; retry on unique-violation collision (per `phase-03-videos/TD-06`) |
| channel_id | uuid | FK → channels.id, not null | Owner channel (the uploader's channel); ownership check = `channel.user_id === JwtPayload.sub` |
| file_name | varchar(255) | not null | Declared original file name from `POST /videos` (per `phase-03-videos/TD-09`) |
| file_size | bigint | not null | Declared size in bytes, `≤ MAX_UPLOAD_BYTES` (per `phase-03-videos/TD-09`) |
| content_type | varchar(100) | not null | Declared MIME, from the allowlist (per `phase-03-videos/TD-09`) |
| processing_status | enum | not null, default `'uploading'`, values: `'uploading'`, `'processing'`, `'ready'`, `'failed'` | PostgreSQL enum type `videos_processing_status_enum` (per `phase-03-videos/TD-05`) |
| publication_status | enum | not null, default `'draft'`, values: `'draft'` | PostgreSQL enum type `videos_publication_status_enum`; Phase 04 adds `'published'` (per `phase-03-videos/TD-05`) |
| upload_id | varchar | nullable | S3 multipart `UploadId`; set on init, cleared (`null`) after `CompleteMultipartUpload` or abort (per `phase-03-videos/TD-04`) |
| original_key | varchar | not null | Storage key of the uploaded original: `videos/{id}/original` (per `phase-03-videos/TD-04`) |
| video_key | varchar | nullable | Storage key of the processed faststart MP4: `videos/{id}/video.mp4`; set when `processing_status = 'ready'` (per `phase-03-videos/TD-08`) |
| thumbnail_key | varchar | nullable | Storage key of the JPEG thumbnail: `videos/{id}/thumbnail.jpg` (per `phase-03-videos/TD-07`) |
| duration_seconds | numeric(10,3) | nullable | From `ffprobe` `format.duration` (per `phase-03-videos/TD-07`) |
| width | integer | nullable | From the first video stream (ffprobe) |
| height | integer | nullable | From the first video stream (ffprobe) |
| video_codec | varchar(50) | nullable | `codec_name` of the source video stream (ffprobe) |
| audio_codec | varchar(50) | nullable | `codec_name` of the source audio stream, `null` when the source has no audio |
| failure_reason | varchar(255) | nullable | Machine-readable reason when `processing_status = 'failed'`: `'FILE_TOO_LARGE'`, `'NO_VIDEO_STREAM'`, `'PROCESSING_ERROR'`, `'UPLOAD_ABANDONED'` |
| created_at | timestamp | not null, auto-generated | `@CreateDateColumn` |
| updated_at | timestamp | not null, auto-generated | `@UpdateDateColumn` |

**Relations:** Video → Channel (many-to-one, owning side via `channel_id`); Channel → Video (one-to-many, inverse side `videos`)
**Indexes:** `(public_id)` — unique, `(channel_id)` — FK, `(processing_status, created_at)` — stale-upload reconciliation query (per `phase-03-videos/TD-10`)
**Storage objects (bucket `S3_BUCKET`):** `videos/{id}/original` (deleted by the worker after a successful remux — download serves the processed MP4 per `phase-03-videos/TD-08` revision), `videos/{id}/video.mp4`, `videos/{id}/thumbnail.jpg`. `{id}` is the internal uuid, never the `public_id`.

---

### API Contracts

All `:id` path parameters are the video's `public_id` (11 chars, per `phase-03-videos/TD-06`); the internal uuid is never accepted nor returned. All request/response fields are snake_case (per `phase-03-videos/TD-09` revision). Media bytes never pass through these endpoints — the browser talks to storage via presigned URLs (per `phase-03-videos/TD-04`, `phase-03-videos/TD-08`). Every presigned URL is signed with `S3_PUBLIC_ENDPOINT`.

#### POST /videos (SI-03.6)

**Request headers:**
- Authorization: Bearer {access_token}
- Content-Type: application/json

**Request body:**
- file_name: string, required — 1..255 characters
- file_size: integer, required — `1 ≤ file_size ≤ MAX_UPLOAD_BYTES` (10 GiB = 10737418240)
- content_type: string, required — one of the MIME allowlist (see Validation Rules)

**Response 201:**
- public_id: string (11 chars)
- processing_status: `"uploading"`
- publication_status: `"draft"`
- part_size: integer — bytes per part (`UPLOAD_PART_SIZE_BYTES`, last part may be smaller)
- part_count: integer — `ceil(file_size / part_size)`

**Error responses:**
- 401 Unauthorized: missing or invalid access token
- 400 validation error: body fails validation (including `file_size` above `MAX_UPLOAD_BYTES` or `content_type` outside the allowlist)

Side effects: inserts the `Video` row (`processing_status = 'uploading'`, `publication_status = 'draft'`) and calls `CreateMultipartUpload` for `videos/{id}/original` in the same request; if the storage call fails the row is not persisted.

---

#### POST /videos/:id/upload/parts (SI-03.7)

**Request headers:**
- Authorization: Bearer {access_token}
- Content-Type: application/json

**Request body:**
- part_numbers: integer[], required — 1..100 unique items, each `1 ≤ n ≤ part_count`

**Response 200:**
- parts: array of `{ part_number: integer, url: string }` — presigned `UploadPart` URLs (browser `PUT`s the raw part bytes and reads the `ETag` response header)
- expires_at: string (ISO-8601) — URL expiry (`PRESIGNED_URL_TTL_SECONDS`)

**Error responses:**
- 401 Unauthorized: missing or invalid access token
- 404 VIDEO_NOT_FOUND: no video with this `public_id`
- 403 VIDEO_ACCESS_DENIED: caller does not own the video
- 409 UPLOAD_NOT_IN_PROGRESS: `processing_status` is not `'uploading'`
- 400 validation error: body fails validation (empty/duplicated list, part number out of range)

---

#### POST /videos/:id/upload/complete (SI-03.8)

**Request headers:**
- Authorization: Bearer {access_token}
- Content-Type: application/json

**Request body:**
- parts: array, required — exactly `part_count` items, each `{ part_number: integer (1..part_count), etag: string (non-empty) }`, unique `part_number`

**Response 202:**
- public_id: string
- processing_status: `"processing"`

**Error responses:**
- 401 Unauthorized: missing or invalid access token
- 404 VIDEO_NOT_FOUND: no video with this `public_id`
- 403 VIDEO_ACCESS_DENIED: caller does not own the video
- 409 UPLOAD_NOT_IN_PROGRESS: `processing_status` is not `'uploading'`
- 400 UPLOAD_PARTS_INVALID: storage rejected `CompleteMultipartUpload` (missing/invalid part or ETag); upload stays `'uploading'` so the client can re-upload parts and retry
- 413 FILE_TOO_LARGE: `HeadObject` reports `ContentLength > MAX_UPLOAD_BYTES` — object deleted, video set to `'failed'` with `failure_reason = 'FILE_TOO_LARGE'` (per `phase-03-videos/TD-09`)
- 400 validation error: body fails validation

Side effects: `CompleteMultipartUpload` → `HeadObject` size check → `upload_id = null`, `processing_status = 'processing'` → enqueue `process-video` job (see Events/Messages).

---

#### GET /videos/:id (SI-03.11)

**Request headers:**
- Authorization: Bearer {access_token} — optional (public endpoint)

**Response 200:**
- public_id: string
- file_name: string
- processing_status: `"uploading" | "processing" | "ready" | "failed"`
- publication_status: `"draft"`
- duration_seconds: number | null
- width: integer | null
- height: integer | null
- thumbnail_url: string | null — presigned GET of `thumbnail_key`, `null` until thumbnail exists
- created_at: string (ISO-8601)

**Error responses:**
- 404 VIDEO_NOT_FOUND: no video with this `public_id`

---

#### GET /videos/:id/stream (SI-03.12)

**Request headers:**
- Authorization: Bearer {access_token} — optional (public endpoint; open by unique URL per `phase-03-videos/TD-08` revision)

**Response 200:**
- url: string — presigned GET of `video_key` (storage answers HTTP `Range` requests natively for seeking)
- expires_at: string (ISO-8601)

**Error responses:**
- 404 VIDEO_NOT_FOUND: no video with this `public_id`
- 409 VIDEO_NOT_READY: `processing_status` is not `'ready'`

---

#### GET /videos/:id/download (SI-03.12)

**Request headers:**
- Authorization: Bearer {access_token}

**Response 200:**
- url: string — presigned GET of `video_key` signed with `ResponseContentDisposition: attachment; filename="{file_name base}.mp4"` (same processed object as streaming, per `phase-03-videos/TD-08` revision)
- expires_at: string (ISO-8601)

**Error responses:**
- 401 Unauthorized: missing or invalid access token
- 404 VIDEO_NOT_FOUND: no video with this `public_id`
- 403 VIDEO_ACCESS_DENIED: caller does not own the video
- 409 VIDEO_NOT_READY: `processing_status` is not `'ready'`

---

#### Validation Rules — Upload

- `file_name`: required, string, 1..255 characters
- `file_size`: required, integer, `≥ 1`, `≤ MAX_UPLOAD_BYTES` (env, default `10737418240`)
- `content_type`: required, one of `video/mp4`, `video/quicktime`, `video/webm`, `video/x-matroska`, `video/x-msvideo` (declared hint only — `ffprobe` in the worker is the authoritative format check, per `phase-03-videos/TD-09`)
- `part_numbers`: required, array of 1..100 unique integers, each within `1..part_count`
- `parts`: required, array with exactly `part_count` items of `{ part_number, etag }`, unique `part_number`, `etag` non-empty string
- `:id` path param: string matching `^[A-Za-z0-9_-]{11}$`; any other value → 404 VIDEO_NOT_FOUND

---

### Authorization Matrix

Owner = authenticated user whose channel owns the video (`video.channel.user_id === JwtPayload.sub`). Ownership is checked after existence (404 before 403). Public endpoints use `@Public()` to bypass the global `JwtAuthGuard`.

| Endpoint | Anonymous | Authenticated | Owner | Notes |
|----------|-----------|---------------|-------|-------|
| POST /videos | ✗ | ✓ | — | Video is created under the caller's channel |
| POST /videos/:id/upload/parts | ✗ | ✗ | ✓ | |
| POST /videos/:id/upload/complete | ✗ | ✗ | ✓ | |
| GET /videos/:id | ✓ | ✓ | ✓ | Open by unique URL in Phase 03 (per `phase-03-videos/TD-08` revision) |
| GET /videos/:id/stream | ✓ | ✓ | ✓ | Open by unique URL; only `'ready'` videos (per `phase-03-videos/TD-08` revision) |
| GET /videos/:id/download | ✗ | ✗ | ✓ | Owner-only (per `phase-03-videos/TD-08` revision) |

---

### Error Catalog

Error response format inherited from phase-02-auth/TD-07: `{ statusCode, error, message }`; new codes are `DomainException` subclasses in `src/common/exceptions/domain.exception.ts`.

| Code | HTTP | Message | Trigger |
|------|------|---------|---------|
| VIDEO_NOT_FOUND | 404 | Video not found | Any `/videos/:id*` endpoint with an unknown or malformed `public_id` |
| VIDEO_ACCESS_DENIED | 403 | You do not own this video | Owner-only endpoint called by an authenticated non-owner |
| UPLOAD_NOT_IN_PROGRESS | 409 | Upload is not in progress for this video | `/upload/parts` or `/upload/complete` when `processing_status ≠ 'uploading'` |
| UPLOAD_PARTS_INVALID | 400 | Uploaded parts are invalid or incomplete | `CompleteMultipartUpload` rejected by storage (`InvalidPart`, `InvalidPartOrder`, `NoSuchUpload`) |
| FILE_TOO_LARGE | 413 | Uploaded file exceeds the maximum allowed size | `HeadObject.ContentLength > MAX_UPLOAD_BYTES` after completion (per `phase-03-videos/TD-09`) |
| VIDEO_NOT_READY | 409 | Video is not ready for playback | `/stream` or `/download` when `processing_status ≠ 'ready'` |

---

### Events/Messages

#### process-video (queue `video-processing`)

**Payload:**

```json
{ "video_id": "uuid" }
```

**Producer:** `VideoProcessingQueue` (API, `VideosModule`) — enqueued by `POST /videos/:id/upload/complete` (per `phase-03-videos/TD-02`)
**Consumer:** `VideoProcessingProcessor` (`WorkerModule`, `video-worker` container only — never registered in `AppModule`) (per `phase-03-videos/TD-03`)
**Trigger:** upload completed and size-verified; `processing_status` just set to `'processing'`
**Job options:** `jobId = video_id` (idempotent — re-adding while pending is a no-op), `attempts: 3`, `backoff: { type: 'exponential', delay: 5000 }`, `removeOnComplete: true`, `removeOnFail: 1000`; worker `concurrency: 1` (FFmpeg is CPU-bound)
**Processing steps:** download `original_key` to a temp dir → `ffprobe` (no video stream → `failed`/`NO_VIDEO_STREAM`, no retry via `UnrecoverableError`) → `ffmpeg` remux `-c copy -movflags +faststart` to MP4 when source is H.264/AAC-compatible, else transcode to H.264/AAC → upload `video.mp4` → `ffmpeg` single frame at ~10% of duration → upload `thumbnail.jpg` → persist metadata + keys, `processing_status = 'ready'` → delete `original_key` → remove temp dir (per `phase-03-videos/TD-07`, `phase-03-videos/TD-08`)
**Failure:** after the last attempt, the worker `failed` handler sets `processing_status = 'failed'`, `failure_reason = 'PROCESSING_ERROR'`
**Delivery semantics:** at-least-once (per `phase-03-videos/TD-02`) — processor is idempotent per `video_id` (skips when already `'ready'`, overwrites output keys)

#### reconcile-stale-uploads (queue `video-maintenance`)

**Payload:**

```json
{}
```

**Producer:** `upsertJobScheduler('reconcile-stale-uploads', { pattern: '0 * * * *' })` called on worker bootstrap (idempotent by scheduler id; BullMQ v6 Job Schedulers, per `library-refs.md`) (per `phase-03-videos/TD-10`)
**Consumer:** `StaleUploadReconciliationProcessor` (`WorkerModule`)
**Trigger:** hourly
**Behavior:** for videos with `processing_status = 'uploading'` and `created_at < now() - STALE_UPLOAD_HOURS` (default 48): `AbortMultipartUpload` (ignore `NoSuchUpload`), set `upload_id = null`, `processing_status = 'failed'`, `failure_reason = 'UPLOAD_ABANDONED'`. Complements the bucket lifecycle rule `AbortIncompleteMultipartUpload` (`DaysAfterInitiation: 2`), which reclaims orphan parts the DB never knew about (per `phase-03-videos/TD-10`)
**Delivery semantics:** at-least-once; idempotent (re-running only touches rows still `'uploading'`)

---

## Dependency Map

```
SI-03.1 (root — deps, ffmpeg image, SeaweedFS, Redis)
├── SI-03.2 — depends on SI-03.1 (env keys and services must exist to boot)
│   ├── SI-03.3 — depends on SI-03.2 (storageConfig)
│   └── SI-03.5 — depends on SI-03.2 + SI-03.4 (queueConfig; producer lives in VideosModule)
└── SI-03.9 — depends on SI-03.1 (ffmpeg in the image)
SI-03.4 (root — Video entity, migration, VideosModule)
SI-03.6 — depends on SI-03.3 + SI-03.4 (storage multipart + Video row)
└── SI-03.7 — depends on SI-03.6 (controller/service + draft rows; adds access checks)
    ├── SI-03.8 — depends on SI-03.5 + SI-03.7 (enqueue + access checks)
    └── SI-03.11 — depends on SI-03.6 + SI-03.7 (controller + VideoAccessService)
SI-03.10 — depends on SI-03.3 + SI-03.4 + SI-03.5 + SI-03.9 (worker needs storage, entity, queue, ffmpeg)
├── SI-03.12 — depends on SI-03.10 + SI-03.11 (ready videos with video_key + VideosService)
└── SI-03.13 — depends on SI-03.3 + SI-03.10 (abort multipart + WorkerModule)
SI-03.14 — depends on SI-03.8 + SI-03.12 (all endpoints implemented before export)
```

---

## Deliverables

- [ ] SI-03.1 — Infra: Dependencies, FFmpeg Image, SeaweedFS and Redis Services
- [ ] SI-03.2 — Configuration Namespaces for Storage, Queue and Upload
- [ ] SI-03.3 — Storage Module (S3 API Adapter)
- [ ] SI-03.4 — Video Entity, Public ID Generator and Migration
- [ ] SI-03.5 — Queue Infrastructure and Video Processing Producer
- [ ] SI-03.6 — Endpoint POST /videos (Draft Pre-registration and Upload Initiation)
- [ ] SI-03.7 — Endpoint POST /videos/:id/upload/parts (Presigned Part URLs)
- [ ] SI-03.8 — Endpoint POST /videos/:id/upload/complete (Finalize Upload and Enqueue Processing)
- [ ] SI-03.9 — FFmpeg Media Service (Typed spawn Wrapper)
- [ ] SI-03.10 — Video Worker Entrypoint and process-video Processor
- [ ] SI-03.11 — Endpoint GET /videos/:id (Video Metadata by Unique URL)
- [ ] SI-03.12 — Endpoints GET /videos/:id/stream and GET /videos/:id/download
- [ ] SI-03.13 — Abandoned Upload Reconciliation Job
- [ ] SI-03.14 — OpenAPI Contract Export and HTTP Examples for Videos

**Full test suites:**

- [ ] Backend unit + integration tests pass (`docker compose exec nestjs-api npm test -- --runInBand`)
- [ ] E2E tests pass (`docker compose exec nestjs-api npm run test:e2e`)
- [ ] Type check passes (`docker compose exec nestjs-api npx tsc --noEmit`)
- [ ] Lint passes (`docker compose exec nestjs-api npm run lint`)
- [ ] Project builds successfully, including the worker entrypoint (`docker compose exec nestjs-api npm run build` → `dist/main.js` and `dist/worker.js`)
