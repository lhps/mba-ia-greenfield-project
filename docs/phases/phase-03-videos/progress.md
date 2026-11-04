# phase-03-videos — Progress

**Status:** in_progress
**SIs:** 6/14 completed

### SI-03.1 — Infra: Dependencies, FFmpeg Image, SeaweedFS and Redis Services
- **Status:** completed
- **Tests:** 2 passing
- **Observations:**
  - MinIO images (`minio/minio`, `quay.io/minio/minio`, `minio/mc`, `bitnami/minio`) are no longer pullable; after spikes (RustFS 1.0.4, SeaweedFS 4.51) the user chose SeaweedFS → TD-12 supersedes TD-01; TD-04 got a revision (SDK checksum `WHEN_REQUIRED`, otherwise presigned browser PUT fails with `400 BadDigest`); plan SI-03.1/03.2/03.3, context.md and library-refs.md updated accordingly.
  - Bucket bootstrap is `src/storage/bucket-bootstrap.ts` + `npm run storage:bootstrap` (one-shot `storage-init` Compose service), replacing the `mc`-based init.
  - SeaweedFS healthcheck targets `127.0.0.1:8333` — busybox `wget` resolves `localhost` to `::1`, where weed does not listen.
  - Storage/queue env block added to `.env.example` here (needed by `storage-init`), ahead of SI-03.2 action 5; the CLI reads env directly and moves to `storageConfig()` in SI-03.2.
  - Verified: `seaweedfs`/`redis` healthy, `storage-init` exit 0 (rerun idempotent), ffmpeg/ffprobe 5.1.9 in the image, host preflight from `http://localhost:3001` → 200 with `Access-Control-Expose-Headers: ETag`.

### SI-03.2 — Configuration Namespaces for Storage, Queue and Upload
- **Status:** completed
- **Tests:** 12 passing (env.validation.spec + env.validation.integration-spec) + app.e2e boot check
- **Observations:**
  - Existing `env.validation.integration-spec.ts` needed the new required `S3_*` keys in its `requiredEnv` fixture (schema change made them mandatory). That file is a pure-unit test despite its `integration-spec` suffix — pre-existing naming, left as is.
  - `bootstrap-buckets.cli.ts` now reads `storageConfig()` (same pattern as `data-source.ts` + `databaseConfig()`).
  - Users with an older local `.env` must append the storage/queue/upload block from `.env.example` (`S3_*` keys are required at boot).

### SI-03.3 — Storage Module (S3 API Adapter)
- **Status:** completed
- **Tests:** 6 passing (storage.module.spec + storage.service.integration-spec); `src/storage` total 8 with SI-03.1
- **Observations:**
  - `uploadFile` uses SDK multipart in `UPLOAD_PART_SIZE_BYTES` parts (no `@aws-sdk/lib-storage` dependency) — processed MP4s can exceed the 5 GiB single-PUT limit.
  - Added test helper `src/test/presigned-request.ts`: presigned URLs sign `Host: localhost:8333` (`S3_PUBLIC_ENDPOINT`), so tests inside the container connect to `S3_ENDPOINT` while keeping the signed Host header (rewriting the URL host breaks SigV4). Reused by later E2E specs.
  - `StorageModule.onModuleDestroy` destroys both `S3Client`s (avoids adding open handles to the known Jest hang).

### SI-03.4 — Video Entity, Public ID Generator and Migration
- **Status:** completed
- **Tests:** 127 passing (17 suites: src/videos, migrations spec, and src/auth|users|channels regression)
- **Observations:**
  - Fixed pre-existing `src/database/migrations.integration-spec.ts` (user choice): drops managed enum types in `beforeAll`, includes `CreateVideos1793753568714`, revert test now asserts `videos` + its enum types are removed. Reruns no longer wipe the DB.
  - `Channel.videos` inverse `@OneToMany` added per `.claude/rules/nestjs-entities.md` ("always define both sides"); this forced adding `Video` to the duplicated `ALL_ENTITIES` arrays of 10 existing test files (mechanical, entity-list only). Centralizing those arrays is a possible follow-up refactor (out of scope).
  - `file_size` (bigint) and `duration_seconds` (numeric) use value transformers so the entity exposes numbers (pg returns strings for both).
  - Status/reason literals live in `src/videos/videos.constants.ts` (`PROCESSING_STATUS`, `PUBLICATION_STATUS`, `FAILURE_REASON`).

