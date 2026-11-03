---
scope_type: phase
related_phases: [3]
status: decided
date: 2026-10-21
scope_description: "Backend + infra for video upload and processing: object storage, job queue, background worker, large-file upload protocol, video lifecycle model, unique public IDs, FFmpeg integration, streaming/download delivery, upload limits, abandoned-upload cleanup and integration-test strategy for the new infra services."
---

# Technical Decisions — Fase 03: Upload e Processamento de Vídeos

_Subprojects in scope:_

- `nestjs-project/` — receives the new `videos` module, storage/queue integration, the video worker entrypoint and the new Compose services (object storage, Redis/queue, worker). Covered by TD-01..TD-11.
- `next-frontend/` — **no open decision in this document.** The upload screen and the player are out of this research by user choice (2026-10-21: "Backend + infra"); they will get a complementary `scope_type: ad-hoc` doc with `related_phases: [3]` (same pattern as Phase 02). Cross-layer contracts that the frontend will consume (upload protocol TD-04, public video ID TD-06, streaming/download delivery TD-08, status model TD-05) **are decided here once**, and the frontend doc inherits them.

---

## TD-01: Object Storage Backend (S3-compatible service)

**Scope:** Repo-wide

**Capability:** Serviço de armazenamento de arquivos (vídeos e thumbnails)

**Context:** The architecture diagram names "S3 or MinIO". Since Oct/2025 MinIO stopped publishing community Docker images and binaries; the repo went to maintenance mode (Dec/2025) and was archived (Feb/2026). Old `minio/minio` tags remain pullable, but receive no fixes. The backend code will talk to storage exclusively through the S3 API (`@aws-sdk/client-s3` v3 + `@aws-sdk/s3-request-presigner`), so this TD only picks the **Compose service** that implements it in dev/test — swapping later is an env change, not a code change.

**Options:**

### Option A: MinIO pinned to the last community image
- `minio/minio:RELEASE.2025-xx` pinned in `compose.yaml`, plus `minio/mc` one-shot to create the bucket.
- **Pros:** de-facto reference S3 emulator; full support for presigned multipart, CORS, lifecycle rules (`AbortIncompleteMultipartUpload`), web console; matches the architecture diagram and most tutorials/course material.
- **Cons:** frozen upstream — no security fixes; console stripped in late community releases; long-term it is a dead dependency (acceptable only for dev/test).

### Option B: SeaweedFS (`weed server -s3`)
- Single container exposing an S3 gateway; actively maintained, Apache-2.0.
- **Pros:** maintained; light; supports multipart and presigned URLs.
- **Cons:** S3 compatibility is partial (lifecycle rules and some bucket APIs differ); IAM/credentials config via JSON file; less documented for presigned-multipart-from-browser flows.

### Option C: Garage
- Rust S3-compatible store designed for self-hosting; requires an initial layout/key bootstrap step.
- **Pros:** actively maintained; small footprint; designed for self-hosting.
- **Cons:** extra bootstrap (`garage layout assign`, `garage key create`) in Compose; no lifecycle rules; CORS via separate command — more moving parts for a study project.

### Option D: Local filesystem volume (no S3)
- Files written to a Docker volume shared between API and worker; API serves them.
- **Pros:** zero new services.
- **Cons:** contradicts the architecture (storage container); forces all bytes through the API (kills TD-04 presigned options and TD-08 direct delivery); no path to production storage.

**Recommendation:** Option A — the code is coupled only to the S3 API, so the frozen-upstream risk is confined to the dev/test container; MinIO is the only option that supports every S3 feature this phase relies on (browser presigned multipart, CORS, lifecycle abort rule) with zero bootstrap friction. Revisit (Option B) if the project ever targets a self-hosted production storage.

**Decision:** A (MinIO pinned to the last community image; code talks only S3 API)
**Libraries:** `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`

---

## TD-02: Background Job Queue

**Scope:** Backend

**Capability:** Serviço de processamento em segundo plano (filas)

**Context:** The "Message Queue (TBD)" container must be chosen. The API publishes a "process video" job after upload completes; the worker consumes it, retries on transient failures and reports failure permanently after N attempts.

**Options:**

