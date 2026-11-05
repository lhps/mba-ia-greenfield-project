---
scope_type: phase
related_phases: [4]
status: decided
date: 2026-11-03
scope_description: "Backend slice of Phase 04 (video and channel management): category catalog, video metadata rules, publication/visibility model and read access by state, custom thumbnail upload/normalization/delivery, engagement counters for the management panel, listing pagination, public channel identifier and channel profile edit rules."
---

# Technical Decisions — Fase 04: Gerenciamento de Vídeos e Canal (backend slice)

_Subprojects in scope:_

- `nestjs-project/` — receives the category catalog, the video edit/publish endpoints, custom thumbnail handling, the owner management listing, the channel edit endpoint and the public channel endpoints. Covered by TD-01..TD-11.
- `next-frontend/` — **no open decision in this document.** By user choice (2026-11-03: "Slice: backend now") the screens (management panel, video edit form, channel edit form, public channel page) belong to a sibling slice `phase-04-channel-management-frontend`, researched later (same model as Phase 02). Cross-layer contracts the frontend will consume (TD-01, TD-02, TD-03, TD-04, TD-05, TD-07, TD-09, TD-10, TD-11) **are decided here once**; the frontend slice inherits them.

Inherited constraints (not reopened): orthogonal `processing_status` + `publication_status` columns (phase-03-videos/TD-05), 11-char random `public_id` (phase-03-videos/TD-06), presigned GET delivery and owner-only download (phase-03-videos/TD-08 + revisions), SeaweedFS behind the S3 API only (phase-03-videos/TD-12), typed `spawn` FFmpeg wrapper (phase-03-videos/TD-07), `[a-z0-9_]` nickname allowlist (phase-02-auth/TD-10), class-validator DTOs (phase-02-auth/TD-06), domain exception filter error shape (phase-02-auth/TD-07), snake_case wire fields and OpenAPI export (openapi-docs-nestjs/TD-02).

---

## TD-01: Video Category Catalog

**Scope:** Cross-layer

**Capability:** Categorias de vídeo disponíveis na plataforma

**Context:** Videos need a category (edited in Phase 04, used for sidebar suggestions in Phase 05). The catalog's storage defines the identifier the frontend sends and displays (`GET /categories`, `category` field on video responses) and whether Phase 05 can join on it. There is no admin role in the project, so the list is curated by developers.

**Options:**

### Option A: `categories` table seeded by a data migration
- Table `categories` (`id`, unique `slug`, `name`), rows inserted by a migration; `videos.category_id` nullable FK. Public `GET /categories` lists them.
- **Pros:** referential integrity; Phase 05 suggestions join/filter on an indexed FK; names can change without touching videos; adding a category is one migration.
- **Cons:** one more entity/module; adding a category still needs a migration (no runtime admin).

### Option B: Code constant + `varchar` column validated in the DTO
- Categories live in a `*.constants.ts` list (`slug` → `name`); `videos.category` stores the slug; DTO validates with `@IsIn`. `GET /categories` serves the constant.
- **Pros:** no table, no join; trivial to read.
- **Cons:** no DB-level integrity (a removed slug leaves orphan values); renaming a slug requires a data migration anyway; list changes need a deploy.

### Option C: PostgreSQL native enum column
- `videos.category` as a pg enum (same mechanism as the Phase 03 status columns).
- **Pros:** DB-level integrity without an extra table; consistent with existing enum usage.
- **Cons:** values can be added but not removed/renamed without recreating the type; display names still live in code; enum churn produces awkward migrations.

**Recommendation:** Option A — categories are reference data that Phase 05 filters and joins on, so a seeded table with a stable `slug` gives integrity and an indexed FK without inventing an admin UI; the cost is a single migration and a small read-only module.

**Decision:** A (`categories` table seeded by a data migration)

