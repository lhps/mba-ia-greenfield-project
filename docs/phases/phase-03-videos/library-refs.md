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
    version: "^12.0.0"
    context7_id: "/nestjs/bull"
    fetched_at: "2026-11-03T18:37:17-03:00"
  "bullmq":
    version: "^6.5.4"
    context7_id: "/taskforcesh/bullmq"
    fetched_at: "2026-11-03T18:37:17-03:00"
sources_mtime:
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-11-03T19:01:23-03:00"
---

# Library References — phase-03-videos

Distilled excerpts relevant to the decided TDs. Versions are the npm `latest` at fetch time (none installed yet in `nestjs-project/package.json`); pin when installing.

### @aws-sdk/client-s3

_Used by: phase-03-videos/TD-01 (storage), TD-04 (presigned multipart), TD-09 (HeadObject size check), TD-10 (AbortMultipartUpload)._

- **MinIO client config:** `new S3Client({ endpoint, forcePathStyle: true, region, credentials: { accessKeyId, secretAccessKey } })`. `forcePathStyle: true` puts the bucket in the path (`host/bucket/key`), required for MinIO. Two clients: one with `S3_ENDPOINT` (Compose service name, for API/worker calls) and one with `S3_PUBLIC_ENDPOINT` used only for signing browser-facing URLs.
- **Multipart flow:** `CreateMultipartUploadCommand({ Bucket, Key, ContentType })` → `UploadId`; parts via `UploadPartCommand({ Bucket, Key, UploadId, PartNumber })` (PartNumber 1..10000); finish with `CompleteMultipartUploadCommand({ Bucket, Key, UploadId, MultipartUpload: { Parts: [{ ETag, PartNumber }] } })`. Abort with `AbortMultipartUploadCommand({ Bucket, Key, UploadId })`.
- **ETag from browser uploads:** if a part response lacks `ETag`, the SDK error hints "Missing Bucket CORS configuration for ETag header?" — bucket CORS must expose the `ETag` header for the browser to read it and send it to `/complete`.
- **Size verification (TD-09):** `HeadObjectCommand({ Bucket, Key })` → `ContentLength` after completion.

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

_Used by: TD-02 (queue), TD-03 (worker entrypoint), TD-10 (reconciliation job)._ Peer deps: `@nestjs/core ^10 || ^11 || ^12`, `bullmq ^3..^6` — compatible with the installed Nest 11.

- **Root config:** `BullModule.forRootAsync({ imports, useFactory: (cfg) => ({ connection: { host, port } }), inject: [...] })` — fits the `registerAs` + `inject: [xxxConfig.KEY]` convention (Redis host = Compose service name).
- **Queue:** `BullModule.registerQueue({ name: 'video-processing', defaultJobOptions: { attempts, backoff } })`. Producer: `constructor(@InjectQueue('video-processing') private readonly queue: Queue)` → `queue.add('process', { videoId })`.
- **Consumer:** `@Processor('video-processing') class VideoProcessor extends WorkerHost { async process(job: Job<{ videoId: string }>) { ... } }` — throw to fail (retried per attempts/backoff); return value stored as job result. `this.worker` is only available from `onApplicationBootstrap` onward (e.g., to attach `worker.on('failed', ...)` for marking `processing_status = failed` after the last attempt).
- **Worker isolation (TD-03 A):** register `@Processor` classes only in `WorkerModule`; the API module registers the queue (producer) without processors.
- `registerQueue` attaches an `onApplicationShutdown` hook closing workers and the queue — call `app.enableShutdownHooks()` in `worker.ts`.

### bullmq

_Used by: TD-02, TD-10._

- **Retries:** `queue.add(name, data, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } })` → retry after `2^(attempts-1) * delay` ms.
- **Idempotency by video:** pass `jobId: videoId` or `deduplication: { id: videoId }` — while the job is not completed/failed, re-adds with the same id are ignored (emits `deduplicated` on `QueueEvents`).
- **v6 — Job Schedulers replace repeatable jobs (TD-10 reconciliation):**
  ```ts
  await queue.upsertJobScheduler('reconcile-stale-uploads', { pattern: '0 */1 * * *' }, {
    name: 'reconcile-stale-uploads', data: {}, opts: { attempts: 3, removeOnFail: 1000 },
  });
  ```
  `upsertJobScheduler` is idempotent by scheduler id — safe to call on every worker boot. Use it instead of the legacy `repeat` option.