### Option A: BullMQ + Redis (`@nestjs/bullmq`)
- Official Nest integration (`BullModule.forRoot/registerQueue`, `@Processor` + `WorkerHost`). Redis container added to Compose.
- **Pros:** first-party Nest docs; built-in attempts + exponential backoff, stalled-job detection, progress (`job.updateProgress`), concurrency, sandboxed processors; huge adoption.
- **Cons:** new infra service (Redis); job state lives outside PostgreSQL (no transactional enqueue with the video row).

### Option B: pg-boss (PostgreSQL-backed)
- Queue tables in the existing PostgreSQL, `SKIP LOCKED` delivery; no Nest official module (community wrapper or manual provider).
- **Pros:** no new service; can enqueue inside the same DB transaction that marks the video uploaded; retries, DLQ, cron.
- **Cons:** no first-party Nest integration; polling load on the main DB while processing 10GB videos; smaller ecosystem.

### Option C: RabbitMQ (`@nestjs/microservices` RMQ transport)
- Broker-based messaging; worker as a Nest microservice.
- **Pros:** true message broker, good for multi-language consumers.
- **Cons:** retries/backoff/DLQ must be hand-built (dead-letter exchanges); heavier container; Nest RMQ transport is request/event oriented, not a job queue (no progress, no attempts).

**Recommendation:** Option A — `@nestjs/bullmq` is the documented Nest path and gives retries/backoff/stalled-recovery out of the box, which matter for long FFmpeg jobs; the extra Redis container is cheap in Compose and the transactional-enqueue gap is covered by TD-05's status model (the job is idempotent and keyed by video id).

**Decision:** A (BullMQ + Redis via `@nestjs/bullmq`)
**Libraries:** `@nestjs/bullmq`, `bullmq`

---

## TD-03: Video Worker Deployment Model

**Scope:** Repo-wide

**Capability:** Transversal — covers: Serviço de processamento em segundo plano (filas); Processamento automático do vídeo após upload (extração de duração e metadados); Geração automática de thumbnail a partir de um frame do vídeo

**Context:** The architecture defines a separate "Video Worker (FFmpeg)" container. FFmpeg is CPU-heavy; running it inside the HTTP process would hurt API latency ("sem impacto na performance"). Depends on TD-02.

**Options:**

### Option A: Same codebase, separate entrypoint and container
- `src/worker.ts` boots `NestFactory.createApplicationContext(WorkerModule)` (no HTTP); Compose service `video-worker` uses the same image + `ffmpeg` installed, command `node dist/worker` / `start:worker:dev`. Processors registered only in `WorkerModule`.
- **Pros:** API never runs FFmpeg; full DI in processors (entities, config, storage service reused); independent scaling; one repo/lint/test setup.
- **Cons:** two processes to start in dev; module boundaries must keep processors out of `AppModule`.

### Option B: In-process processor inside the API
- `@Processor` registered in the API module; jobs run in the API event loop (FFmpeg spawned as child process).
- **Pros:** simplest; nothing new to run.
- **Cons:** contradicts the architecture; FFmpeg CPU competes with request handling; API restarts kill running jobs.

### Option C: Sandboxed processors forked by the API
- `BullModule.registerQueue({ processors: [path] })` — BullMQ forks child processes from the API container.
- **Pros:** crash isolation; no extra container.
- **Cons:** no DI in sandboxed files (must re-create DB/S3 clients manually); still same container/CPU as the API; FFmpeg must be in the API image.

**Recommendation:** Option A — it is the only option that honors the C4 container split and keeps FFmpeg CPU off the API, while keeping DI and shared code; cost is one extra Compose service.

**Decision:** A (Same codebase, separate entrypoint and container)

---

## TD-04: Large-file Upload Protocol (up to 10GB)

**Scope:** Cross-layer

**Capability:** Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance

**Context:** 10GB must not pass through Node memory nor through the Next.js BFF (strict BFF model would otherwise route every byte through a Route Handler, then through Nest). The handshake shape is consumed by the future frontend upload screen, so it is decided once here. Depends on TD-01.

**Options:**