**Revisions:**
- 2026-11-04 — Initial seed list (display name → slug): Música `musica`, Jogos `jogos`, Educação `educacao`, Esportes `esportes`, Entretenimento `entretenimento`, Tecnologia `tecnologia`, Notícias `noticias`, Humor `humor`, Viagens `viagens`, Outros `outros`. Rationale: AMB-4 resolved in /plan-resolve 04 — the capability did not define which categories exist.

---

## TD-02: Video Metadata Rules and Draft Defaults

**Scope:** Cross-layer

**Capability:** Transversal — covers: Edição das informações do vídeo: título, descrição, categoria e thumbnail customizada; Fluxo de rascunho → publicação; Edição de vídeos a partir do painel

**Context:** Phase 03 creates the draft at upload start with no title, description or category (`POST /videos` takes only file info). Phase 04 must define which fields are required, their limits (mirrored by the frontend form validation) and what a draft shows in the panel before the user edits it. Depends on TD-03 for the publish preconditions.

**Options:**

### Option A: Title defaulted from the file name; category required only to publish
- At draft creation the title is set from the uploaded file name (extension stripped, truncated to the limit); description and category optional while draft. Limits: title 1–100 chars, description ≤ 5000 chars. Publishing requires a category.
- **Pros:** every video always has a title in the panel/listings; no change to the Phase 03 `POST /videos` contract; mirrors the familiar YouTube behavior.
- **Cons:** file names like `IMG_1234` become titles until edited; Phase 03 draft creation needs a small change.

### Option B: Nullable title, required only at publish
- Title, description and category nullable while draft; the publish transition checks all required fields.
- **Pros:** no synthetic data; Phase 03 creation untouched.
- **Cons:** panel and APIs must handle `title: null` everywhere (placeholder rendering in the frontend); more null-checks across responses.

### Option C: Title required when starting the upload
- `POST /videos` gains a required `title`; the frontend asks for it before the upload starts.
- **Pros:** no defaults, no nulls.
- **Cons:** breaks the Phase 03 contract and its E2E specs; adds friction before a 10 GB upload begins.

**Recommendation:** Option A — the panel lists titles for every video (including drafts still processing), so a non-null title defaulted from the file name avoids null-handling on both sides without breaking the Phase 03 upload contract; requiring a category only at publish keeps drafts editable while guaranteeing Phase 05 suggestions have a category to match on.

**Decision:** A (Title defaulted from the file name; category required only to publish)

---

## TD-03: Publication and Visibility State Model

**Scope:** Cross-layer

**Capability:** Transversal — covers: Visibilidade do vídeo: público (aparece para todos) ou unlisted (somente via link); Fluxo de rascunho → publicação; Painel de gerenciamento de vídeos do canal (thumbnail, título, visualizações, likes, comentários, tempo de publicação e status)

**Context:** Phase 03 left `publication_status` with only `draft` (phase-03-videos/TD-05 deferred `published`/visibility to Phase 04). Phase 04 needs public vs unlisted, the draft → published transition, and a publication time for the panel. The model drives the API fields the frontend renders (status badge, visibility selector) and the filters every listing uses.

**Options:**

### Option A: `publication_status` (draft | published) + separate `visibility` (public | unlisted) + `published_at`
- Extend the enum with `published`; add `visibility` (default `public`, editable at any time) and nullable `published_at` (set on first publish). Transition via a dedicated action (`POST /videos/:id/publish` / `unpublish`) that enforces preconditions (`processing_status = ready`, TD-02 required fields).
- **Pros:** keeps the orthogonal-columns principle from phase-03-videos/TD-05; visibility can be chosen while still a draft; listing filter is explicit (`published AND public`); preconditions surface as distinct domain errors.
- **Cons:** two columns to keep consistent in every query; one migration adding an enum value plus columns.

### Option B: Single enum `publication_status` (draft | public | unlisted) + `published_at`
- Publishing means moving to `public` or `unlisted`.
- **Pros:** one column, fewer invalid combinations.
- **Cons:** the user cannot pre-select visibility while still a draft; switching public ↔ unlisted reads as a publication transition; mixes two concerns phase-03-videos/TD-05 deliberately separated.

