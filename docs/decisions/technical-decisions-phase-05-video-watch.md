---
scope_type: phase
related_phases: [5]
status: decided
date: 2026-11-05
scope_description: "Backend slice of Phase 05 (video watch page): view counting rules, same-category suggestions for the sidebar, download access on the watch page, and verification of anonymous and unlisted access."
covers_capabilities:
  - "Contagem de visualizações"
  - "Sugestões de vídeos da mesma categoria na sidebar"
  - "Acesso anônimo à visualização de vídeos"
  - "Botão de download do vídeo"
  - "Vídeos unlisted acessíveis apenas via link direto (sem aparecer em listagens)"
---

# Technical Decisions — Fase 05: Página de Visualização do Vídeo (backend slice)

_Subprojects in scope:_

- `nestjs-project/` — receives the view counting endpoint and its deduplication, the suggestions endpoint, and the download access change. Covered by TD-01..TD-03.
- `next-frontend/` — **no open decision in this document.** By user choice (2026-11-05: "Slice: backend now") the watch page itself (player controls, page layout, description expand/collapse, sidebar rendering) belongs to a sibling slice `phase-05-video-watch-frontend`, researched later (same model as Phases 02 and 04). That slice owns the bullets "Player de vídeo com controles: play/pause, volume e barra de progresso", "Layout da página: vídeo principal + informações + sidebar com sugestões" and "Descrição do vídeo com expansão/recolhimento". The cross-layer contracts it will consume (TD-01, TD-02, TD-03) **are decided here once**.

Inherited constraints (not reopened):
- Progressive faststart MP4 delivered by presigned GET URLs, one stored object for stream and download (phase-03-videos/TD-08).
- Drafts owner-only with 404; unlisted is readable by link and never listed; Phase 04 owns the unlisted rule and Phase 05 only verifies it on the watch page (phase-04-channel-management/TD-04 + revision). This already delivers anonymous viewing through the optional-JWT read routes.
- Denormalized `view_count` / `like_count` / `comment_count` columns on `videos`; Phase 05 owns the view increment semantics (phase-04-channel-management/TD-08).
- Category catalog, with category required to publish (phase-04-channel-management/TD-01, TD-02).
- Offset pagination for the owner panel, cursor for public listings (phase-04-channel-management/TD-09).
- Thumbnails served from the public-read `thumbnails/` prefix (phase-04-channel-management/TD-07).
- Redis already in the stack for BullMQ (phase-03-videos/TD-02); `ioredis` is installed.
- Domain exception error envelope, class-validator DTOs, snake_case wire fields and OpenAPI export (phase-02-auth/TD-06, TD-07; openapi-docs-nestjs/TD-02).

---

## TD-01: View Counting Rule

**Scope:** Cross-layer

**Capability:** Contagem de visualizações

**Context:** `videos.view_count` exists since Phase 04 and is always 0. Phase 05 must define what counts as a view, who triggers the increment (the API on its own, or the player through an explicit call), and how repeated views by the same viewer are handled. Anonymous viewers count too, so deduplication cannot rely on a user id alone. The frontend calls the API through the Next BFF, so the API sees the BFF's address unless the client IP is forwarded. Both sides are affected: the backend defines the endpoint and rules, the frontend player decides when to call it.

**Options:**

### Option A: Count on stream URL issuance
- Every successful `GET /videos/:id/stream` atomically runs `view_count = view_count + 1`. No new endpoint; the player does nothing extra.
- **Pros:** zero frontend work; impossible to forget the call; one atomic SQL update.
- **Cons:** counts page loads, not plays (a reload, a prefetch or an expired-URL refresh each add a view); trivially inflated by repeated requests; the owner's own previews count.