### Option A: S3 presigned multipart upload (browser → storage direct)
- `POST /videos` creates draft + `CreateMultipartUpload`; API returns presigned `UploadPart` URLs (per part or in batches); browser PUTs parts directly to storage; `POST /videos/:id/upload/complete` with ETags → API `CompleteMultipartUpload` → enqueue job. BFF only proxies the small JSON handshake calls.
- **Pros:** zero upload bytes through API/BFF; parallel parts; resumable per part (retry failed part); native S3 limits (5MiB–5GiB part, 10k parts); standard production pattern.
- **Cons:** browser talks to storage host (needs CORS + a public storage endpoint distinct from the Docker-internal one — e.g. `S3_ENDPOINT=http://minio:9000` for the API and `S3_PUBLIC_ENDPOINT=http://localhost:9000` for signing); client-side part orchestration code.

### Option B: tus resumable protocol (`@tus/server` + `@tus/s3-store`) in the API
- tus server mounted in Nest; client uses `tus-js-client`/Uppy; S3Store streams chunks to storage.
- **Pros:** standardized resumable protocol, robust client libs, resume across page reloads.
- **Cons:** every byte flows browser → BFF → Nest → storage (unless the BFF is bypassed, which breaks the BFF rule); Nest must stream 10GB; S3Store needs a shared KV cache for multi-instance; heavier coupling with Express raw request handling.

### Option C: Streaming multipart/form-data through the API
- Single `POST` with `busboy` piping the file stream to `@aws-sdk/lib-storage` `Upload`.
- **Pros:** simplest client (plain `<form>`/`fetch`).
- **Cons:** no resume — a network blip at 9GB restarts the whole upload; ties an API connection for the whole transfer; BFF must stream 10GB too; request timeouts.

**Recommendation:** Option A — it is the only option where the API and the Next BFF never touch the video bytes, which is exactly "10GB sem impacto na performance"; resumability per part covers the realistic failure modes. The public-endpoint env split is a known, documented cost of Docker networking.

**Decision:** A (S3 presigned multipart upload, browser → storage direct)

**Revisions:**
- 2026-11-03 — Acceptance criterion for "sem impacto na performance" fixed: upload bytes travel browser → storage only (the API and BFF handle just the JSON handshake), so API memory is independent of file size. Rationale: AMB-1 resolved in /plan-resolve 03 — capability wording had no verifiable criterion.

---

## TD-05: Video Lifecycle / Status Model

**Scope:** Cross-layer

**Capability:** Transversal — covers: Pré-cadastro automático do vídeo como rascunho ao iniciar o upload; Processamento automático do vídeo após upload (extração de duração e metadados)

**Context:** The video row is created as a draft when upload starts, then goes through upload → processing → ready/failed. Phase 04 adds draft → published and public/unlisted visibility. The status values are a contract (DB enum, API response, future FE badges in the channel panel). Choosing the shape now avoids a migration rewrite in Phase 04.

**Options:**

### Option A: Two orthogonal columns — `processing_status` + `publication_status`
- `processing_status`: `uploading | processing | ready | failed`; `publication_status`: `draft` (only value in Phase 03; Phase 04 adds `published`). Visibility stays a separate future column.
- **Pros:** each column has one responsibility; Phase 04 extends without touching processing states; "draft but failed" vs "draft and ready" are representable.
- **Cons:** two enums to keep in sync with the frontend; queries need both columns (e.g., listable = `ready AND published`).

### Option B: Single `status` enum
- `uploading | processing | ready | failed | published`.
- **Pros:** one column, simple filters.
- **Cons:** mixes two concerns — "published" implies "ready"; cannot represent re-processing a published video; Phase 04 must redesign the enum.

### Option C: Single status + processing details in a separate `video_processing_jobs` table
- Video keeps a publication status; processing attempts/errors live in a child table.
- **Pros:** full audit of attempts.
- **Cons:** duplicates what BullMQ (TD-02 A) already tracks; more joins for little gain at this stage.

**Recommendation:** Option A — matches the SRP principle in CLAUDE.md (processing vs publication are independent lifecycles) and lets Phase 04 add `published`/visibility without migrating Phase 03 data.

**Decision:** A (Two orthogonal columns — `processing_status` + `publication_status`)

---

## TD-06: Unique Public Video ID (URL identifier)

**Scope:** Cross-layer

**Capability:** URL única por vídeo, sem conflito com outros vídeos