### Option C: Derive "published" from `published_at` + `visibility` column
- Drop the use of `publication_status`; a video is published when `published_at IS NOT NULL`.
- **Pros:** fewer enum values.
- **Cons:** abandons the Phase 03 column (dead or migrated data); unpublishing must null the timestamp, losing the original publication time; status is implicit.

**Recommendation:** Option A — it is the extension phase-03-videos/TD-05 was designed for (no data migration of existing rows), lets the edit form keep visibility independent from the publish action, and gives the panel its "tempo de publicação" and status columns directly; unpublish returns the video to `draft` while keeping the first `published_at`.

**Decision:** A (`publication_status` draft | published + separate `visibility` + `published_at`)

---

## TD-04: Read Access Policy by Publication State

**Scope:** Cross-layer

**Capability:** Transversal — covers: Visibilidade do vídeo: público (aparece para todos) ou unlisted (somente via link); Fluxo de rascunho → publicação; Página pública do canal com informações e listagem de vídeos

**Context:** The phase-03-videos/TD-08 revision made any `ready` video streamable by its `public_id` link, even as draft, explicitly deferring the rule to Phase 04. With a real publish flow, the API must decide who can read metadata (`GET /videos/:id`), stream and thumbnails of drafts. The frontend needs to know whether to send the session token on public reads (owner preview).

**Options:**

### Option A: Drafts owner-only; published by link (unlisted) or listed (public)
- Non-owners get `404` for drafts on metadata and stream (existence not revealed); owners read their drafts by sending their token (optional-auth on these routes). Published unlisted: readable by link, never listed. Published public: readable and listed.
- **Pros:** the draft state actually means private; matches user expectation of a publish step; single rule for all read endpoints.
- **Cons:** read routes become optionally authenticated (guard that accepts but does not require a token); the frontend BFF must forward the session on those reads.

### Option B: Keep Phase 03 behavior (any ready video readable by link)
- Draft only affects listings; anyone with the link can watch.
- **Pros:** no change to the read endpoints.
- **Cons:** "draft" leaks once a link is shared or guessed; publishing becomes cosmetic.

### Option C: Drafts owner-only plus shareable preview token
- As A, plus an owner-generated preview link (token query param) for reviewers.
- **Pros:** allows pre-publication review.
- **Cons:** token lifecycle and revocation — not requested by any capability.

**Recommendation:** Option A — it closes the gap the Phase 03 revision left open with one consistent rule, uses 404 to avoid confirming that a draft exists, and needs only an optional-auth guard on read routes; preview sharing (C) can be added later without breaking this contract.

**Decision:** A (Drafts owner-only; published by link (unlisted) or listed (public))

**Revisions:**
- 2026-11-04 — Phase 04 owns the full unlisted rule: state model, exclusion of unlisted (and draft) videos from the public channel listing, and link-only access on the read endpoints; Phase 05 only verifies it on the watch page. Rationale: AMB-2 resolved in /plan-resolve 04 — the rule appeared in both the Phase 04 and Phase 05 bullets.

---

## TD-05: Custom Thumbnail Upload Protocol

**Scope:** Cross-layer

**Capability:** Edição das informações do vídeo: título, descrição, categoria e thumbnail customizada

**Context:** Owners upload an image to replace the auto-generated thumbnail. Unlike videos (up to 10 GB, browser → storage per phase-03-videos/TD-04), thumbnails are small (≤ 2 MB is the common platform limit). The handshake lives in both the frontend form/BFF and the API. Depends on TD-06 (the server may need the bytes to normalize them).

**Options:**

