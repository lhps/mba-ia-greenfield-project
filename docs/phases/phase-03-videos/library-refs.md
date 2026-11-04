---
libs:
  "@aws-sdk/client-s3":
    version: "^3.1161.0"
    context7_id: "/aws/aws-sdk-js-v3"
    fetched_at: "2026-11-03T18:37:17-03:00"
  "@aws-sdk/s3-request-presigner":
    version: "^3.1161.0"
    context7_id: "/aws/aws-sdk-js-v3"
    fetched_at: "2026-11-03T18:37:17-03:00"
  "@nestjs/bullmq":
    version: "^11.0.5"
    context7_id: "/nestjs/bull"
    fetched_at: "2026-11-03T18:37:17-03:00"
  "bullmq":
    version: "^6.5.4"
  "ioredis":
    version: "^5.11.1"
    context7_id: "n/a — required peer of bullmq 6 (see bullmq section)"
    fetched_at: "2026-11-03T22:00:00-03:00"
    context7_id: "/taskforcesh/bullmq"
    fetched_at: "2026-11-03T18:37:17-03:00"
sources_mtime:
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-11-03T21:41:19-03:00"
---

# Library References — phase-03-videos

Distilled excerpts relevant to the decided TDs. Versions are the npm `latest` at fetch time (none installed yet in `nestjs-project/package.json`); pin when installing.

### @aws-sdk/client-s3

_Used by: phase-03-videos/TD-12 (storage — SeaweedFS 4.51, supersedes TD-01 MinIO), TD-04 (presigned multipart), TD-09 (HeadObject size check), TD-10 (AbortMultipartUpload)._

- **Client config (SeaweedFS / any non-AWS S3):** `new S3Client({ endpoint, forcePathStyle: true, region, credentials: { accessKeyId, secretAccessKey }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' })`. `forcePathStyle: true` puts the bucket in the path (`host/bucket/key`). **Checksum settings are mandatory** (TD-04 revision): with the default `WHEN_SUPPORTED` (SDK ≥ 3.729) presigned `UploadPart` URLs include `x-amz-checksum-crc32` + `x-amz-sdk-checksum-algorithm` and a browser `PUT` fails with `400 BadDigest` (reproduced in the TD-12 spike). Two clients: one with `S3_ENDPOINT` (Compose service name, for API/worker calls) and one with `S3_PUBLIC_ENDPOINT` used only for signing browser-facing URLs.
- **Multipart flow:** `CreateMultipartUploadCommand({ Bucket, Key, ContentType })` → `UploadId`; parts via `UploadPartCommand({ Bucket, Key, UploadId, PartNumber })` (PartNumber 1..10000); finish with `CompleteMultipartUploadCommand({ Bucket, Key, UploadId, MultipartUpload: { Parts: [{ ETag, PartNumber }] } })`. Abort with `AbortMultipartUploadCommand({ Bucket, Key, UploadId })`.
- **ETag from browser uploads:** if a part response lacks `ETag`, the SDK error hints "Missing Bucket CORS configuration for ETag header?" — bucket CORS must expose the `ETag` header for the browser to read it and send it to `/complete`.
- **Size verification (TD-09):** `HeadObjectCommand({ Bucket, Key })` → `ContentLength` after completion.
- **Bucket bootstrap (TD-12 — no `mc` CLI):** `CreateBucketCommand` (ignore `BucketAlreadyOwnedByYou`/`BucketAlreadyExists`), `PutBucketCorsCommand({ CORSConfiguration: { CORSRules: [{ AllowedOrigins, AllowedMethods: ['GET','PUT','HEAD'], AllowedHeaders: ['*'], ExposeHeaders: ['ETag'], MaxAgeSeconds }] } })`, `PutBucketLifecycleConfigurationCommand({ LifecycleConfiguration: { Rules: [{ ID, Status: 'Enabled', Filter: { Prefix: '' }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 2 } }] } })` — all idempotent re-PUTs. Spike-verified on SeaweedFS 4.51: wrong-ETag complete → `InvalidPart` with parts preserved; repeated `AbortMultipartUpload` is a no-op.