**Context:** Each video needs a unique URL (e.g., `/watch/<id>`, `/videos/<id>/stream`). The identifier appears in API routes, frontend routes and shared links; it must be non-guessable enough that unlisted videos (Phase 04/05) are not enumerable.

**Options:**

### Option A: UUID primary key used directly in URLs
- `id uuid` (as other entities) exposed as-is.
- **Pros:** no extra column; uniqueness guaranteed; consistent with existing entities.
- **Cons:** long, ugly URLs (36 chars); poor shareability.

### Option B: UUID PK + separate short public ID (`nanoid`-style, 11 chars base64url)
- Internal PK stays UUID; `public_id varchar(11) UNIQUE` generated with crypto-random alphabet; URLs use `public_id`. Unique constraint + retry on collision.
- **Pros:** YouTube-like short URLs; 64^11 space — non-enumerable; internal FKs unaffected; public ID can be decoupled from DB internals.
- **Cons:** extra column + unique index; tiny collision-retry logic.

### Option C: Slug from title + suffix
- `meu-video-a1b2c3`.
- **Pros:** SEO-friendly.
- **Cons:** title changes in Phase 04 would change URLs (or require redirects); title unknown at draft creation time (upload starts before metadata editing).

**Recommendation:** Option B — short, non-enumerable, stable regardless of title edits, and independent from the internal PK; the collision logic is a few lines against a unique index.

**Decision:** B (UUID PK + 11-char random `public_id`)

---

## TD-07: FFmpeg Integration Approach

**Scope:** Backend

**Capability:** Transversal — covers: Processamento automático do vídeo após upload (extração de duração e metadados); Geração automática de thumbnail a partir de um frame do vídeo

**Context:** The worker must run `ffprobe` (duration, codecs, resolution) and `ffmpeg` (thumbnail frame, possibly faststart remux per TD-08). `fluent-ffmpeg`, historically the default wrapper, is deprecated on npm ("Package no longer supported"; unmaintained since 2024). No best-practices skill covers this.

**Options:**

### Option A: Direct `child_process.spawn` of system `ffmpeg`/`ffprobe` behind a small service
- `ffprobe -v error -print_format json -show_format -show_streams` parsed into a typed DTO; `ffmpeg` invoked with explicit args. Binaries come from the worker image (`apt install ffmpeg`).
- **Pros:** no unmaintained dependency; full control of args; easy to unit-test by mocking the spawn wrapper; typed result.
- **Cons:** we own arg building and error/exit-code handling (~100 LOC).

### Option B: `fluent-ffmpeg`
- Fluent API + `ffprobe()` helper.
- **Pros:** concise API; many examples.
- **Cons:** deprecated/unmaintained; types from `@types/fluent-ffmpeg`; known issues with newer FFmpeg versions won't be fixed.

### Option C: `ffmpeg-static` / `ffprobe-static` binaries + spawn
- Bundles binaries in `node_modules` instead of the OS package.
- **Pros:** reproducible binary version regardless of base image.
- **Cons:** large install in both API and worker; binary/arch mismatch issues under Docker on Apple Silicon; still needs Option A's wrapper.

**Recommendation:** Option A — removes a deprecated dependency, and a thin typed wrapper over `spawn` is small, testable, and uses the ffmpeg packaged in the worker image defined by TD-03.

**Decision:** A (Typed `child_process.spawn` wrapper over system ffmpeg/ffprobe)

---

## TD-08: Streaming Format and Media Delivery (stream + download)

**Scope:** Cross-layer

**Capability:** Transversal — covers: Reprodução via streaming (sem necessidade de download completo); Download do vídeo pelo usuário

**Context:** Playback must start without full download, and users must be able to download. Format choice drives worker cost (transcoding or not); delivery path drives how the frontend player gets bytes. Depends on TD-01, TD-06. The player UI itself is Phase 05.

**Options:**

### Option A: Progressive MP4 with HTTP Range, served via short-lived presigned GET URLs
- Worker remuxes to MP4 with `-movflags +faststart` (copy codecs; transcode to H.264/AAC only when the source is not browser-playable). API endpoint `GET /videos/:publicId/stream` returns (or 302-redirects to) a presigned GET URL; storage answers `Range` requests natively. Download = same object with `response-content-disposition=attachment`.
- **Pros:** minimal processing cost; `<video>` plays natively; seeking via Range handled by storage; API/BFF never stream bytes; one stored file serves both stream and download.
- **Cons:** no adaptive bitrate; a 10GB 4K original is streamed as-is (slow on weak connections); presigned URLs need the public endpoint (same env split as TD-04).