### Option B: Explicit view event from the player, deduplicated per viewer in Redis
- The player calls `POST /videos/:id/views` once playback actually starts. The API counts it only if the viewer key (user id when authenticated, otherwise a hash of client IP + user agent) has not viewed that video within a time window, using Redis `SET key NX EX <window>`; then it runs the atomic increment.
- **Pros:** counts real plays; repeated reloads within the window do not inflate the number; Redis is already deployed; the increment stays a single column update.
- **Cons:** needs a frontend call at playback start; the BFF must forward the client IP (`X-Forwarded-For`) and Nest must trust the proxy, or every anonymous viewer collapses into one key; a client can still forge calls (acceptable for this project).

### Option C: Raw view event log plus periodic aggregation
- Each view is inserted into a `video_views` table (video, viewer key, timestamp); a scheduled job aggregates into `view_count`.
- **Pros:** full history for analytics and later anti-fraud rules; dedup can be computed in SQL.
- **Cons:** a new table growing with every view, a scheduled job and lag before counts update; more than this phase asks for.

**Recommendation:** Option B — it counts actual plays rather than page loads, reuses the Redis instance already running for BullMQ, and keeps `view_count` a cheap column read for listings and the Phase 07 "most viewed" sort; the BFF IP forwarding is a one-time contract the frontend slice inherits.

**Decision:** B (`POST /videos/:id/views` from the player, deduplicated per viewer in Redis with `SET NX EX`)
**Libraries:** ioredis

**Revisions:**
- 2026-11-06 — Dedup parameters fixed: the window is `VIEW_DEDUP_WINDOW_SECONDS` (default `86400`, 24 h), added to the Joi env schema; the viewer key is the user id when authenticated, otherwise a SHA-256 hash of client IP + user agent; views by the channel owner are not counted (the endpoint returns 204 without incrementing). Rationale: AMB-3 resolved in /plan-resolve phase-05-video-watch — the TD left the window, key composition and owner self-views open.
- 2026-11-06 — This slice extends the `GET /videos/:id` response with `view_count` and an embedded `channel` summary (`nickname`, `name`) so the watch page renders its info block from one call. Rationale: AMB-2 resolved in /plan-resolve phase-05-video-watch — the Phase 04 detail response had neither field.
- 2026-11-06 — The API trusts exactly one proxy hop (Express `trust proxy` = 1, set at bootstrap): `req.ip` resolves to the last `X-Forwarded-For` entry, i.e. the client address appended by the Next BFF, and the same value keys both the anonymous viewer hash and the per-IP auth throttling of phase-02-auth/TD-08. Extra entries a client prepends through the BFF are ignored. This guarantee holds only while the API is reachable solely through the BFF: a caller connecting to the API port directly can still set that last entry, so the deployment must not expose the API publicly (in local dev the published port 3000 is an accepted exception). Rationale: ICC-1 resolved in /plan-resolve phase-05-video-watch — trusting the forwarded IP without a hop limit would let callers bypass the auth rate limit.

---

## TD-02: Same-category Suggestions for the Sidebar

**Scope:** Cross-layer

**Capability:** Transversal — covers: Sugestões de vídeos da mesma categoria na sidebar; Vídeos unlisted acessíveis apenas via link direto (sem aparecer em listagens)

**Context:** The watch page sidebar lists other videos from the same category. Every option below uses a dedicated public endpoint `GET /videos/:id/suggestions` returning a fixed-size list (no pagination), so the sidebar can load independently of the main video. Only published + public + ready videos qualify, never the current video, never unlisted or drafts (the unlisted rule applies to every listing). The open choice is the ordering, which shapes both the query and what users see; it also has to handle categories with too few videos.

**Options:**

### Option A: Most recent in the same category
- Order by `published_at DESC`, limit N (e.g., 12); when the category has fewer than N, fill the rest with the most recent public videos from other categories.
- **Pros:** simple, deterministic, cheap with the existing `published_at` index; new uploads get exposure.
- **Cons:** ignores popularity; the same few latest videos appear on every page of the category.

### Option B: Most viewed in the same category, recency as tie-break
- Order by `view_count DESC, published_at DESC`, same limit and fill rule as A.
- **Pros:** uses the counter this phase starts filling; surfaces what other viewers watched; degrades gracefully to recency while counts are low.
- **Cons:** popular videos dominate, new ones get little exposure; needs an index on `(category_id, view_count)` to stay cheap as the table grows.