### Option A: Presigned PUT to a staging key + completion endpoint
- API returns a presigned PUT; the browser uploads; `POST /videos/:id/thumbnail/complete` makes the API validate (HeadObject size/type, then reads the object) and promote it.
- **Pros:** same pattern as video upload; bytes skip the BFF/API on the way in.
- **Cons:** presigned PUT cannot cap the size before upload (only checked afterwards); three round trips; staging cleanup needed; normalization still makes the API download the object.

### Option B: `multipart/form-data` through BFF → API (size-capped)
- The form posts the file to the BFF, which forwards it to `PUT /videos/:id/thumbnail`; the API enforces a 2 MB limit (Multer memory storage), validates/normalizes and writes the result to storage.
- **Pros:** one request; validation and normalization happen before anything is stored; no staging objects or cleanup; trivial client code.
- **Cons:** small payloads pass through BFF and API memory (bounded by the 2 MB cap); BFF must forward multipart bodies.

### Option C: Presigned POST with policy conditions
- API issues a POST policy (`content-length-range`, `Content-Type`) via `@aws-sdk/s3-presigned-post`; browser posts the form directly to storage; completion endpoint as in A.
- **Pros:** storage rejects oversize uploads before they land; bytes skip the API.
- **Cons:** new dependency; SeaweedFS documents browser POST uploads but enforcement of `content-length-range` would need a spike; CORS for POST; still needs completion + server-side read for normalization.

**Recommendation:** Option B — the "bytes never touch the API" rule from Phase 03 exists for 10 GB videos; a 2 MB image capped at the edge is cheap to proxy, and since TD-06 needs the bytes server-side anyway, a single request removes staging keys, cleanup and an extra completion handshake.

**Decision:** B (`multipart/form-data` through BFF → API, size-capped at 2 MB)

---

## TD-06: Custom Thumbnail Validation and Normalization

**Scope:** Backend

**Capability:** Edição das informações do vídeo: título, descrição, categoria e thumbnail customizada

**Context:** User-supplied images are untrusted (wrong extension, polyglot files, EXIF with GPS location, arbitrary dimensions). Listings (TD-07) look best with uniform 16:9 images. FFmpeg is already in the API/worker image (phase-03-videos/TD-07).

**Options:**

### Option A: Validate only (magic bytes + size), store as uploaded
- Accept JPEG/PNG/WebP by content sniffing, reject others; store the original bytes.
- **Pros:** no image processing; fastest.
- **Cons:** EXIF metadata (including location) is published; arbitrary dimensions/weights reach listings; content-type confusion risk remains.

### Option B: Re-encode with FFmpeg to a fixed JPEG (e.g., 1280×720)
- Decode the upload with the existing FFmpeg wrapper, scale/crop to 16:9 and write JPEG; failure to decode = invalid image.
- **Pros:** reuses an installed, already-wrapped binary (no new dependency); strips metadata; uniform output for every listing; decoding doubles as validation.
- **Cons:** spawning FFmpeg in the API request path (tens to hundreds of ms for a 2 MB image); less ergonomic than an image library for crops.

### Option C: Re-encode with `sharp` (libvips) in-process
- Same outcome as B using `sharp`.
- **Pros:** fast, idiomatic image API, no process spawn.
- **Cons:** new native dependency (platform-specific binaries in the Docker image); second media toolchain alongside FFmpeg.

**Recommendation:** Option B — re-encoding removes EXIF/location leaks and normalizes every thumbnail for the panel and public grid, and FFmpeg is already installed and wrapped, so it adds no dependency; the synchronous cost is acceptable for a ≤ 2 MB image and can move to the queue later if it ever matters.

**Decision:** B (Re-encode with FFmpeg to a fixed 16:9 JPEG)

**Revisions:**
- 2026-11-04 — Bounded exception to phase-03-videos/TD-03: re-encoding a custom thumbnail (≤ 2 MB image) runs synchronously in the API process, using the FFmpeg already shipped in the shared API/worker image; all video processing (probe, transcode, frame extraction) stays in the worker. Rationale: ICC-1 resolved in /plan-resolve 04 — TD-03 keeps heavy FFmpeg CPU off the API, and a single small-image re-encode is outside that intent.

