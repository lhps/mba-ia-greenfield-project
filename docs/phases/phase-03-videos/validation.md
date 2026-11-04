---
kind: phase
name: phase-03-videos
status: clean
issue_count: 0
sources_mtime:
  docs/phases/phase-03-videos/context.md: "2026-11-03T19:01:23-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-11-03T19:01:23-03:00"
issues:
  - id: AMB-1
    status: resolved
    summary: "'sem impacto na performance' (upload 10GB) has no measurable acceptance criterion"
    resolved_by: phase-03-videos/TD-04
  - id: AMB-2
    status: resolved
    summary: "Download: who may download (anon/auth/owner) and which file (original/processed)"
    resolved_by: phase-03-videos/TD-08
  - id: AMB-3
    status: resolved
    summary: "Stream/download access for draft videos before Phase 04 publish flow exists"
    resolved_by: phase-03-videos/TD-08
  - id: OQ-1
    status: resolved
    summary: "TD-01 pending — Object Storage Backend (S3-compatible service)"
    resolved_by: phase-03-videos/TD-01
  - id: OQ-2
    status: resolved
    summary: "TD-02 pending — Background Job Queue"
    resolved_by: phase-03-videos/TD-02
  - id: OQ-3
    status: resolved
    summary: "TD-03 pending — Video Worker Deployment Model"
    resolved_by: phase-03-videos/TD-03
  - id: OQ-4
    status: resolved
    summary: "TD-04 pending — Large-file Upload Protocol (up to 10GB)"
    resolved_by: phase-03-videos/TD-04
  - id: OQ-5
    status: resolved
    summary: "TD-05 pending — Video Lifecycle / Status Model"
    resolved_by: phase-03-videos/TD-05
  - id: OQ-6
    status: resolved
    summary: "TD-06 pending — Unique Public Video ID (URL identifier)"
    resolved_by: phase-03-videos/TD-06
  - id: OQ-7
    status: resolved
    summary: "TD-07 pending — FFmpeg Integration Approach"
    resolved_by: phase-03-videos/TD-07
  - id: OQ-8
    status: resolved
    summary: "TD-08 pending — Streaming Format and Media Delivery (stream + download)"
    resolved_by: phase-03-videos/TD-08
  - id: OQ-9
    status: resolved
    summary: "TD-09 pending — Upload Limits and Input Validation Policy"
    resolved_by: phase-03-videos/TD-09
  - id: OQ-10
    status: resolved
    summary: "TD-10 pending — Abandoned Upload Cleanup"
    resolved_by: phase-03-videos/TD-10
  - id: OQ-11
    status: resolved
    summary: "TD-11 pending — Integration/E2E Test Strategy for Storage, Queue and FFmpeg"
    resolved_by: phase-03-videos/TD-11
advisories: []
---

# phase-03-videos — Validation

## Findings

### Inconsistencies

_None._

### Ambiguities

_None._

### Missing Decisions

_None._

### Dependency Gaps

_None._

### Inherited Constraint Conflicts

_None._

### Unresolved Open Questions

_None._

### UI Coverage Gaps

_None._ _(UI Inventory deferred — check not applicable.)_

## Resolved Issues

- **AMB-1** _(resolved_by phase-03-videos/TD-04)_ — 'sem impacto na performance' had no measurable criterion. Clarified (Revision on TD-04): upload bytes travel browser → storage only; API memory independent of file size.
- **AMB-2** _(resolved_by phase-03-videos/TD-08)_ — Download actor/artifact. Clarified (Revision on TD-08): owner-only download of the processed faststart MP4 (same single object used for streaming).
- **AMB-3** _(resolved_by phase-03-videos/TD-08)_ — Draft access before Phase 04. Clarified (Revision on TD-08): streaming open to anyone with the `public_id` URL for `ready` videos (even drafts); download stays owner-only; Phase 04 adds visibility rules.
- **OQ-1** _(resolved_by phase-03-videos/TD-01)_ — TD-01 decided: A (MinIO pinned to the last community image; code talks only S3 API).
- **OQ-2** _(resolved_by phase-03-videos/TD-02)_ — TD-02 decided: A (BullMQ + Redis via `@nestjs/bullmq`).
- **OQ-3** _(resolved_by phase-03-videos/TD-03)_ — TD-03 decided: A (Same codebase, separate entrypoint and container).
- **OQ-4** _(resolved_by phase-03-videos/TD-04)_ — TD-04 decided: A (S3 presigned multipart upload, browser → storage direct).
- **OQ-5** _(resolved_by phase-03-videos/TD-05)_ — TD-05 decided: A (Two orthogonal columns — `processing_status` + `publication_status`).
- **OQ-6** _(resolved_by phase-03-videos/TD-06)_ — TD-06 decided: B (UUID PK + 11-char random `public_id`).
- **OQ-7** _(resolved_by phase-03-videos/TD-07)_ — TD-07 decided: A (Typed `child_process.spawn` wrapper over system ffmpeg/ffprobe).
- **OQ-8** _(resolved_by phase-03-videos/TD-08)_ — TD-08 decided: A (Progressive faststart MP4 with HTTP Range via presigned GET URLs).
- **OQ-9** _(resolved_by phase-03-videos/TD-09)_ — TD-09 decided: A (Layered checks: declared size/MIME → HeadObject → ffprobe).
- **OQ-10** _(resolved_by phase-03-videos/TD-10)_ — TD-10 decided: A (Storage lifecycle rule + scheduled reconciliation job).
- **OQ-11** _(resolved_by phase-03-videos/TD-11)_ — TD-11 decided: A (Real Compose services + tiny fixture video).