### Option C: Random sample from the same category
- `ORDER BY random()` (or a sampled subset), same limit and fill rule.
- **Pros:** varied sidebar on each visit; fair exposure.
- **Cons:** non-deterministic (hard to test, no caching); `random()` scans the whole category as it grows.

**Recommendation:** Option B — it turns the view counts introduced in TD-01 into visible value on the sidebar while recency breaks ties (so it behaves like A until counts accumulate), and it stays deterministic for tests; the fill rule keeps the sidebar populated for small categories.

**Decision:** B (`view_count DESC, published_at DESC`, filled from other categories when short)

**Revisions:**
- 2026-11-06 — Contract fixed: the list size is 12 (code constant); when the caller cannot read the current video the endpoint returns 404 like the read routes (phase-04-channel-management/TD-04); when the current video has no category (only possible for the owner's own draft) it returns the most recent public videos. Rationale: AMB-1 resolved in /plan-resolve phase-05-video-watch — the TD left list size and these two edge cases open.

---

## TD-03: Download Access on the Watch Page

**Scope:** Cross-layer

**Capability:** Transversal — covers: Botão de download do vídeo; Acesso anônimo à visualização de vídeos

**Context:** `GET /videos/:id/download` exists since Phase 03 but is restricted to the video owner (phase-03-videos/TD-08 revision of 2026-11-03), because at that time no watch page existed. Phase 05 puts a download button on the watch page, which anonymous viewers can open. The policy decides who sees the button (frontend) and who gets a download URL (backend). The download serves the same object the stream already exposes through a presigned URL.

**Options:**

### Option A: Keep owner-only download
- The button is shown only to the channel owner; others get the current 403/404.
- **Pros:** no backend change; creators keep control over file copies.
- **Cons:** the watch page button is useless for viewers, which is what the capability implies; little real protection, since anyone can already save the stream URL's bytes.

### Option B: Anyone who can watch can download
- Download follows exactly the read access rule of the stream (phase-04-channel-management/TD-04): published videos (public or unlisted) for everyone including anonymous viewers, drafts only for the owner.
- **Pros:** one access rule for stream and download; matches anonymous viewing; the button works for every viewer; no new state.
- **Cons:** creators cannot opt out of downloads (a per-video toggle would be a later feature); reverses the Phase 03 owner-only revision, which must be recorded.

### Option C: Authenticated users only
- Any logged-in user can download readable videos; anonymous viewers are asked to log in.
- **Pros:** a light incentive to register; downloads are attributable to an account.
- **Cons:** a second, different rule from the stream; anonymous viewers already get the bytes through the stream URL, so the restriction is cosmetic.

**Recommendation:** Option B — download serves the same object the stream already hands to anyone who can watch, so aligning both on the TD-04 read rule removes a rule that protects nothing and makes the button meaningful for anonymous viewers; recording it as a revision of phase-03-videos/TD-08 keeps the history clear.

**Decision:** A (keep owner-only download; the watch page shows the button only to the channel owner)

**Note:** Decision deliberately diverged from the Recommendation — `GET /videos/:id/download` stays restricted to the channel owner exactly as recorded in the phase-03-videos/TD-08 revision of 2026-11-03, so no revision of that TD is needed; the frontend decides whether to show the button by comparing the session's `channelSlug` with the `channel.nickname` that this slice adds to `GET /videos/:id` (TD-01 revision).

---

## Decisions Summary

| ID | Scope | Decision | Recommendation | Choice |
|----|-------|----------|---------------|--------|
| TD-01 | Cross-layer | View Counting Rule | B (player view event, Redis dedup per viewer) | B |
| TD-02 | Cross-layer | Same-category Suggestions for the Sidebar | B (most viewed, recency tie-break, fill from other categories) | B |
| TD-03 | Cross-layer | Download Access on the Watch Page | B (anyone who can watch can download) | A |