### Option B: HLS adaptive streaming (multi-rendition transcode)
- Worker transcodes to 2–4 renditions + `.m3u8` playlists + segments; player uses `hls.js`. Download keeps the original.
- **Pros:** adaptive quality; industry standard for large platforms.
- **Cons:** transcoding a 10GB file into several renditions is hours of CPU per video; many objects to sign (segment URLs need public bucket or signed cookies/proxy); much larger scope than this phase's deliverable.

### Option C: Progressive MP4 proxied through the API with Range support
- API reads from storage (`GetObject` with `Range`) and pipes to the client (via BFF).
- **Pros:** storage stays private and never exposed to the browser; access control per request.
- **Cons:** every playback byte flows through Nest and the Next BFF — opposite of "sem impacto na performance"; complex Range/206 handling at two layers.

**Recommendation:** Option A — meets "streaming sem download completo" with HTTP Range at the lowest processing cost and keeps media bytes off the API/BFF; HLS (Option B) can be added later as an extra worker step without changing the public URL contract.

**Decision:** A (Progressive faststart MP4 with HTTP Range via presigned GET URLs)

**Revisions:**
- 2026-11-03 — Download is restricted to the video owner (authenticated channel owner) and serves the same processed faststart MP4 used for streaming (single stored object, presigned GET with `response-content-disposition=attachment`); the original upload is not kept for download. Rationale: AMB-2 resolved in /plan-resolve 03 — user chose owner-only download of the processed file.
- 2026-11-03 — In Phase 03 streaming is open by unique URL: anyone with the video's `public_id` link can stream a `ready` video even while `publication_status = draft`; non-enumerability comes from the 11-char random `public_id` (TD-06). Phase 04 introduces publication/visibility rules. Rationale: AMB-3 resolved in /plan-resolve 03 — boundary with the Phase 04 publish flow.

---

## TD-09: Upload Limits and Input Validation Policy

**Scope:** Cross-layer

**Capability:** Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance

**Context:** The 10GB cap and accepted formats are cited in several places (env/config, create-upload DTO, part-count math, future FE pre-check). With direct-to-storage upload (TD-04 A), the API never sees the bytes, so enforcement points must be explicit. Depends on TD-04.

**Options:**

### Option A: Declared size + MIME allowlist at init, verified after completion, real validation by ffprobe
- `POST /videos` requires `fileName`, `fileSize ≤ MAX_UPLOAD_BYTES` (10GiB, env-driven) and `contentType` in an allowlist (`video/*` subset); API computes part count from the declared size. On complete, `HeadObject` checks actual size ≤ limit (else abort + `failed`). Worker's ffprobe is the authoritative format check (no video stream → `failed`).
- **Pros:** fails fast for obvious mistakes; real size enforced server-side; real format check where the bytes are; single env key shared by DTO and part math.
- **Cons:** declared MIME is client-provided (only a hint); an oversize file is detected only after upload completes.

### Option B: Size enforced only via presigned part count, no MIME check
- API issues exactly `ceil(fileSize/partSize)` URLs, capped by the limit; ffprobe decides format.
- **Pros:** simpler DTO.
- **Cons:** client can lie about size and reuse part URLs within expiry; non-video files consume worker time before rejection.

### Option C: Validate by sniffing the first part (magic bytes) before allowing remaining parts
- After part 1, API reads it from storage and checks container signature.
- **Pros:** early rejection of non-video files.
- **Cons:** extra handshake step; container sniffing duplicates ffprobe; more state on the API.

**Recommendation:** Option A — layered checks (declared → actual size → ffprobe) put each verification where the information truly exists, with one env key (`MAX_UPLOAD_BYTES`) as the shared contract.

**Decision:** A (Layered checks: declared size/MIME → HeadObject → ffprobe)

**Revisions:**
- 2026-11-03 — Wire field names follow the existing snake_case API convention (`refresh_token`, `access_token`): the init request body uses `file_name`, `file_size` and `content_type` instead of `fileName`, `fileSize`, `contentType`; every new video request/response field is snake_case. Rationale: consistency with the wire format already established by phase-02-auth endpoints (raised during /plan-build 03).