---

## TD-07: Thumbnail URL Delivery in Listings

**Scope:** Cross-layer

**Capability:** Transversal — covers: Painel de gerenciamento de vídeos do canal (thumbnail, título, visualizações, likes, comentários, tempo de publicação e status); Página pública do canal com informações e listagem de vídeos

**Context:** Today `GET /videos/:id` returns a presigned GET `thumbnail_url` (1 h TTL). Phase 04 adds listings with many thumbnails per page (panel, public channel page; later home/search in Phase 07). The URL form decides browser caching and what the frontend puts in `<img src>`.

**Options:**

### Option A: Presigned GET URL per thumbnail in every response (current)
- Each listed item carries a freshly signed URL.
- **Pros:** no storage policy change; access stays private by default; already implemented.
- **Cons:** URLs change on every response, so browsers re-download thumbnails on each visit (no cache hits); URLs expire while a page stays open.

### Option B: Public-read prefix for thumbnails with versioned keys
- A bucket policy grants anonymous `s3:GetObject` on a `thumbnails/` prefix only (supported by SeaweedFS 4.51 bucket policies); keys include a version (e.g., `thumbnails/{video_uuid}/{version}.jpg`) so a new upload gets a new URL. Responses carry stable public URLs.
- **Pros:** stable, long-cacheable URLs; no signing per item; simplest `<img src>` for the frontend.
- **Cons:** anyone holding a thumbnail URL can fetch it regardless of draft/unlisted (keys use the internal UUID, so not enumerable); bucket policy added to the bootstrap; thumbnail keys move away from the Phase 03 layout.

### Option C: API redirect endpoint
- `GET /videos/:id/thumbnail` checks access (TD-04) and 302-redirects to a presigned URL.
- **Pros:** stable URL in markup; access policy enforced per request.
- **Cons:** every thumbnail in a page becomes an API request; caching depends on redirect headers; extra hop on the hottest path.

**Recommendation:** Option B — listings are thumbnail-heavy and only stable URLs get browser caching; a policy scoped to the `thumbnails/` prefix keeps videos private, and the residual exposure (fetching a thumbnail whose unguessable URL you already have) is acceptable for an image that is shown publicly once the video is published.

**Decision:** B (Public-read `thumbnails/` prefix with versioned keys)

---

## TD-08: Engagement Counters for the Management Panel

**Scope:** Backend

**Capability:** Painel de gerenciamento de vídeos do canal (thumbnail, título, visualizações, likes, comentários, tempo de publicação e status)

**Context:** The panel shows views, likes and comments, but those features arrive in Phase 05 (views) and Phase 06 (likes/comments). Phase 04 must fix the storage strategy now so the panel response is stable and later phases know where to write.

**Options:**

### Option A: Denormalized counter columns on `videos`
- `view_count`, `like_count`, `comment_count` (default 0) added now; later phases increment atomically (`SET x = x + 1`).
- **Pros:** panel/listing reads are a plain column read; sorting by views (Phase 07) is cheap; Phase 04 ships real fields returning 0.
- **Cons:** risk of drift if an increment path is missed; counter writes touch the hot `videos` row (and `updated_at` if not excluded).

### Option B: Compute with aggregates when the source tables exist
- Phase 04 returns 0 constants; Phases 05/06 replace them with `COUNT` subqueries/joins.
- **Pros:** single source of truth, no drift.
- **Cons:** aggregate cost on every listing page; the panel query changes shape in later phases; sorting by counts is expensive.

### Option C: Separate `video_stats` table (1:1)
- Counters live in their own row keyed by `video_id`.
- **Pros:** isolates frequent counter writes from the `videos` row (no `updated_at` churn, less row contention).
- **Cons:** extra table and join in every listing; row creation must accompany each video.

