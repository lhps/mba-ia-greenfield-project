# phase-03-videos — Progress

**Status:** completed
**SIs:** 14/14 completed

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
- **Status:** completed
- **Tests:** 15 unit/integration (video-upload.service + video-access.service) + 6 E2E (test/videos-upload-parts.e2e-spec.ts); create E2E re-run green
- **Observations:**
  - Part numbers above `part_count` raise `InvalidUploadRequestException` (`VALIDATION_ERROR`, 400) instead of the planned `BadRequestException` (rule: services never throw Nest HTTP exceptions).

### SI-03.8 — Endpoint POST /videos/:id/upload/complete (Finalize Upload and Enqueue Processing)
- **Status:** completed
- **Tests:** 37 passing in src/videos (incl. full init→PUT→complete→job integration) + 5 E2E (test/videos-upload-complete.e2e-spec.ts); create/parts E2E re-run green (11)
- **Observations:**
  - Parts-count / duplicate-part checks use `InvalidUploadRequestException` (`VALIDATION_ERROR`) instead of the planned `BadRequestException`.
  - The 413 E2E boots a second app with `MAX_UPLOAD_BYTES=1024` and restores the env afterwards.

### SI-03.9 — FFmpeg Media Service (Typed spawn Wrapper)
- **Status:** completed
- **Tests:** 17 passing (process-runner.spec, ffmpeg.service.spec, ffmpeg.service.integration-spec with real ffmpeg 5.1.9)
- **Observations:**
  - `runProcess` was implemented as an injectable `ProcessRunner` class (same behavior) so `FfmpegService` can be unit-tested with a mocked runner.
  - Fixtures committed: `test/fixtures/sample.mp4` (32 KB, 2 s, 320×240 H.264/AAC, generated with lavfi testsrc+sine) and `test/fixtures/not-a-video.mp4` (plain text).

### SI-03.10 — Video Worker Entrypoint and process-video Processor
- **Status:** completed
- **Tests:** 7 passing (worker.module.spec, video-processing.processor.spec, video-processing.processor.integration-spec with real DB + SeaweedFS + ffmpeg)
- **Observations:**
  - Per layer-separation rules the processing steps live in `VideoProcessingService`; `VideoProcessingProcessor` only delegates and handles the BullMQ `failed` event (logs instead of rethrowing — background context).
  - `markProcessingFailed` never overwrites an existing `failed` row, so `NO_VIDEO_STREAM` (UnrecoverableError) is kept.
  - `video-worker` Compose service verified running with no published ports and the "Video worker started (no HTTP server)" log. The end-to-end API → queue → real worker run was not exercised manually; the processing path is covered by the processor integration test.
  - Whether ffprobe returns "no video stream" or exits non-zero for the text fixture is environment-dependent; the integration test accepts both outcomes (NO_VIDEO_STREAM without retry, or MediaProcessError → retried → PROCESSING_ERROR).

### SI-03.11 — Endpoint GET /videos/:id (Video Metadata by Unique URL)
- **Status:** completed
- **Tests:** 2 unit (videos.service.spec) + 4 E2E (test/videos-get.e2e-spec.ts)
- **Observations:**
  - Added `seedVideo` to the shared E2E helper for read-side scenarios (rows inserted directly, as the spec Setup describes).

### SI-03.12 — Endpoints GET /videos/:id/stream and GET /videos/:id/download
- **Status:** completed
- **Tests:** 6 unit (videos.service.spec) + 5 E2E (test/videos-stream-download.e2e-spec.ts: Range 206 `video/mp4`, attachment disposition, byte-identical download)
- **Observations:** none

### SI-03.13 — Abandoned Upload Reconciliation Job
- **Status:** completed
- **Tests:** 3 integration (stale-upload-reconciliation.service, real DB + SeaweedFS) + worker.module compile re-run
- **Observations:**
  - Scheduler is registered in `StaleUploadReconciliationProcessor.onApplicationBootstrap` via `upsertJobScheduler`; verified on the real `video-worker`: after two restarts Redis holds exactly one `reconcile-stale-uploads` scheduler.

### SI-03.14 — OpenAPI Contract Export and HTTP Examples for Videos
- **Status:** completed
- **Tests:** 7 passing (test/swagger.e2e-spec.ts, incl. new video-operations/security assertion)
- **Observations:**
  - `openapi.json` regenerated (+619 lines, six `/videos` operations with per-status responses); a second `npm run openapi:export` produces an identical file.
  - The frontend's committed `types.gen.ts` sync/CI freshness check (next-frontend-openapi-typing TD-02/TD-03) is a next-frontend concern and was not run here.

## Pre-phase baseline (2026-11-03)

- E2E: 52/52 passing (with intact DB). Unit + integration: 143/144 — `src/database/migrations.integration-spec.ts` fails on any already-migrated DB (drops tables but not enum types, then leaves DB without tables). Fix folded into SI-03.4 by user choice.
- Out of scope (separate task): unit/integration Jest run never exits (open handle) — suites verified with `--forceExit` during this phase.
- Out of scope (separate task): `.env.example` has unquoted `MAIL_FROM="StreamTube" <noreply@streamtube.com>`, which breaks Docker Compose `.env` parsing (documented pitfall in `nestjs-project/CLAUDE.md`).
- Out of scope (separate task): `testing-guide-nestjs-project/references/file-conventions.md` says integration suffix is `*.integration.spec.ts`, but `nestjs-project/CLAUDE.md` and Jest config use `*.integration-spec.ts`.

## Final verification (2026-11-03)

- Unit + integration: 231/231 passing (42 suites, `--runInBand --forceExit`).
- E2E: 78/78 passing (8 suites) with `--runInBand`. Deliverables command `npm run test:e2e` without `--runInBand` fails 16 tests (suites truncate shared DB concurrently) — `test/jest-e2e.json` lacks a serial setting despite `nestjs-project/CLAUDE.md` saying "already configured" (separate task).
- Type check: exit 0 after fix — `test/helpers/videos-e2e.ts` read private `AuthService.mailService`; now `app.get(MailService)`.
- Build: OK, `dist/main.js` + `dist/worker.js` emitted.
- Lint: 68 errors + 9 warnings in 12 Phase 03 test files fixed (typed `res.body` / mock-call casts, no eslint-disable). The 150 pre-existing errors (present at `8957334`: auth/channels/mail/filters/env/users specs, `test/auth.e2e-spec.ts`, `src/channels/channels.service.ts`, `src/test/create-test-data-source.ts`) were also fixed by user choice — `npm run lint` exits 0. Only non-test source change: `channels.service.ts` types the PG error as `QueryFailedError & { code?: unknown; detail?: unknown }` instead of `any` (same behavior).