---

## TD-10: Abandoned Upload Cleanup

**Scope:** Backend

**Capability:** Pré-cadastro automático do vídeo como rascunho ao iniciar o upload

**Context:** Because the draft is created when upload *starts*, users closing the tab leave behind a draft row with `processing_status = uploading` and an incomplete S3 multipart upload (parts consume storage until aborted). Depends on TD-01, TD-02, TD-05.

**Options:**

### Option A: Storage lifecycle rule + scheduled reconciliation job
- Bucket lifecycle rule `AbortIncompleteMultipartUpload` (e.g., 2 days) frees parts; a BullMQ repeatable job marks drafts stuck in `uploading` beyond the same window as `failed` (or deletes them).
- **Pros:** storage cleanup is native and reliable; DB state stays consistent with storage; reuses TD-02 infra.
- **Cons:** two mechanisms with the same window to keep aligned.

### Option B: Scheduled job only (abort via API + DB update)
- Repeatable job lists stale drafts, calls `AbortMultipartUpload` and updates/deletes rows.
- **Pros:** single mechanism, single source of truth (DB).
- **Cons:** orphan multipart uploads with no DB row (crash between create-upload and insert) are never cleaned.

### Option C: No automatic cleanup in Phase 03
- Leave stale drafts; Phase 04 panel lets users delete them.
- **Pros:** zero work now.
- **Cons:** storage leaks of up to 10GB per abandoned upload; misleading "uploading" drafts forever.

**Recommendation:** Option A — the lifecycle rule covers orphaned parts the DB cannot know about, and the reconciliation job keeps draft states truthful; both are small.

**Decision:** A (Storage lifecycle rule + scheduled reconciliation job)

---

## TD-11: Integration/E2E Test Strategy for Storage, Queue and FFmpeg

**Scope:** Backend

**Capability:** Transversal — covers: Serviço de armazenamento de arquivos (vídeos e thumbnails); Serviço de processamento em segundo plano (filas); Processamento automático do vídeo após upload (extração de duração e metadados); Geração automática de thumbnail a partir de um frame do vídeo

**Context:** Existing convention: integration/e2e tests use the real Compose PostgreSQL with `--runInBand` (no DB mocks). Phase 03 adds storage, Redis and FFmpeg. The testing rule does not say whether these are real or mocked at integration level.

**Options:**

### Option A: Real services from Compose + tiny fixture video
- Integration/e2e tests hit the Compose MinIO and Redis (dedicated test bucket / queue prefix, cleaned per suite); worker processors are tested against a committed ~100KB fixture MP4 with the real ffmpeg in the container. Unit tests mock the S3/queue/ffmpeg wrappers.
- **Pros:** consistent with the "real DB" convention; catches presign/CORS/multipart and ffprobe parsing issues mocks hide; fast with a tiny fixture.
- **Cons:** tests need storage + Redis + ffmpeg available in the test container (ffmpeg must be in the image that runs Jest).

### Option B: Mock storage/queue at integration level, real DB only
- S3 client and queue stubbed; only DB is real.
- **Pros:** no extra services needed for tests.
- **Cons:** the riskiest parts (multipart completion, presigned URL host, ffprobe output) go untested until manual QA.

### Option C: Testcontainers for MinIO/Redis
- Each suite starts ephemeral containers.
- **Pros:** isolated, parallel-friendly.
- **Cons:** Docker-in-Docker from inside the `nestjs-api` container; diverges from the existing shared-services convention; slow startup.

**Recommendation:** Option A — mirrors the established real-DB testing convention and exercises exactly the integration seams this phase introduces; the only cost is installing ffmpeg in the dev image.

**Decision:** A (Real Compose services + tiny fixture video)

---

## Decisions Summary