### @aws-sdk/s3-request-presigner

_Used by: TD-04 (presigned UploadPart URLs), TD-08 (presigned GET for stream/download)._

```ts
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand, UploadPartCommand } from '@aws-sdk/client-s3';

const partUrl = await getSignedUrl(publicClient, new UploadPartCommand({ Bucket, Key, UploadId, PartNumber }), { expiresIn: 3600 });
const streamUrl = await getSignedUrl(publicClient, new GetObjectCommand({ Bucket, Key }), { expiresIn: 900 });
const downloadUrl = await getSignedUrl(
  publicClient,
  new GetObjectCommand({ Bucket, Key: processedKey, ResponseContentDisposition: `attachment; filename="${fileName}"` }),
  { expiresIn: 900 },
);
```

- `expiresIn` defaults to **900 s** when omitted; the presigner does not check credential expiration.
- `ResponseContentDisposition` (`response-content-disposition` query param) **must be signed** — only works via presigned URL / signed request (TD-08 download = same processed MP4 as streaming, with attachment disposition; owner-only per TD-08 revisions).

### @nestjs/bullmq

_Used by: TD-02 (queue), TD-03 (worker entrypoint), TD-10 (reconciliation job)._ **Pinned to `^11.0.5`** (peer `bullmq ^3..^6`, Nest `^10 || ^11`): `@nestjs/bullmq` 12 and `@nestjs/bull-shared` 12 are ESM-only and fail to load under the project's CommonJS Jest (`SyntaxError: Unexpected token 'export'`) — found during /implement SI-03.5.

- **Root config:** `BullModule.forRootAsync({ imports, useFactory: (cfg) => ({ connection: { host, port } }), inject: [...] })` — fits the `registerAs` + `inject: [xxxConfig.KEY]` convention (Redis host = Compose service name).
- **Queue:** `BullModule.registerQueue({ name: 'video-processing', defaultJobOptions: { attempts, backoff } })`. Producer: `constructor(@InjectQueue('video-processing') private readonly queue: Queue)` → `queue.add('process', { videoId })`.
- **Consumer:** `@Processor('video-processing') class VideoProcessor extends WorkerHost { async process(job: Job<{ videoId: string }>) { ... } }` — throw to fail (retried per attempts/backoff); return value stored as job result. `this.worker` is only available from `onApplicationBootstrap` onward (e.g., to attach `worker.on('failed', ...)` for marking `processing_status = failed` after the last attempt).
- **Worker isolation (TD-03 A):** register `@Processor` classes only in `WorkerModule`; the API module registers the queue (producer) without processors.
- `registerQueue` attaches an `onApplicationShutdown` hook closing workers and the queue — call `app.enableShutdownHooks()` in `worker.ts`.

### bullmq

_Used by: TD-02, TD-10._ **bullmq 6 makes `ioredis` an optional peer** — it must be installed explicitly (`ioredis@^5`; `^6` conflicts with `typeorm@0.3.28`'s optional peer `ioredis ^5`). Without it: "BullMQ could not load the optional 'ioredis' package".

- **Retries:** `queue.add(name, data, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } })` → retry after `2^(attempts-1) * delay` ms.
- **Idempotency by video:** pass `jobId: videoId` or `deduplication: { id: videoId }` — while the job is not completed/failed, re-adds with the same id are ignored (emits `deduplicated` on `QueueEvents`).
- **v6 — Job Schedulers replace repeatable jobs (TD-10 reconciliation):**
  ```ts
  await queue.upsertJobScheduler('reconcile-stale-uploads', { pattern: '0 */1 * * *' }, {
    name: 'reconcile-stale-uploads', data: {}, opts: { attempts: 3, removeOnFail: 1000 },
  });
  ```
  `upsertJobScheduler` is idempotent by scheduler id — safe to call on every worker boot. Use it instead of the legacy `repeat` option.