**Recommendation:** Option A — the panel and future listings need cheap reads and sortable counts, and at this project's scale write contention on the `videos` row is not a real constraint; later phases own the increment semantics (e.g., Phase 05 view counting rules), and C remains a later refactor if contention appears.

**Decision:** A (Denormalized counter columns on `videos`)

**Revisions:**
- 2026-11-04 — Phase 04 acceptance: the panel response always includes `view_count`, `like_count` and `comment_count`, which stay `0` until Phases 05/06 increment them. Rationale: AMB-1 resolved in /plan-resolve 04 — the counters' source features land in later phases.

---

## TD-09: Listing Pagination Strategy

**Scope:** Cross-layer

**Capability:** Transversal — covers: Painel de gerenciamento de vídeos do canal (thumbnail, título, visualizações, likes, comentários, tempo de publicação e status); Página pública do canal com informações e listagem de vídeos; Edição de vídeos a partir do painel

**Context:** Phase 04 introduces the first list endpoints (owner panel, public channel videos). The pagination contract is coupled to UI behavior (page numbers vs infinite scroll) and will set the precedent for Phase 07 home/search.

**Options:**

### Option A: Offset/page everywhere
- `page` + `per_page` query params, response with `items` and `total`.
- **Pros:** simplest; supports page numbers and totals; one convention.
- **Cons:** deep offsets scan; items shift (duplicates/skips) when new videos are inserted while scrolling.

### Option B: Cursor (keyset) everywhere
- Opaque cursor over (`sort_key`, `id`); response with `items` + `next_cursor`.
- **Pros:** stable under inserts; constant cost per page; fits infinite scroll.
- **Cons:** no totals or jump-to-page, which management tables usually show; cursor encoding/validation.

### Option C: Offset for the owner panel, cursor for public listings
- Panel (per-channel, page numbers, total) uses offset; public listings (channel page now, home/search later) use cursor.
- **Pros:** each list gets the behavior its UI needs; public feeds that grow with uploads stay stable.
- **Cons:** two conventions to document and implement in the frontend.

**Recommendation:** Option C — the panel is a bounded per-owner table where totals and page jumps matter, while public listings are append-heavy feeds rendered as infinite grids where keyset pagination avoids duplicates; the second convention is a one-time cost that Phase 07 reuses.

**Decision:** C (Offset for the owner panel, cursor for public listings)

---

## TD-10: Public Channel Identifier in URLs

**Scope:** Cross-layer

**Capability:** Transversal — covers: Página pública do canal com informações e listagem de vídeos; Edição das informações do canal: nickname, nome e descrição

**Context:** The public channel page needs a URL key (API `GET /channels/:key` and the frontend route). The natural handle is the `nickname`, but this phase also makes the nickname editable, so links built on it can break.

**Options:**

### Option A: Nickname handle (e.g., `/@{nickname}`)
- Lookup by the current nickname only.
- **Pros:** readable, memorable URLs; matches common platforms; no extra data.
- **Cons:** a nickname change breaks old links; a freed nickname can be taken by someone else.

### Option B: Nickname handle + redirect history
- Old nicknames are kept in a history table; lookups by an old handle return the canonical one (frontend redirects).
- **Pros:** readable URLs without breaking shared links.
- **Cons:** extra table and lookup path; must reserve old handles to avoid hijacking.

### Option C: Immutable channel public ID, nickname display-only
- URL uses a random immutable channel id (like video `public_id`); nickname is shown but not addressable.
- **Pros:** links never break.
- **Cons:** unreadable channel URLs; adds a second identifier to channels.

**Recommendation:** Option A — readable handles are the expected UX for a channel page, and the link-breaking risk is contained by the change limits in TD-11; Option B can be layered later as a fallback lookup without changing the URL contract.

**Decision:** A (Nickname handle)

---

## TD-11: Channel Profile Edit Rules

**Scope:** Cross-layer

**Capability:** Edição das informações do canal: nickname, nome e descrição

