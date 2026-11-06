---
kind: phase
name: phase-05-video-watch
status: clean
issue_count: 0
sources_mtime:
  docs/phases/phase-05-video-watch/context.md: "2026-11-06T10:20:49-03:00"
  docs/decisions/technical-decisions-phase-05-video-watch.md: "2026-11-06T10:20:01-03:00"
issues:
  - id: AMB-1
    status: resolved
    summary: "Suggestions contract: list size, uncategorized or unreadable current video"
    resolved_by: clarification (revision on phase-05-video-watch/TD-02)
  - id: AMB-2
    status: resolved
    summary: "Watch page info: does GET /videos/:id already carry what the page shows?"
    resolved_by: clarification (revision on phase-05-video-watch/TD-01)
  - id: AMB-3
    status: resolved
    summary: "View dedup window length and anonymous viewer key not fixed"
    resolved_by: clarification (revision on phase-05-video-watch/TD-01)
  - id: OQ-1
    status: resolved
    summary: "TD-01 pending — View Counting Rule"
    resolved_by: phase-05-video-watch/TD-01
  - id: OQ-2
    status: resolved
    summary: "TD-02 pending — Same-category Suggestions for the Sidebar"
    resolved_by: phase-05-video-watch/TD-02
  - id: OQ-3
    status: resolved
    summary: "TD-03 pending — Download Access on the Watch Page"
    resolved_by: phase-05-video-watch/TD-03
  - id: ICC-1
    status: resolved
    summary: "Trusting X-Forwarded-For (TD-01) changes the per-IP key of auth throttling"
    resolved_by: phase-05-video-watch/TD-01 (revision — trust proxy = 1 hop)
advisories: []
---

# phase-05-video-watch — Validation

## Findings

### Inconsistencies

_None._

### Ambiguities

_None._

### Missing Decisions

_None._

_Note (informational, not an issue): the bullets "Player de vídeo com controles: play/pause, volume e barra de progresso", "Layout da página: vídeo principal + informações + sidebar com sugestões" and "Descrição do vídeo com expansão/recolhimento" have no TD in this slice by design — they are outside this slice's `covers_capabilities` and belong to the not-yet-researched sibling slice `phase-05-video-watch-frontend`. The cross-slice coverage check (Check 8) runs once that sibling's decisions doc exists._

### Dependency Gaps

_None._

### Inherited Constraint Conflicts

_None._

### Unresolved Open Questions

_None._

### UI Coverage Gaps

_None._

## Resolved Issues

- **AMB-1** _(resolved_by clarification — revision on phase-05-video-watch/TD-02)_ — Suggestions contract: list size 12; 404 when the caller cannot read the current video; most recent public videos when the current video has no category.
- **AMB-2** _(resolved_by clarification — revision on phase-05-video-watch/TD-01)_ — This slice adds `view_count` and an embedded `channel` summary (`nickname`, `name`) to the `GET /videos/:id` response.
- **AMB-3** _(resolved_by clarification — revision on phase-05-video-watch/TD-01)_ — Dedup window `VIEW_DEDUP_WINDOW_SECONDS` (default 86400); viewer key = user id or SHA-256 of IP + user agent; owner self-views not counted.
- **OQ-1** _(resolved_by phase-05-video-watch/TD-01)_ — TD-01 decided: B (player view event, Redis dedup per viewer).
- **OQ-2** _(resolved_by phase-05-video-watch/TD-02)_ — TD-02 decided: B (most viewed, recency tie-break, fill from other categories).
- **OQ-3** _(resolved_by phase-05-video-watch/TD-03)_ — TD-03 decided: A (keep owner-only download; diverges from the Recommendation, see the TD's Note).
- **ICC-1** _(resolved_by phase-05-video-watch/TD-01 — revision)_ — The API trusts exactly one proxy hop (`trust proxy` = 1), so view counting and the Phase 02 auth rate limit both use the client IP added by the BFF. This holds only while the API is reachable solely through the BFF; local dev's published port 3000 is an accepted exception.