| ID | Scope | Decision | Recommendation | Choice |
|----|-------|----------|----------------|--------|
| TD-01 | Repo-wide | Object storage backend (S3-compatible) | A (MinIO pinned last community image, S3 SDK only) | A |
| TD-02 | Backend | Background job queue | A (BullMQ + Redis via `@nestjs/bullmq`) | A |
| TD-03 | Repo-wide | Video worker deployment model | A (same codebase, separate entrypoint + container) | A |
| TD-04 | Cross-layer | Large-file upload protocol | A (S3 presigned multipart, browser → storage) | A |
| TD-05 | Cross-layer | Video lifecycle / status model | A (orthogonal `processing_status` + `publication_status`) | A |
| TD-06 | Cross-layer | Unique public video ID | B (UUID PK + 11-char random `public_id`) | B |
| TD-07 | Backend | FFmpeg integration approach | A (typed `spawn` wrapper over system ffmpeg/ffprobe) | A |
| TD-08 | Cross-layer | Streaming format and media delivery | A (faststart MP4 + Range via presigned GET) | A |
| TD-09 | Cross-layer | Upload limits and validation policy | A (declared size/MIME → HeadObject → ffprobe) | A |
| TD-10 | Backend | Abandoned upload cleanup | A (lifecycle abort rule + repeatable reconciliation job) | A |
| TD-11 | Backend | Test strategy for storage/queue/FFmpeg | A (real Compose services + tiny fixture video) | A |

---

## Notes for downstream pipeline

- **Dependencies:** TD-03 → TD-02; TD-04 → TD-01; TD-08 → TD-01, TD-06; TD-09 → TD-04; TD-10 → TD-01, TD-02, TD-05; TD-11 → TD-01, TD-02, TD-07. If TD-01 swings to D (local FS), TD-04 A and TD-08 A become impossible and must be revisited.
- **Docker networking contract (TD-04 A / TD-08 A):** presigned URLs are consumed by the browser, which cannot resolve Compose service names. Two keys are required: `S3_ENDPOINT` (service name, used by API/worker per CLAUDE.md Docker Networking) and `S3_PUBLIC_ENDPOINT` (host-reachable, used only for signing). This is consistent with CLAUDE.md — `localhost` never appears in container-to-container config.
- **BFF model:** under TD-04 A / TD-08 A the browser talks directly to the **storage** host (allowed by the C4 diagram: "Frontend → Object Storage: Streams"), never to the NestJS API. Handshake JSON calls still go through the BFF. `next-frontend/CLAUDE.md` line "Media streaming will eventually come from Object Storage — TBD" should be updated by the frontend research.
- **Implementation-level items intentionally not TDs** (resolved by `implement` via skills/neighboring code): thumbnail frame selection (e.g., frame at ~10% of duration), bucket key layout (`videos/{id}/original.mp4`, `videos/{id}/thumbnail.jpg`), part size (e.g., 64MiB → ~160 parts for 10GB), presigned URL TTLs, Redis/MinIO Compose healthchecks, `ffmpeg` apt install in `Dockerfile.dev`.
- **Frontend follow-up:** a complementary ad-hoc doc (`related_phases: [3]`) should cover the upload screen (client-side multipart orchestration lib vs hand-rolled, progress UI, status polling vs SSE).

Sources consulted during research:

- [NestJS — Queues (`@nestjs/bullmq`, consumers, sandboxed processors)](https://docs.nestjs.com/techniques/queues) — via context7 `/nestjs/docs.nestjs.com`.
- [BullMQ — Retrying failing jobs (attempts, backoff)](https://docs.bullmq.io/guide/retrying-failing-jobs) — via context7 `/taskforcesh/bullmq`.
- [AWS SDK for JavaScript v3 — `CreateMultipartUploadCommand`, `UploadPartCommand`, `CompleteMultipartUploadCommand`, `getSignedUrl`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/) — via context7.
- [tus-node-server — `@tus/server`, `@tus/s3-store`](https://github.com/tus/tus-node-server) — via context7 `/tus/tus-node-server`.
- [fluent-ffmpeg on npm — deprecation notice](https://npmjs.com/package/fluent-ffmpeg).
- [MinIO CE in 2026: retired upstream, source-only](https://glukhov.org/data-infrastructure/object-storage/minio-dead/) and [MinIO moves away from open source (It's FOSS)](https://itsfoss.com/news/minio-moves-away-from-open-source/).
- [pg-boss](https://npmjs.com/package/pg-boss) and [BullMQ vs pg-boss comparison (PkgPulse)](https://www.pkgpulse.com/guides/bullmq-vs-bee-queue-vs-pg-boss-job-queues-nodejs-2026).