**Context:** Channel `name` (≤ 50), `nickname` (unique, ≤ 50) and `description` become editable. Since the nickname is the URL key (TD-10), the rules for format, reserved words and change frequency affect both the API validation and the frontend form mirror. The generation allowlist `[a-z0-9_]` comes from phase-02-auth/TD-10.

**Options:**

### Option A: Validation only, unlimited changes
- Nickname: `[a-z0-9_]`, 3–30 chars, unique, not in a reserved list (route words such as `api`, `login`, `channel`). Name 1–50 chars; description ≤ 1000 chars.
- **Pros:** simplest; no extra state.
- **Cons:** unlimited handle swapping churns links (TD-10) and enables impersonation by grabbing a just-released handle.

### Option B: Validation + nickname change cooldown
- Same rules as A, plus a `nickname_changed_at` column allowing one nickname change per 14 days; name/description unrestricted.
- **Pros:** limits link churn and handle-squatting with one column; clear domain error for the frontend to show.
- **Cons:** a user who mistypes must wait (mitigated by allowing changes while the account has no published videos, if desired).

### Option C: Validation + release quarantine for old handles
- Same as A, and a released nickname stays reserved for N days before anyone else can claim it.
- **Pros:** prevents hijacking of recently released handles.
- **Cons:** needs a reserved-handles table (overlaps TD-10 Option B); more moving parts than the problem warrants now.

**Recommendation:** Option B — with handle-based URLs (TD-10 A), a cooldown is the cheapest guard against link churn and handle swapping; a single timestamp column and one domain error cover it, while quarantine (C) can arrive together with redirect history if ever needed.

**Decision:** B (Validation + 14-day nickname change cooldown)

**Revisions:**
- 2026-11-04 — The channel update endpoint returns the updated channel (including `nickname`) so the frontend slice can refresh the session's `channelSlug` (phase-02-auth-frontend/TD-02); the backend does no session handling. Rationale: AMB-3 resolved in /plan-resolve 04 — a nickname edit would leave the session cookie stale.
- 2026-11-04 — Existing handles are grandfathered: the edit rules (3–30 chars, reserved list) apply only when a new nickname value is submitted. Phase 04 also aligns registration-time generation (phase-02-auth/TD-10) with these rules: generated handles are padded/truncated to 3–30 chars and a reserved-word match falls back to `user_<8-char-random>`; the reserved list is shared by generation and edit validation. Rationale: ICC-2 resolved in /plan-resolve 04 — generated handles could be 1–2 chars, longer than 30, or a reserved route word.

---

## Decisions Summary

| ID | Scope | Decision | Recommendation | Choice |
|----|-------|----------|----------------|--------|
| TD-01 | Cross-layer | Video category catalog | A (`categories` table seeded by migration) | A |
| TD-02 | Cross-layer | Video metadata rules and draft defaults | A (title from file name; category required to publish) | A |
| TD-03 | Cross-layer | Publication and visibility state model | A (`draft`/`published` + `visibility` + `published_at`) | A |
| TD-04 | Cross-layer | Read access policy by publication state | A (drafts owner-only, 404 to others) | A |
| TD-05 | Cross-layer | Custom thumbnail upload protocol | B (multipart via BFF → API, 2 MB cap) | B |
| TD-06 | Backend | Custom thumbnail validation and normalization | B (re-encode with FFmpeg to 16:9 JPEG) | B |
| TD-07 | Cross-layer | Thumbnail URL delivery in listings | B (public-read `thumbnails/` prefix, versioned keys) | B |
| TD-08 | Backend | Engagement counters for the management panel | A (counter columns on `videos`) | A |
| TD-09 | Cross-layer | Listing pagination strategy | C (offset for panel, cursor for public listings) | C |
| TD-10 | Cross-layer | Public channel identifier in URLs | A (nickname handle) | A |
| TD-11 | Cross-layer | Channel profile edit rules | B (validation + 14-day nickname cooldown) | B |
