---
scope_type: phase
related_phases: [6]
status: decided
date: 2026-11-11
scope_description: "Backend slice of Phase 06 (social interactions): likes/dislikes on videos and comments, comments with replies, channel subscriptions with subscriber counts, and the subscribed-channels area. The cross-layer contracts the frontend slice will consume are decided here once."
covers_capabilities:
  - "Like e dislike em vídeos (usuários autenticados)"
  - "Comentários em vídeos (usuários autenticados)"
  - "Respostas a comentários (comentários aninhados)"
  - "Like e dislike em comentários (usuários autenticados)"
  - "Inscrição em canais (seguir/deixar de seguir)"
  - "Área de canais seguidos com acesso rápido aos vídeos"
  - "Contagem de inscritos na página do canal"
---

# Technical Decisions — Fase 06: Interações Sociais (backend slice)

_Subprojects in scope:_

- `nestjs-project/` — receives reactions on videos and comments, the comments module (threads, listing, lifecycle), channel subscriptions with the subscriber counter, and the subscribed-channels endpoints. Covered by TD-01..TD-09.
- `next-frontend/` — **no open decision in this document.** By user choice (2026-11-10: "Backend agora") the UI ("Interface completa de comentários, likes e inscrições" — reaction buttons, comment thread UI, subscribe button, subscriptions area screens) belongs to a sibling slice researched later, as in Phases 02, 04 and 05. The cross-layer contracts it will consume (TD-03, TD-04, TD-05, TD-06, TD-08, TD-09) **are decided here once**.

Inherited constraints (not reopened): denormalized counters on `videos` (`view_count`, `like_count`, `comment_count` — phase-04-channel-management/TD-08 A); keyset pagination for public append-heavy feeds (phase-04-channel-management/TD-09); read rule — drafts are 404 for non-owners, unlisted readable by link (phase-04-channel-management/TD-04); error envelope `{ statusCode, error, message }` (phase-02-auth/TD-07); `@nestjs/throttler` installed and scoped to `AuthModule` (phase-02-auth/TD-08); optional-auth guard on public reads (phase-04-channel-management/TD-04).

---

## TD-01: Reaction storage model

**Scope:** Backend

**Capability:** Transversal — covers: Like e dislike em vídeos (usuários autenticados); Like e dislike em comentários (usuários autenticados)

**Context:** Each authenticated user can hold at most one reaction (like or dislike) per video and per comment, and must be able to switch or remove it. Two target types (videos, comments) need the same behaviour; the shape of the table drives foreign keys, cascades and the uniqueness rule.

**Options:**

### Option A: One table per target (`video_reactions`, `comment_reactions`)
- Each table has `(user_id, video_id|comment_id)` as a unique key and a `value` column (`like` | `dislike`), with real FKs and `ON DELETE CASCADE`.
- **Pros:** real referential integrity and cascades; simple indexes; each module owns its table (SRP).
- **Cons:** two near-identical entities and repositories.

### Option B: Single polymorphic `reactions` table
- `(user_id, target_type, target_id)` unique, `value` column; one service handles both targets.
- **Pros:** one entity and one code path.
- **Cons:** no FK on `target_id` (polymorphic), so orphans need manual cleanup; mixes two domains in one table.

### Option C: Separate like and dislike tables per target
- `video_likes`, `video_dislikes`, … each with its own unique key.
- **Pros:** trivial counts per table.
- **Cons:** "one reaction per user" must be enforced across two tables in application code; switching like→dislike is a delete + insert across tables.

**Recommendation:** Option A — TypeORM FKs with `ON DELETE CASCADE` keep reactions consistent when a video or comment disappears, and the "one reaction per user per target" rule is a single unique index; the duplication is two small entities.

**Decision:** A (one table per target)

**Libraries:** —

---

## TD-02: Counter maintenance for reactions, comments and subscriptions

**Scope:** Backend

**Capability:** Transversal — covers: Like e dislike em vídeos (usuários autenticados); Comentários em vídeos (usuários autenticados); Like e dislike em comentários (usuários autenticados); Contagem de inscritos na página do canal

**Context:** phase-04-channel-management/TD-08 already decided denormalized counters on `videos` (`like_count`, `comment_count`), and later phases own the increment semantics. This phase adds `dislike_count` (videos), `like_count`/`dislike_count`/`reply_count` (comments) and `subscriber_count` (channels). Concurrent likes/unlikes must not drift the counters.

**Options:**

