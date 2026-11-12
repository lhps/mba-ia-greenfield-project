---
kind: phase
name: phase-06-social-interactions
status: clean
issue_count: 0
sources_mtime:
  docs/phases/phase-06-social-interactions/context.md: "2026-11-11T13:47:03-03:00"
  docs/decisions/technical-decisions-phase-06-social-interactions.md: "2026-11-11T11:51:35-03:00"
issues:
  - id: IC-1
    status: resolved
    summary: "Testing Requirements next-frontend note points to phase-05 FE slice, not phase-06"
    resolved_by: plan-context regeneration (context.md note fixed)
  - id: AMB-1
    status: resolved
    summary: "Which videos/comments accept reactions and comments (read rule, draft, not ready)"
    resolved_by: phase-06-social-interactions/TD-03
  - id: AMB-2
    status: resolved
    summary: "comment_count semantics: replies included? soft-deleted comments excluded?"
    resolved_by: phase-06-social-interactions/TD-02
  - id: OQ-1
    status: resolved
    summary: "TD-01 pending — Reaction storage model"
    resolved_by: phase-06-social-interactions/TD-01
  - id: OQ-2
    status: resolved
    summary: "TD-02 pending — Counter maintenance for reactions, comments and subscriptions"
    resolved_by: phase-06-social-interactions/TD-02
  - id: OQ-3
    status: resolved
    summary: "TD-03 pending — Reaction API contract"
    resolved_by: phase-06-social-interactions/TD-03
  - id: OQ-4
    status: resolved
    summary: "TD-04 pending — Comment threading depth"
    resolved_by: phase-06-social-interactions/TD-04
  - id: OQ-5
    status: resolved
    summary: "TD-05 pending — Comment listing contract (order, pagination, replies)"
    resolved_by: phase-06-social-interactions/TD-05
  - id: OQ-6
    status: resolved
    summary: "TD-06 pending — Comment lifecycle and limits"
    resolved_by: phase-06-social-interactions/TD-06
  - id: OQ-7
    status: resolved
    summary: "TD-07 pending — Subscription storage and subscriber count"
    resolved_by: phase-06-social-interactions/TD-07
  - id: OQ-8
    status: resolved
    summary: "TD-08 pending — Viewer-specific state in read responses"
    resolved_by: phase-06-social-interactions/TD-08
  - id: OQ-9
    status: resolved
    summary: "TD-09 pending — Subscribed-channels area and feed"
    resolved_by: phase-06-social-interactions/TD-09
advisories: []
---

# phase-06-social-interactions — Validation

## Findings

### Inconsistencies

_None._

### Ambiguities

_None._

### Missing Decisions

_None._ _(Every bullet in this slice's `covers_capabilities` maps to ≥1 TD; the 8th phase bullet belongs to the future frontend slice. The FE↔BE contract-sync check does not fire: UI inventory is deferred, and next-frontend-openapi-typing / openapi-docs-nestjs are inherited. The error response format is inherited from phase-02-auth/TD-07.)_

### Dependency Gaps

_None._ _(Phase 02 auth guards and the Phase 04 public channel/video read endpoints and counter columns exist on `dev`.)_

### Inherited Constraint Conflicts

_None._ _(TD-06 B extends `@nestjs/throttler` — phase-02-auth/TD-08 — to comment creation through a module-scoped guard; this widens its use without contradicting the AuthModule scoping. TD-08 A keeps per-viewer reads uncached, consistent with phase-05-video-watch-frontend/TD-02.)_

### Unresolved Open Questions

_None._

### UI Coverage Gaps

_None._ _(UI inventory deferred — check skipped.)_

## Resolved Issues

- **IC-1** _(resolved_by plan-context regeneration)_ — Testing Requirements next-frontend note now names the future Phase 06 frontend slice instead of `phase-05-video-watch-frontend`.
- **AMB-1** _(resolved_by phase-06-social-interactions/TD-03)_ — Write rule for reactions and comments: same video read rule, not-ready → 409 `VIDEO_NOT_READY`, owners may react/comment. Revisions on TD-03 and TD-06.
- **AMB-2** _(resolved_by phase-06-social-interactions/TD-02)_ — `comment_count` = non-deleted roots + replies; `reply_count` = non-deleted replies of a root; deletions decrement. Revision on TD-02.
- **OQ-1** _(resolved_by phase-06-social-interactions/TD-01)_ — Decision: A (one table per target).
- **OQ-2** _(resolved_by phase-06-social-interactions/TD-02)_ — Decision: A (delta update in the same transaction).
- **OQ-3** _(resolved_by phase-06-social-interactions/TD-03)_ — Decision: A (idempotent PUT/DELETE; like_count + my_reaction).
- **OQ-4** _(resolved_by phase-06-social-interactions/TD-04)_ — Decision: A (one reply level).
- **OQ-5** _(resolved_by phase-06-social-interactions/TD-05)_ — Decision: A (roots newest-first + lazy replies, keyset).
- **OQ-6** _(resolved_by phase-06-social-interactions/TD-06)_ — Decision: B (author soft delete, 1–2,000 chars, throttled).
- **OQ-7** _(resolved_by phase-06-social-interactions/TD-07)_ — Decision: A (subscriptions table + denormalized subscriber_count).
- **OQ-8** _(resolved_by phase-06-social-interactions/TD-08)_ — Decision: A (viewer state embedded in optional-auth reads).
- **OQ-9** _(resolved_by phase-06-social-interactions/TD-09)_ — Decision: A (channel list + feed computed on read).