### SI-03.5 — Queue Infrastructure and Video Processing Producer
- **Status:** completed
- **Tests:** 19 passing (src/queue, video-processing.queue.integration-spec, src/config) + app.e2e boot
- **Observations:**
  - `@nestjs/bullmq` pinned to `^11.0.5` instead of the planned `^12.0.0`: v12 (and `@nestjs/bull-shared` 12) is ESM-only and cannot be loaded by the project's CommonJS Jest. 11.0.5 supports Nest 11 + bullmq 6. Plan SI-03.1 and library-refs.md updated.
  - Added `ioredis@^5`: bullmq 6 made it an optional peer (not installed transitively); `^6` conflicts with typeorm 0.3.28's optional peer `ioredis ^5`.
  - Added `QUEUE_PREFIX` (default `bull`) to queue config so integration tests use an isolated `bull-test` prefix on the shared Redis.

### SI-03.6 — Endpoint POST /videos (Draft Pre-registration and Upload Initiation)
- **Status:** completed
- **Tests:** 13 passing (8 unit/integration in video-upload.service + 5 E2E in test/videos-create.e2e-spec.ts)
- **Observations:**
  - `file_size > MAX_UPLOAD_BYTES` is checked in the service (env-driven limit cannot live in a static DTO decorator) and thrown as new domain exception `InvalidUploadRequestException` → `{ statusCode: 400, error: "VALIDATION_ERROR" }`, keeping the plan's error contract while respecting the "services never throw Nest HTTP exceptions" rule. SI-03.7/03.8 reuse it instead of the planned `BadRequestException`.
  - Added `ChannelsService.findByUserId` (plan action 3).
  - Shared E2E helper `test/helpers/videos-e2e.ts` (AppModule bootstrap like main.ts, test bucket, `bull-e2e` queue prefix, confirmed-user login) for all video specs.

### SI-03.7 — Endpoint POST /videos/:id/upload/parts (Presigned Part URLs)
- **Status:** pending
- **Tests:** —
- **Observations:** none

### SI-03.8 — Endpoint POST /videos/:id/upload/complete (Finalize Upload and Enqueue Processing)
- **Status:** pending
- **Tests:** —
- **Observations:** none

### SI-03.9 — FFmpeg Media Service (Typed spawn Wrapper)
- **Status:** pending
- **Tests:** —
- **Observations:** none

### SI-03.10 — Video Worker Entrypoint and process-video Processor
- **Status:** pending
- **Tests:** —
- **Observations:** none

### SI-03.11 — Endpoint GET /videos/:id (Video Metadata by Unique URL)
- **Status:** pending
- **Tests:** —
- **Observations:** none

### SI-03.12 — Endpoints GET /videos/:id/stream and GET /videos/:id/download
- **Status:** pending
- **Tests:** —
- **Observations:** none

### SI-03.13 — Abandoned Upload Reconciliation Job
- **Status:** pending
- **Tests:** —
- **Observations:** none

### SI-03.14 — OpenAPI Contract Export and HTTP Examples for Videos
- **Status:** pending
- **Tests:** —
- **Observations:** none

## Pre-phase baseline (2026-11-03)

- E2E: 52/52 passing (with intact DB). Unit + integration: 143/144 — `src/database/migrations.integration-spec.ts` fails on any already-migrated DB (drops tables but not enum types, then leaves DB without tables). Fix folded into SI-03.4 by user choice.
- Out of scope (separate task): unit/integration Jest run never exits (open handle) — suites verified with `--forceExit` during this phase.
- Out of scope (separate task): `.env.example` has unquoted `MAIL_FROM="StreamTube" <noreply@streamtube.com>`, which breaks Docker Compose `.env` parsing (documented pitfall in `nestjs-project/CLAUDE.md`).
- Out of scope (separate task): `testing-guide-nestjs-project/references/file-conventions.md` says integration suffix is `*.integration.spec.ts`, but `nestjs-project/CLAUDE.md` and Jest config use `*.integration-spec.ts`.