### Option A: Delta update in the same transaction as the source row
- The service writes the reaction/comment/subscription row and applies `UPDATE … SET x_count = x_count + :delta` in the same transaction; the delta comes from the previous state (none → like = +1, like → dislike = −1/+1, like → none = −1).
- **Pros:** counters are consistent with the source rows at commit; atomic SQL increments avoid lost updates; no extra infrastructure.
- **Cons:** each write touches the counter row (row-level contention on very hot videos — not a concern at this project's scale, same reasoning as TD-08).

### Option B: PostgreSQL triggers
- `AFTER INSERT/UPDATE/DELETE` triggers on the source tables maintain the counters.
- **Pros:** impossible to forget a code path.
- **Cons:** business logic hidden in migrations; harder to unit-test; the project keeps rules in services.

### Option C: Asynchronous recount job
- Writes only touch the source tables; a scheduled BullMQ job recomputes counters.
- **Pros:** zero write contention.
- **Cons:** counters lag; the user does not see their own like reflected immediately.

**Recommendation:** Option A — it extends the TD-08 model with the same "counter column + atomic delta" rule inside the write transaction, keeps rules in services where tests already live, and gives read-your-own-write counts.

**Decision:** A (delta update in the same transaction)

**Libraries:** —

**Revisions:**
- 2026-11-11 — Counter semantics: `videos.comment_count` counts all non-deleted comments of the video (roots + replies); `comments.reply_count` counts the non-deleted replies of a root; deleting a comment (TD-06 soft delete or removal) decrements both, and a "Comment deleted" placeholder is not counted. Rationale: AMB-2 resolved in /plan-resolve phase-06-social-interactions — the meaning of `comment_count`/`reply_count` was undefined.

---

## TD-03: Reaction API contract

**Scope:** Cross-layer

**Capability:** Transversal — covers: Like e dislike em vídeos (usuários autenticados); Like e dislike em comentários (usuários autenticados)

**Context:** The frontend reaction buttons need an endpoint to set, switch and clear a reaction, and the updated counts to re-render without a refetch. The same shape should serve videos and comments.

**Options:**

### Option A: Idempotent set/clear — `PUT …/reaction` + `DELETE …/reaction`
- `PUT /videos/:id/reaction` with `{ value: "like" | "dislike" }` sets the caller's reaction; `DELETE` clears it; same pair under `/comments/:id/reaction`. Responses return `{ like_count, my_reaction }`.
- **Pros:** idempotent and retry-safe; the client states the desired end state, so double clicks cannot invert it.
- **Cons:** the client decides toggle semantics (click on an active like → `DELETE`).

### Option B: Toggle endpoints — `POST …/like`, `POST …/dislike`
- Each call flips the corresponding state server-side.
- **Pros:** mirrors the button semantics directly.
- **Cons:** not idempotent — a retried or doubled request flips the state back.

### Option C: Single `POST …/reactions` with value and toggle semantics
- The server toggles when the same value is sent twice.
- **Pros:** one endpoint per target.
- **Cons:** same non-idempotency as B, plus implicit semantics.

**Recommendation:** Option A — idempotent PUT/DELETE fits the BFF retry/refresh path (`withRefresh` re-sends a request after a 401) without risking a flipped state; the dislike count is stored but **not** exposed publicly (Figma shows only the like count, matching YouTube), so the response carries `like_count` and `my_reaction`.

**Decision:** A (idempotent PUT/DELETE; like_count + my_reaction)

**Libraries:** —

**Revisions:**
- 2026-11-11 — Write rule for reactions: `PUT/DELETE /videos/:id/reaction` follows the video read rule (phase-04-channel-management/TD-04 — a draft is 404 for non-owners, unlisted is reachable by link); a readable video whose `processing_status` is not `ready` returns 409 `VIDEO_NOT_READY`; the channel owner may react to their own video. Comment reactions apply the same rule to the comment's video. Rationale: AMB-1 resolved in /plan-resolve phase-06-social-interactions — the capabilities did not say which videos accept reactions.

---

## TD-04: Comment threading depth

**Scope:** Cross-layer

**Capability:** Respostas a comentários (comentários aninhados)

**Context:** "Comentários aninhados" must be bounded: the depth model shapes the table, the listing queries and the thread UI.

**Options:**

### Option A: One reply level (YouTube style)
- `comments.parent_id` points only to a top-level comment; replying to a reply attaches it to the same root (the UI may prefix `@handle`).
- **Pros:** two simple queries (roots, replies of a root); bounded UI; matches the Figma comment row with a "Reply" action.
- **Cons:** no deep conversations.

### Option B: Unlimited depth with adjacency list
- `parent_id` can point to any comment; the tree is loaded recursively (recursive CTE).
- **Pros:** arbitrary conversations.
- **Cons:** recursive queries and pagination per level; deep indentation in the UI.

### Option C: Materialized path (`ltree`)
- Each comment stores its path; subtrees load with one indexed query.
- **Pros:** efficient subtree reads at any depth.
- **Cons:** PostgreSQL extension plus path maintenance for a need the plan does not state.

**Recommendation:** Option A — the capability asks for replies, not conversations of arbitrary depth; one level keeps both the listing API (TD-05) and the thread UI simple.

**Decision:** A (one reply level)

**Libraries:** —

---

## TD-05: Comment listing contract (order, pagination, replies)

**Scope:** Cross-layer

**Capability:** Transversal — covers: Comentários em vídeos (usuários autenticados); Respostas a comentários (comentários aninhados)

**Context:** The watch page lists comments ("Sort by: Latest" in Figma, 4,256 comments) and their replies. The list is append-heavy, so the inherited keyset convention (phase-04-channel-management/TD-09) applies; what is open is ordering and how replies are loaded.

**Options:**

### Option A: Roots newest-first + replies on demand
- `GET /videos/:id/comments` returns top-level comments newest-first with keyset cursor, each with `reply_count`; `GET /comments/:id/replies` returns replies oldest-first with keyset cursor. Reads follow the video read rule (draft → 404).
- **Pros:** constant-size pages; replies load only when expanded; matches inherited keyset.
- **Cons:** an extra request per expanded thread.

### Option B: Roots with the first N replies embedded
- Each root carries up to N replies; more via the replies endpoint.
- **Pros:** fewer round trips for small threads.
- **Cons:** larger, variable payloads; two ways to read replies.

### Option C: Selectable sort (latest / top)
- Option A plus `sort=top` by `like_count`.
- **Pros:** richer UX.
- **Cons:** a second keyset ordering and index for a sort the capabilities do not request.

**Recommendation:** Option A — newest-first roots with keyset pagination reuse the convention already implemented for public listings, and lazy replies keep pages bounded; "top" sorting can be added later as a revision.

**Decision:** A (roots newest-first + lazy replies, keyset)

**Libraries:** —

---

## TD-06: Comment lifecycle and limits

**Scope:** Cross-layer

**Capability:** Comentários em vídeos (usuários autenticados)

**Context:** Beyond creating comments, the API must define whether comments can be edited or deleted, what happens to replies of a deleted comment, the maximum length, and how to stop comment spam (the throttler is currently scoped to `AuthModule` only).

**Options:**

### Option A: Create-only
- No edit or delete in this phase.
- **Pros:** smallest surface.
- **Cons:** users cannot remove their own comments.

### Option B: Author can delete (soft delete) — no edit
- `DELETE /comments/:id` by its author; a root with replies becomes a "Comment deleted" placeholder (content cleared) so the thread survives; a comment without replies is removed. Content is 1–2,000 characters (trimmed); comment creation is throttled per user with `@nestjs/throttler`.
- **Pros:** basic user control without edit history; threads stay readable.
- **Cons:** placeholder rows remain; counters must exclude/handle deleted comments.

### Option C: Author edit + delete, video owner moderation
- Option B plus `PATCH` with an "edited" flag and deletion by the channel owner.
- **Pros:** full control.
- **Cons:** more endpoints and authorization rules than the capabilities ask for.

**Recommendation:** Option B — deleting one's own comment is the minimum expected control, soft delete keeps reply threads intact under TD-04 A, and a per-user throttle on comment creation reuses the already-installed throttler (new limit values in the Joi env schema).

**Decision:** B (author soft delete, 1–2,000 chars, throttled)

**Libraries:** —

**Revisions:**
- 2026-11-11 — Write rule for comments: `POST /videos/:id/comments` (and replies) follows the video read rule (phase-04-channel-management/TD-04 — a draft is 404 for non-owners, unlisted is reachable by link); a readable video whose `processing_status` is not `ready` returns 409 `VIDEO_NOT_READY`; the channel owner may comment on their own video. Rationale: AMB-1 resolved in /plan-resolve phase-06-social-interactions — the capabilities did not say which videos accept comments.

---

## TD-07: Subscription storage and subscriber count

**Scope:** Backend

**Capability:** Transversal — covers: Inscrição em canais (seguir/deixar de seguir); Contagem de inscritos na página do canal

**Context:** Users follow/unfollow channels; the channel page shows the subscriber count (Figma "9.88K subscribers"). Rules are needed for self-subscription and for how the count is served.

**Options:**

### Option A: `subscriptions` table + denormalized `channels.subscriber_count`
- `(user_id, channel_id)` unique with FKs and cascades; `subscriber_count` maintained with the TD-02 delta rule; subscribing to one's own channel is rejected (`409`/`400` domain error); `PUT`/`DELETE /channels/:nickname/subscription` mirrors the TD-03 idempotent pattern.
- **Pros:** cheap count reads on every channel and watch page; consistent with the video counters.
- **Cons:** one more counter to maintain.

### Option B: `subscriptions` table + `COUNT(*)` on read
- The count is computed with an indexed aggregate.
- **Pros:** no counter maintenance.
- **Cons:** an aggregate on every channel/watch page view; grows with popular channels.

**Recommendation:** Option A — the count is read far more often than it changes, and the same counter-column pattern is already used for videos (phase-04-channel-management/TD-08).

**Decision:** A (subscriptions table + denormalized subscriber_count)

**Libraries:** —

---

## TD-08: Viewer-specific state in read responses

**Scope:** Cross-layer

**Capability:** Transversal — covers: Like e dislike em vídeos (usuários autenticados); Like e dislike em comentários (usuários autenticados); Inscrição em canais (seguir/deixar de seguir)

**Context:** To render the active like/dislike and the "Subscribed" state, the frontend needs the caller's own state for the video, each comment and the channel. Public reads already use an optional-auth guard.

**Options:**

### Option A: Embed viewer state in the existing optional-auth reads
- `GET /videos/:id` adds `my_reaction` and `channel.subscriber_count` + `channel.is_subscribed`; comment items add `my_reaction`; the public channel response adds `subscriber_count` + `is_subscribed`. Anonymous callers get `null`/`false`.
- **Pros:** one request per screen (fits the watch page RSC read, phase-05-video-watch-frontend/TD-02); no extra round trips.
- **Cons:** per-viewer responses cannot be shared-cached (already the case — reads are uncached).

### Option B: Separate "my state" endpoints
- `GET /videos/:id/my-state`, `GET /channels/:nickname/my-subscription`, … called after the public read.
- **Pros:** public responses stay viewer-agnostic.
- **Cons:** extra requests per screen and per comment page.

**Recommendation:** Option A — the watch page already reads the detail with the caller's bearer, so embedding the viewer fields avoids extra BFF routes and requests; public counts stay identical for everyone.

**Decision:** A (viewer state embedded in optional-auth reads)

**Libraries:** —

---

## TD-09: Subscribed-channels area and feed

**Scope:** Cross-layer

**Capability:** Área de canais seguidos com acesso rápido aos vídeos

**Context:** Authenticated users need a place listing the channels they follow and quick access to those channels' videos.

**Options:**

### Option A: Channel list + aggregated feed computed on read
- `GET /me/subscriptions` lists followed channels (keyset by subscription date); `GET /me/subscriptions/videos` returns the latest public published videos of those channels (keyset by `published_at, public_id`, joining `subscriptions` → `videos`).
- **Pros:** reuses the existing public-listing query and card shape; no new storage; always consistent with publish/unpublish and visibility changes.
- **Cons:** the feed query joins per request (indexed; fine at this scale).

### Option B: Fan-out on write (per-user inbox table)
- Publishing a video inserts rows into each subscriber's inbox.
- **Pros:** constant-time feed reads at very large scale.
- **Cons:** write amplification, backfill on subscribe, and cleanup on unpublish/visibility change — unjustified for this project.

### Option C: Channel list only
- The area lists channels; "access to videos" means opening each channel page.
- **Pros:** minimal backend.
- **Cons:** weaker reading of "acesso rápido aos vídeos".

**Recommendation:** Option A — two read endpoints over existing tables satisfy "acesso rápido aos vídeos" with the inherited keyset convention and the `PublicVideoDto` card shape, without the consistency cost of fan-out.

**Decision:** A (channel list + feed computed on read)

**Libraries:** —

---

## Decisions Summary

| ID | Scope | Decision | Recommendation | Choice |
|----|-------|----------|---------------|--------|
| TD-01 | Backend | Reaction storage model | A (one table per target) | A (one table per target) |
| TD-02 | Backend | Counter maintenance | A (delta update in the same transaction) | A (delta update in the same transaction) |
| TD-03 | Cross-layer | Reaction API contract | A (idempotent PUT/DELETE; like count + my_reaction) | A (idempotent PUT/DELETE; like_count + my_reaction) |
| TD-04 | Cross-layer | Comment threading depth | A (one reply level) | A (one reply level) |
| TD-05 | Cross-layer | Comment listing contract | A (roots newest-first + lazy replies, keyset) | A (roots newest-first + lazy replies, keyset) |
| TD-06 | Cross-layer | Comment lifecycle and limits | B (author soft delete, 2,000 chars, throttled) | B (author soft delete, 1–2,000 chars, throttled) |
| TD-07 | Backend | Subscription storage and subscriber count | A (table + denormalized counter) | A (subscriptions table + denormalized subscriber_count) |
| TD-08 | Cross-layer | Viewer-specific state in reads | A (embed in optional-auth reads) | A (viewer state embedded in optional-auth reads) |
| TD-09 | Cross-layer | Subscribed-channels area and feed | A (channel list + feed computed on read) | A (channel list + feed computed on read) |
