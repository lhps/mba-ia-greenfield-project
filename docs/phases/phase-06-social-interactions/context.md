---
kind: phase
name: phase-06-social-interactions
sources_mtime:
  docs/project-plan.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-phase-06-social-interactions.md: "2026-11-11T11:51:35-03:00"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-next-frontend-openapi-typing.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-next-frontend-config-base.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-next-frontend-msw-foundation.md: "2026-10-21T16:43:34-03:00"
  docs/phases/phase-01-configuracao-base/context.md: "2026-10-21T16:43:34-03:00"
  docs/phases/phase-02-auth/context.md: "2026-10-21T16:43:34-03:00"
  docs/phases/phase-02-auth-frontend/context.md: "2026-10-21T16:43:34-03:00"
  docs/phases/phase-03-videos/context.md: "2026-11-03T23:14:14-03:00"
  docs/phases/phase-04-channel-management/context.md: "2026-11-04T21:02:21-03:00"
  docs/phases/phase-05-video-watch/context.md: "2026-11-06T18:52:00-03:00"
  docs/phases/phase-05-video-watch-frontend/context.md: "2026-11-10T16:27:36-03:00"
  .claude/skills/testing-guide-nestjs-project/SKILL.md: "2026-10-21T16:43:34-03:00"
---

# phase-06-social-interactions — Context

## Scope

**Phase name:** Interações Sociais (Likes, Comentários, Inscrições)
**Capabilities** (literal, `docs/project-plan.md`):

- Like e dislike em vídeos (usuários autenticados)
- Comentários em vídeos (usuários autenticados)
- Respostas a comentários (comentários aninhados)
- Like e dislike em comentários (usuários autenticados)
- Inscrição em canais (seguir/deixar de seguir)
- Área de canais seguidos com acesso rápido aos vídeos
- Contagem de inscritos na página do canal
- Interface completa de comentários, likes e inscrições

**Out of scope:** _Not specified._
**Deliverables:** likes/dislikes funcionando, comentários com respostas, inscrição em canais, listagem de canais seguidos.
**Affected subprojects:** `nestjs-project` — backend slice `phase-06-social-interactions` (project-plan.md names no subprojects for this phase; inferred from the slice's `covers_capabilities` and decisions doc).
**Deferred subprojects:** `next-frontend` — the UI ("Interface completa de comentários, likes e inscrições") belongs to a future frontend slice of Phase 06 (user choice 2026-11-10: "Backend agora").
**Sequencing notes:** "> Depende de: Fase 02, Fase 05".

**Neighbors (for boundary detection only):**

- **Phase 05:** Página de Visualização do Vídeo — "Página onde o usuário assiste ao vídeo com player funcional, descrição, sugestões e acesso anônimo."
- **Phase 07:** Página Inicial, Busca e Finalização — "Home page com listagem de vídeos, busca, navegação geral, responsividade e preparação para produção."

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| phase-06-social-interactions/TD-01 | phase | Backend | Reaction storage model | decided | A (one table per target) | — |
| phase-06-social-interactions/TD-02 | phase | Backend | Counter maintenance for reactions, comments and subscriptions | decided | A (delta update in the same transaction) | — |
|     └─ Last revision: 2026-11-11 — Counter semantics: `videos.comment_count` counts all non-deleted comments of the video (roots + repl… | | | | | | |
| phase-06-social-interactions/TD-03 | phase | Cross-layer | Reaction API contract | decided | A (idempotent PUT/DELETE; like_count + my_reaction) | — |
|     └─ Last revision: 2026-11-11 — Write rule for reactions: `PUT/DELETE /videos/:id/reaction` follows the video read rule (phase-04-ch… | | | | | | |
| phase-06-social-interactions/TD-04 | phase | Cross-layer | Comment threading depth | decided | A (one reply level) | — |
| phase-06-social-interactions/TD-05 | phase | Cross-layer | Comment listing contract (order, pagination, replies) | decided | A (roots newest-first + lazy replies, keyset) | — |
| phase-06-social-interactions/TD-06 | phase | Cross-layer | Comment lifecycle and limits | decided | B (author soft delete, 1–2,000 chars, throttled) | — |
|     └─ Last revision: 2026-11-11 — Write rule for comments: `POST /videos/:id/comments` (and replies) follows the video read rule (phas… | | | | | | |
| phase-06-social-interactions/TD-07 | phase | Backend | Subscription storage and subscriber count | decided | A (subscriptions table + denormalized subscriber_count) | — |
| phase-06-social-interactions/TD-08 | phase | Cross-layer | Viewer-specific state in read responses | decided | A (viewer state embedded in optional-auth reads) | — |
| phase-06-social-interactions/TD-09 | phase | Cross-layer | Subscribed-channels area and feed | decided | A (channel list + feed computed on read) | — |

_Source files:_

- phase-06-social-interactions — `docs/decisions/technical-decisions-phase-06-social-interactions.md` (scope_type: phase, related_phases: [6])

## Capability Coverage

| Capability (from project-plan.md) | Covered by |
|-----------------------------------|------------|
| Like e dislike em vídeos (usuários autenticados) | phase-06-social-interactions/TD-01, phase-06-social-interactions/TD-02, phase-06-social-interactions/TD-03, phase-06-social-interactions/TD-08 |
| Comentários em vídeos (usuários autenticados) | phase-06-social-interactions/TD-02, phase-06-social-interactions/TD-05, phase-06-social-interactions/TD-06 |
| Respostas a comentários (comentários aninhados) | phase-06-social-interactions/TD-04, phase-06-social-interactions/TD-05 |
| Like e dislike em comentários (usuários autenticados) | phase-06-social-interactions/TD-01, phase-06-social-interactions/TD-02, phase-06-social-interactions/TD-03, phase-06-social-interactions/TD-08 |
| Inscrição em canais (seguir/deixar de seguir) | phase-06-social-interactions/TD-07, phase-06-social-interactions/TD-08 |
| Área de canais seguidos com acesso rápido aos vídeos | phase-06-social-interactions/TD-09 |
| Contagem de inscritos na página do canal | phase-06-social-interactions/TD-02, phase-06-social-interactions/TD-07 |
| Interface completa de comentários, likes e inscrições | — _(owned by the future frontend slice of Phase 06; not in this slice's `covers_capabilities`)_ |

## Decisions Detail

### phase-06-social-interactions/TD-01

**Recommendation:** Option A — TypeORM FKs with `ON DELETE CASCADE` keep reactions consistent when a video or comment disappears, and the "one reaction per user per target" rule is a single unique index; the duplication is two small entities.
**Libraries:** —

### phase-06-social-interactions/TD-02

**Recommendation:** Option A — it extends the TD-08 model with the same "counter column + atomic delta" rule inside the write transaction, keeps rules in services where tests already live, and gives read-your-own-write counts.
**Libraries:** —

**Revisions:**
- 2026-11-11 — Counter semantics: `videos.comment_count` counts all non-deleted comments of the video (roots + replies); `comments.reply_count` counts the non-deleted replies of a root; deleting a comment (TD-06 soft delete or removal) decrements both, and a "Comment deleted" placeholder is not counted. Rationale: AMB-2 resolved in /plan-resolve phase-06-social-interactions — the meaning of `comment_count`/`reply_count` was undefined.

### phase-06-social-interactions/TD-03

**Recommendation:** Option A — idempotent PUT/DELETE fits the BFF retry/refresh path (`withRefresh` re-sends a request after a 401) without risking a flipped state; the dislike count is stored but **not** exposed publicly (Figma shows only the like count, matching YouTube), so the response carries `like_count` and `my_reaction`.
**Libraries:** —

**Revisions:**
- 2026-11-11 — Write rule for reactions: `PUT/DELETE /videos/:id/reaction` follows the video read rule (phase-04-channel-management/TD-04 — a draft is 404 for non-owners, unlisted is reachable by link); a readable video whose `processing_status` is not `ready` returns 409 `VIDEO_NOT_READY`; the channel owner may react to their own video. Comment reactions apply the same rule to the comment's video. Rationale: AMB-1 resolved in /plan-resolve phase-06-social-interactions — the capabilities did not say which videos accept reactions.

### phase-06-social-interactions/TD-04

**Recommendation:** Option A — the capability asks for replies, not conversations of arbitrary depth; one level keeps both the listing API (TD-05) and the thread UI simple.
**Libraries:** —

### phase-06-social-interactions/TD-05

**Recommendation:** Option A — newest-first roots with keyset pagination reuse the convention already implemented for public listings, and lazy replies keep pages bounded; "top" sorting can be added later as a revision.
**Libraries:** —

### phase-06-social-interactions/TD-06

**Recommendation:** Option B — deleting one's own comment is the minimum expected control, soft delete keeps reply threads intact under TD-04 A, and a per-user throttle on comment creation reuses the already-installed throttler (new limit values in the Joi env schema).
**Libraries:** —

**Revisions:**
- 2026-11-11 — Write rule for comments: `POST /videos/:id/comments` (and replies) follows the video read rule (phase-04-channel-management/TD-04 — a draft is 404 for non-owners, unlisted is reachable by link); a readable video whose `processing_status` is not `ready` returns 409 `VIDEO_NOT_READY`; the channel owner may comment on their own video. Rationale: AMB-1 resolved in /plan-resolve phase-06-social-interactions — the capabilities did not say which videos accept comments.

### phase-06-social-interactions/TD-07

**Recommendation:** Option A — the count is read far more often than it changes, and the same counter-column pattern is already used for videos (phase-04-channel-management/TD-08).
**Libraries:** —

### phase-06-social-interactions/TD-08

**Recommendation:** Option A — the watch page already reads the detail with the caller's bearer, so embedding the viewer fields avoids extra BFF routes and requests; public counts stay identical for everyone.
**Libraries:** —

### phase-06-social-interactions/TD-09

**Recommendation:** Option A — two read endpoints over existing tables satisfy "acesso rápido aos vídeos" with the inherited keyset convention and the `PublicVideoDto` card shape, without the consistency cost of fan-out.
**Libraries:** —

## Inherited Decisions Detail

### phase-01-configuracao-base/TD-01

**Recommendation:** Option A (@nestjs/config) — Official, core-team-maintained, guaranteed NestJS 11 compatibility. The `registerAs()` factory pattern solves the TypeORM CLI sharing problem: the factory function can be imported as a plain function by `data-source.ts` while also serving as a DI injection token inside NestJS. Building a custom module recreates solved functionality; third-party packages carry maintenance risk.

**Libraries:** `@nestjs/config@^4.x`

### phase-01-configuracao-base/TD-02

**Recommendation:** Option A (Joi) — First-class integration with `@nestjs/config` via `validationSchema`, requiring zero custom wiring. Handles string-to-number coercion natively. Using a different tool for env validation vs. request validation is reasonable — env config is validated once at startup, DTOs are validated per-request. Zod is elegant but adds a third validation paradigm to the project.

**Libraries:** `joi@^17.x`

### phase-01-configuracao-base/TD-03

**Recommendation:** Option B (Namespaced/grouped with registerAs) — The project roadmap explicitly calls for auth, email, and storage in upcoming phases. Namespaced configs provide clear file boundaries per domain, typed injection via `ConfigType<typeof databaseConfig>`, and natural scalability. The `registerAs()` factory is dual-purpose: DI token inside NestJS and plain importable function for `data-source.ts`. Initial files for Phase 01: `src/config/database.config.ts`, `src/config/app.config.ts`.

**Libraries:** —

### phase-01-configuracao-base/TD-04

**Recommendation:** Option A (Shared registerAs factory) — Natural outcome of choosing `@nestjs/config` with `registerAs`. The factory is already callable by design. `data-source.ts` imports it, calls `dotenv.config()`, then calls the factory. Zero duplication, minimal code, no extra abstraction.

**Libraries:** `dotenv` (transitive via `@nestjs/config`)

### phase-02-auth/TD-01

**Recommendation:** Argon2id — For a greenfield project in 2026, Argon2id is the OWASP-recommended choice. The native build dependency is a one-time Docker setup cost. The project has no legacy constraints favoring bcrypt. OWASP minimum: 19MiB memory, 2 iterations.

**Libraries:** `argon2@^0.41.x`

### phase-02-auth/TD-02

**Recommendation:** Option A (@nestjs/passport) — The project plan includes only email/password auth for now, but the plugin architecture costs little and future phases may add social login. Aligns with official NestJS docs, making onboarding and maintenance easier.

**Note:** Decision deliberately diverged from the Recommendation during implementation — custom guards were preferred over `@nestjs/passport` to keep the dependency surface smaller; social login is not on the near-term roadmap, so the plugin-architecture benefit did not justify the extra abstraction layer.

**Libraries:** `@nestjs/jwt@^11.0.0`

### phase-02-auth/TD-03

**Recommendation:** Option A (Refresh Token Rotation) — Provides the strongest security model with automatic theft detection. The DB write overhead is acceptable for a video platform (auth refresh is infrequent vs. video operations). PostgreSQL is already in the stack, so no new infrastructure needed. Race conditions can be mitigated with a short grace period for the old token.

**Libraries:** —

### phase-02-auth/TD-04

**Recommendation:** Option B (Random Opaque Tokens in DB) — Revocability is important: when a user requests a new password reset, previous tokens should be invalidated. The DB table is trivial to implement, and the tokens table can also serve future needs (e.g., API keys). Keeps email tokens decoupled from the JWT auth system.

**Libraries:** —

### phase-02-auth/TD-05

**Recommendation:** Option A (@nestjs-modules/mailer) — Best NestJS integration with minimal boilerplate. Supports SMTP (matching the architecture diagram), works with MailHog/Mailpit for local development without external dependencies, and scales to any SMTP provider in production. Template engine support (Handlebars) simplifies email formatting. No vendor lock-in.

**Libraries:** `@nestjs-modules/mailer@^2.x`, `handlebars@^4.x`

### phase-02-auth/TD-06

**Recommendation:** Option A (class-validator + class-transformer) — This is a backend-only project (no shared schemas with frontend), so Zod's single-source-of-truth advantage is less impactful. class-validator is the documented NestJS approach, and the project already uses decorators extensively (TypeORM entities, NestJS DI). Fewer integration surprises with NestJS 11.

**Libraries:** `class-validator@^0.14.x`, `class-transformer@^0.5.x`

### phase-02-auth/TD-07

**Recommendation:** Option A (Custom Domain Exception Filter) — Provides machine-readable error codes that the Next.js frontend can switch on, without the overhead of RFC 9457's URI-based type system. The project is single-consumer (first-party frontend), so a simple `{ statusCode, error, message }` format with domain codes balances clarity and simplicity. The custom filter cost is low — two small files.

**Libraries:** —

### phase-02-auth/TD-08

**Recommendation:** Option A (@nestjs/throttler) — Native NestJS integration is decisive: the guard system allows scoping rate limiting to `AuthModule` only via module-level `APP_GUARD`, with `@SkipThrottle()` for exemptions. The project is single-instance with no distributed requirements, so in-memory storage is sufficient. Using express-rate-limit would bypass NestJS's DI and guard lifecycle for no clear benefit.

**Libraries:** `@nestjs/throttler@^6.x`

### phase-02-auth/TD-09

**Recommendation:** Option B (Opaque) — Since DB lookup is mandatory (TD-03), JWT signature adds no security value. Opaque tokens are shorter, leak no data, and are simpler to generate.

**Note:** Decision deliberately diverged from the Recommendation — JWT was kept to reuse the access-token signing/verification infrastructure (`@nestjs/jwt`), trading token size and base64-readability for a single token format across the codebase.

**Libraries:** `@nestjs/jwt@^11.0.0`

### phase-02-auth/TD-10

**Recommendation:** Option A — The platform is a video sharing service with URL-based channel handles. A strict `[a-z0-9_]` allowlist is the simplest and most portable choice: no extra dependencies, no edge cases around hyphen positioning, and the `user_<random>` fallback provides a valid handle even for extreme email prefixes. Hyphens can always be added in a future iteration if user feedback justifies it.

**Libraries:** —

### phase-02-auth-frontend/TD-01

**Recommendation:** Three reasons. (1) **Architectural fit.** The strict-BFF model in `next-frontend-config-base/TD-03` already nominates the Route Handler as the only NestJS caller; cookie-based sessions are the natural match, and Auth.js's framework adds layers between the BFF and the cookie that buy nothing because the backend is the auth authority — Auth.js's value (DB adapters, OAuth providers, magic-link, `getServerSession` helpers) is mostly unused in this configuration. (2) **Smaller blast radius.** A ~50-LOC session helper is grep-friendly, debuggable, and test-friendly via the existing MSW+BFF integration test pattern; a misconfigured Auth.js callback is a longer fault-isolation loop. (3) **Compatibility with Next.js 16 / React 19.** Built-in `next/headers` `cookies()` is the canonical primitive both runtimes already use; Auth.js v5 versions track Next.js majors with a lag, adding compatibility risk that Option A does not have. Option C is rejected as unsafe (`localStorage` for refresh tokens) and architecturally regressive (loses RSC personalization).
**Libraries:** —

### phase-02-auth-frontend/TD-02

**Recommendation:** Three reasons. (1) **Defense in depth on the cookie content** — `httpOnly` blocks JS, encryption blocks accidental log/proxy inspection; the marginal cost is one ~3KB dep. (2) **Single cookie to manage** simplifies logout (one `session.destroy()` call) and avoids the orphan-cookie failure mode of Option A. (3) **Room to carry minimal user metadata** (`userId`, `email`, `channelSlug`) lets `app/layout.tsx` RSC render the authenticated chrome (avatar, channel name) without a per-render `/auth/me` round-trip — Phase 04+ gains compound here. Option A is a viable downgrade if the team rejects `iron-session` for any reason; the migration A→B (or B→A) is a one-Route-Handler refactor with no test changes downstream because the BFF interface is unchanged. Option C is rejected: it solves a problem (server-side revocation) the project does not have at the cost of infrastructure the project does not own.
**Libraries:** iron-session

### phase-02-auth-frontend/TD-03

**Recommendation:** The single-flight detail is non-trivial and goes in the helper from day one — tested by MSW with a "two concurrent intercepted upstream calls; one refresh expected" assertion. Option B's client-driven pattern is rejected because it doesn't replace Option A (RSC still needs server-side refresh) — adopting B means doing both. Option C's pre-emptive timer is rejected because the failure modes (multiple tabs, sleep/wake) outweigh the latency saving and force a `"use client"` shell near the root.
**Libraries:** —

### phase-02-auth-frontend/TD-04

**Recommendation:** Three reasons. (1) **Decoupled from TD-05** — works with Route Handlers OR Server Actions; the form code does not change if TD-05 is revisited later. (2) **Aligned with shadcn's canonical form primitive** — the project already commits to `radix-nova` shadcn (`components.json`); `npx shadcn@latest add form` produces react-hook-form wrappers; choosing react-hook-form means using the supported primitive instead of hand-rolling around it. (3) **Zod-first developer ergonomics match the rest of the FE foundation** — `next-frontend-config-base/TD-01` chose Zod 4 for env; the same schemas-as-source-of-truth pattern carries to forms with zero new validator paradigm. Option B is rejected for impedance with shadcn's primitive and for over-investing in progressive-enhancement that the strict-BFF model does not require. Option C is rejected for the per-field boilerplate and the loss of client-side feedback on a project that values quick, type-safe form iteration.
**Libraries:** react-hook-form, @hookform/resolvers

### phase-02-auth-frontend/TD-05

**Recommendation:** Three reasons. (1) **Strict-BFF alignment.** `next-frontend-config-base/TD-03` named Route Handlers as the BFF surface; Option A keeps every mutation visible under `app/api/**`. (2) **Test scaffold already exists** — `next-frontend/CLAUDE.md` § Testing and `next-frontend-msw-foundation` were authored for Route-Handlers-as-functions; Option A reuses them with zero invention. (3) **Single mutation surface** — Phase 02 sets the precedent for Phases 03–07; uniformity beats per-mutation idiom-picking when the cost of inconsistency compounds (Option C). Option B has real ergonomic appeal for the simplest forms but fragments the BFF surface and forces test-pattern reinvention; if the team later wants progressive enhancement for specific forms, the migration A→B is per-form and doesn't require touching unrelated routes — A is the safer default and the cheaper baseline.
**Libraries:** —

### phase-02-auth-frontend/TD-06

**Recommendation:** Two reinforcing reasons. (1) **No first-render flicker, no round-trip** — the session is delivered in the same response as the page HTML; the Client Provider hydrates with the correct initial state; users never see "Login" briefly turn into their avatar. (2) **No new BFF endpoint** — the cookie is the source of truth, RSC reads it, the Provider broadcasts it; the BFF surface stays minimal. The `router.refresh()` requirement after mid-session mutations is a small price (one line in the relevant mutation handler) for the structural benefits. Option B is rejected for the double-read-and-flicker; Option C is dominated by Option B and rejected.
**Libraries:** —

### phase-02-auth-frontend/TD-07

**Recommendation:** Three reasons. (1) **First-paint-correct** — the user sees the right outcome on the first paint, no skeleton, no flicker. (2) **Single integration pattern across both flows** — confirmation is RSC-only; reset is RSC + Client form (TD-04, TD-05 patterns reused) — both share the "RSC owns the token, Client Component owns the input" split. (3) **Email-prefetch behavior** is solved at the backend's idempotent-confirmation level (a small note for `/plan-build` to confirm; not a separate TD). Option B's Route-Handler-as-link-target adds redirects for no clean gain. Option C is dominated.
**Libraries:** —

### phase-03-videos/TD-02

**Recommendation:** BullMQ + Redis via `@nestjs/bullmq` — `@nestjs/bullmq` is the documented Nest path and gives retries/backoff/stalled-recovery out of the box, which matter for long FFmpeg jobs; the extra Redis container is cheap in Compose and the transactional-enqueue gap is covered by TD-05's status model (the job is idempotent and keyed by video id).
**Libraries:** @nestjs/bullmq, bullmq

### phase-03-videos/TD-03

**Recommendation:** Same codebase, separate entrypoint and container — it is the only option that honors the C4 container split and keeps FFmpeg CPU off the API, while keeping DI and shared code; cost is one extra Compose service.
**Libraries:** —

### phase-03-videos/TD-04

**Recommendation:** S3 presigned multipart upload, browser → storage direct — it is the only option where the API and the Next BFF never touch the video bytes, which is exactly "10GB sem impacto na performance"; resumability per part covers the realistic failure modes. The public-endpoint env split is a known, documented cost of Docker networking.
**Libraries:** —
**Revisions:**
- 2026-11-03 — Acceptance criterion for "sem impacto na performance" fixed: upload bytes travel browser → storage only (the API and BFF handle just the JSON handshake), so API memory is independent of file size. Rationale: AMB-1 resolved in /plan-resolve 03 — capability wording had no verifiable criterion.
- 2026-11-03 — The `S3Client` must be built with `requestChecksumCalculation: 'WHEN_REQUIRED'` and `responseChecksumValidation: 'WHEN_REQUIRED'`: with the SDK default (`WHEN_SUPPORTED`, since v3.729) presigned `UploadPart` URLs carry `x-amz-checksum-crc32` and a browser `PUT` of the part is rejected with `400 BadDigest`. Rationale: reproduced against SeaweedFS 4.51 and RustFS 1.0.4 during the TD-12 spike (/implement 03, SI-03.1).

### phase-03-videos/TD-05

**Recommendation:** Two orthogonal columns — `processing_status` + `publication_status` — matches the SRP principle in CLAUDE.md (processing vs publication are independent lifecycles) and lets Phase 04 add `published`/visibility without migrating Phase 03 data.
**Libraries:** —

### phase-03-videos/TD-06

**Recommendation:** UUID PK + 11-char random `public_id` — short, non-enumerable, stable regardless of title edits, and independent from the internal PK; the collision logic is a few lines against a unique index.
**Libraries:** —

### phase-03-videos/TD-07

**Recommendation:** Typed `child_process.spawn` wrapper over system ffmpeg/ffprobe — removes a deprecated dependency, and a thin typed wrapper over `spawn` is small, testable, and uses the ffmpeg packaged in the worker image defined by TD-03.
**Libraries:** —

### phase-03-videos/TD-08

**Recommendation:** Progressive faststart MP4 with HTTP Range via presigned GET URLs — meets "streaming sem download completo" with HTTP Range at the lowest processing cost and keeps media bytes off the API/BFF; HLS (Option B) can be added later as an extra worker step without changing the public URL contract.
**Libraries:** —
**Revisions:**
- 2026-11-03 — Download is restricted to the video owner (authenticated channel owner) and serves the same processed faststart MP4 used for streaming (single stored object, presigned GET with `response-content-disposition=attachment`); the original upload is not kept for download. Rationale: AMB-2 resolved in /plan-resolve 03 — user chose owner-only download of the processed file.
- 2026-11-03 — In Phase 03 streaming is open by unique URL: anyone with the video's `public_id` link can stream a `ready` video even while `publication_status = draft`; non-enumerability comes from the 11-char random `public_id` (TD-06). Phase 04 introduces publication/visibility rules. Rationale: AMB-3 resolved in /plan-resolve 03 — boundary with the Phase 04 publish flow.

### phase-03-videos/TD-09

**Recommendation:** Layered checks: declared size/MIME → HeadObject → ffprobe — layered checks (declared → actual size → ffprobe) put each verification where the information truly exists, with one env key (`MAX_UPLOAD_BYTES`) as the shared contract.
**Libraries:** —
**Revisions:**
- 2026-11-03 — Wire field names follow the existing snake_case API convention (`refresh_token`, `access_token`): the init request body uses `file_name`, `file_size` and `content_type` instead of `fileName`, `fileSize`, `contentType`; every new video request/response field is snake_case. Rationale: consistency with the wire format already established by phase-02-auth endpoints (raised during /plan-build 03).

### phase-03-videos/TD-10

**Recommendation:** Storage lifecycle rule + scheduled reconciliation job — the lifecycle rule covers orphaned parts the DB cannot know about, and the reconciliation job keeps draft states truthful; both are small.
**Libraries:** —

### phase-03-videos/TD-11

**Recommendation:** Real Compose services + tiny fixture video — mirrors the established real-DB testing convention and exercises exactly the integration seams this phase introduces; the only cost is installing ffmpeg in the dev image.
**Libraries:** —

### phase-03-videos/TD-12

**Recommendation:** SeaweedFS `chrislusf/seaweedfs:4.51`; bucket, CORS and lifecycle bootstrapped through the S3 API — passed every check this phase relies on, needs no server-wide CORS flag, and was already the documented fallback in TD-01. Both A and B require the SDK checksum setting recorded in TD-04's revision; that requirement is server-independent.
**Libraries:** @aws-sdk/client-s3, @aws-sdk/s3-request-presigner

### phase-04-channel-management/TD-01

**Recommendation:** categories are reference data that Phase 05 filters and joins on, so a seeded table with a stable `slug` gives integrity and an indexed FK without inventing an admin UI; the cost is a single migration and a small read-only module.
**Libraries:** —

**Revisions:**
- 2026-11-04 — Initial seed list (display name → slug): Música `musica`, Jogos `jogos`, Educação `educacao`, Esportes `esportes`, Entretenimento `entretenimento`, Tecnologia `tecnologia`, Notícias `noticias`, Humor `humor`, Viagens `viagens`, Outros `outros`. Rationale: AMB-4 resolved in /plan-resolve 04 — the capability did not define which categories exist.

### phase-04-channel-management/TD-02

**Recommendation:** the panel lists titles for every video (including drafts still processing), so a non-null title defaulted from the file name avoids null-handling on both sides without breaking the Phase 03 upload contract; requiring a category only at publish keeps drafts editable while guaranteeing Phase 05 suggestions have a category to match on.
**Libraries:** —

### phase-04-channel-management/TD-03

**Recommendation:** it is the extension phase-03-videos/TD-05 was designed for (no data migration of existing rows), lets the edit form keep visibility independent from the publish action, and gives the panel its "tempo de publicação" and status columns directly; unpublish returns the video to `draft` while keeping the first `published_at`.
**Libraries:** —

### phase-04-channel-management/TD-04

**Recommendation:** it closes the gap the Phase 03 revision left open with one consistent rule, uses 404 to avoid confirming that a draft exists, and needs only an optional-auth guard on read routes; preview sharing (C) can be added later without breaking this contract.
**Libraries:** —

**Revisions:**
- 2026-11-04 — Phase 04 owns the full unlisted rule: state model, exclusion of unlisted (and draft) videos from the public channel listing, and link-only access on the read endpoints; Phase 05 only verifies it on the watch page. Rationale: AMB-2 resolved in /plan-resolve 04 — the rule appeared in both the Phase 04 and Phase 05 bullets.

### phase-04-channel-management/TD-05

**Recommendation:** the "bytes never touch the API" rule from Phase 03 exists for 10 GB videos; a 2 MB image capped at the edge is cheap to proxy, and since TD-06 needs the bytes server-side anyway, a single request removes staging keys, cleanup and an extra completion handshake.
**Libraries:** —

### phase-04-channel-management/TD-06

**Recommendation:** re-encoding removes EXIF/location leaks and normalizes every thumbnail for the panel and public grid, and FFmpeg is already installed and wrapped, so it adds no dependency; the synchronous cost is acceptable for a ≤ 2 MB image and can move to the queue later if it ever matters.
**Libraries:** —

**Revisions:**
- 2026-11-04 — Bounded exception to phase-03-videos/TD-03: re-encoding a custom thumbnail (≤ 2 MB image) runs synchronously in the API process, using the FFmpeg already shipped in the shared API/worker image; all video processing (probe, transcode, frame extraction) stays in the worker. Rationale: ICC-1 resolved in /plan-resolve 04 — TD-03 keeps heavy FFmpeg CPU off the API, and a single small-image re-encode is outside that intent.

### phase-04-channel-management/TD-07

**Recommendation:** listings are thumbnail-heavy and only stable URLs get browser caching; a policy scoped to the `thumbnails/` prefix keeps videos private, and the residual exposure (fetching a thumbnail whose unguessable URL you already have) is acceptable for an image that is shown publicly once the video is published.
**Libraries:** —

### phase-04-channel-management/TD-08

**Recommendation:** the panel and future listings need cheap reads and sortable counts, and at this project's scale write contention on the `videos` row is not a real constraint; later phases own the increment semantics (e.g., Phase 05 view counting rules), and C remains a later refactor if contention appears.
**Libraries:** —

**Revisions:**
- 2026-11-04 — Phase 04 acceptance: the panel response always includes `view_count`, `like_count` and `comment_count`, which stay `0` until Phases 05/06 increment them. Rationale: AMB-1 resolved in /plan-resolve 04 — the counters' source features land in later phases.

### phase-04-channel-management/TD-09

**Recommendation:** the panel is a bounded per-owner table where totals and page jumps matter, while public listings are append-heavy feeds rendered as infinite grids where keyset pagination avoids duplicates; the second convention is a one-time cost that Phase 07 reuses.
**Libraries:** —

### phase-04-channel-management/TD-10

**Recommendation:** readable handles are the expected UX for a channel page, and the link-breaking risk is contained by the change limits in TD-11; Option B can be layered later as a fallback lookup without changing the URL contract.
**Libraries:** —

### phase-04-channel-management/TD-11

**Recommendation:** with handle-based URLs (TD-10 A), a cooldown is the cheapest guard against link churn and handle swapping; a single timestamp column and one domain error cover it, while quarantine (C) can arrive together with redirect history if ever needed.
**Libraries:** —

**Revisions:**
- 2026-11-04 — The channel update endpoint returns the updated channel (including `nickname`) so the frontend slice can refresh the session's `channelSlug` (phase-02-auth-frontend/TD-02); the backend does no session handling. Rationale: AMB-3 resolved in /plan-resolve 04 — a nickname edit would leave the session cookie stale.
- 2026-11-04 — Existing handles are grandfathered: the edit rules (3–30 chars, reserved list) apply only when a new nickname value is submitted. Phase 04 also aligns registration-time generation (phase-02-auth/TD-10) with these rules: generated handles are padded/truncated to 3–30 chars and a reserved-word match falls back to `user_<8-char-random>`; the reserved list is shared by generation and edit validation. Rationale: ICC-2 resolved in /plan-resolve 04 — generated handles could be 1–2 chars, longer than 30, or a reserved route word.

### phase-05-video-watch/TD-01 _(from slice phase-05-video-watch)_

**Recommendation:** it counts actual plays rather than page loads, reuses the Redis instance already running for BullMQ, and keeps `view_count` a cheap column read for listings and the Phase 07 "most viewed" sort; the BFF IP forwarding is a one-time contract the frontend slice inherits.
**Libraries:** ioredis

**Revisions:**
- 2026-11-06 — Dedup parameters fixed: the window is `VIEW_DEDUP_WINDOW_SECONDS` (default `86400`, 24 h), added to the Joi env schema; the viewer key is the user id when authenticated, otherwise a SHA-256 hash of client IP + user agent; views by the channel owner are not counted (the endpoint returns 204 without incrementing). Rationale: AMB-3 resolved in /plan-resolve phase-05-video-watch — the TD left the window, key composition and owner self-views open.
- 2026-11-06 — This slice extends the `GET /videos/:id` response with `view_count` and an embedded `channel` summary (`nickname`, `name`) so the watch page renders its info block from one call. Rationale: AMB-2 resolved in /plan-resolve phase-05-video-watch — the Phase 04 detail response had neither field.
- 2026-11-06 — The API trusts exactly one proxy hop (Express `trust proxy` = 1, set at bootstrap): `req.ip` resolves to the last `X-Forwarded-For` entry, i.e. the client address appended by the Next BFF, and the same value keys both the anonymous viewer hash and the per-IP auth throttling of phase-02-auth/TD-08. Extra entries a client prepends through the BFF are ignored. This guarantee holds only while the API is reachable solely through the BFF: a caller connecting to the API port directly can still set that last entry, so the deployment must not expose the API publicly (in local dev the published port 3000 is an accepted exception). Rationale: ICC-1 resolved in /plan-resolve phase-05-video-watch — trusting the forwarded IP without a hop limit would let callers bypass the auth rate limit.

### phase-05-video-watch/TD-02 _(from slice phase-05-video-watch)_

**Recommendation:** it turns the view counts introduced in TD-01 into visible value on the sidebar while recency breaks ties (so it behaves like A until counts accumulate), and it stays deterministic for tests; the fill rule keeps the sidebar populated for small categories.
**Libraries:** —

**Revisions:**
- 2026-11-06 — Contract fixed: the list size is 12 (code constant); when the caller cannot read the current video the endpoint returns 404 like the read routes (phase-04-channel-management/TD-04); when the current video has no category (only possible for the owner's own draft) it returns the most recent public videos. Rationale: AMB-1 resolved in /plan-resolve phase-05-video-watch — the TD left list size and these two edge cases open.

### phase-05-video-watch/TD-03 _(from slice phase-05-video-watch)_

**Recommendation:** download serves the same object the stream already hands to anyone who can watch, so aligning both on the TD-04 read rule removes a rule that protects nothing and makes the button meaningful for anonymous viewers; recording it as a revision of phase-03-videos/TD-08 keeps the history clear.

**Note:** Decision deliberately diverged from the Recommendation — `GET /videos/:id/download` stays restricted to the channel owner exactly as recorded in the phase-03-videos/TD-08 revision of 2026-11-03, so no revision of that TD is needed; the frontend decides whether to show the button by comparing the session's `channelSlug` with the `channel.nickname` that this slice adds to `GET /videos/:id` (TD-01 revision).

**Libraries:** —

### next-frontend-config-base/TD-01

**Recommendation:** **Option A (Zod 4)**. Three converging reasons: (1) **Type-inference matches the FE's strict-TS culture** — `lib/env.ts` exports a typed `env` object with no `as` casts, satisfying the project's "Type Safety" working principle. (2) **Ecosystem gravity in Next.js / React 19** — Zod is the de-facto schema language for App Router (Server Actions inputs, form resolvers, future contract validation), so introducing it once at the env layer compounds value for forms in Phase 02+. (3) **Direct enablement of TD-02 Option A (`@t3-oss/env-nextjs`)** — t3-env's first-citizen validator. Backend parity with Joi is not load-bearing: env schemas are not shared FE↔BE (different runtimes, different key sets); two validators across two subprojects is a bounded cost.

**Libraries:** zod

### next-frontend-config-base/TD-02

**Recommendation:** **Option A (`@t3-oss/env-nextjs`)**. The only option that combines (i) **type-level NEXT_PUBLIC_ prefix enforcement**, (ii) **runtime Proxy-based leak detection**, and (iii) **single-file, single-import-path consumer ergonomics**. Option B reaches roughly the same _structural_ outcome at higher implementation and maintenance cost, with a weaker guarantee (no prefix enforcement, no proxy). Option C is unsafe at any non-trivial team size. The marginal cost over B is one ~3KB dep — well-spent for the strongest boundary among the three.

**Libraries:** @t3-oss/env-nextjs

### next-frontend-config-base/TD-03

**Recommendation:** **Option A (Strict BFF — single server-only `API_URL`)**. Aligned with the BFF testing strategy and architectural commitment already documented in `next-frontend/CLAUDE.md` (Route Handlers as the only NestJS caller; BFF tests stub `fetch` via MSW). Eliminates CORS, eliminates public exposure of the backend URL, and produces the smallest correct foundation. Option B's `NEXT_PUBLIC_API_URL` is a future-proofing concession with no current consumer — and adding a public key later is a non-breaking change, while removing one is breaking. Option C ties a foundational decision to infra work explicitly deferred elsewhere. The Docker networking gap (how server-in-container resolves the backend) is a separate orthogonal decision, surfaced below.

**Libraries:** —

### next-frontend-msw-foundation/TD-01

**Recommendation:** **Option B (per-domain modules + barrel)**. Three reasons. (1) **MSW's own best-practice recommends it** — the project should not invent its own scheme when the official one is documented and matches the codebase's domain orientation. (2) **Domain ownership tracks the codebase**, not the project plan — `components/`, `app/api/`, and any future feature folders will be organized by domain (auth, videos, channels), so handler files mirror that vocabulary and remain stable as phases come and go. (3) **Append-only growth with minimal merge conflicts** — each phase touches a new file plus one line in the barrel, which is the smallest practical concurrent-PR footprint. Option A is acceptable through Phase 02 alone (~5–7 endpoints) but accumulates costs that B avoids from day one; bootstrapping directly into B costs one extra file and one barrel and pays off by Phase 03. Option C's phase coupling is rejected outright — domain-by-phase is a category error.

**Libraries:** —

### next-frontend-msw-foundation/TD-02

**Recommendation:** **Option A (test-only, `setupServer` only at the foundation)**. The browser worker is a future capability with no documented current consumer; wiring it now (Option B) is speculative investment, and wiring it incoherently (Option C) actively misleads developers into thinking interception works when it doesn't under strict BFF. Option A keeps the foundation minimal, aligns 1:1 with everything CLAUDE.md and the existing rules currently document, and is non-breaking to extend.

**Libraries:** —

### next-frontend-msw-foundation/TD-03

**Recommendation:** **Option D (hand-written defaults as the default + opt-in seeded faker for bulk collections)**. Reasons: (1) **Option B's determinism + readability is the right baseline** — every fixture in Phase 02 (5–7 endpoints, single-record-mostly) is naturally hand-written, and the diff-revealing override pattern is the highest-value benefit. (2) **Bulk-collection cases will arrive (Phase 07 home page grid, Phase 06 comment threads) and inline hand-written lists of 20+ items are genuinely tedious** — keeping faker available as a scoped tool is pragmatic. (3) **Per-fixture local seeding eliminates the global-cursor pitfall** that makes Option C structurally fragile — using `faker.seed(N)` immediately before a collection-builder run scopes the determinism to that fixture and isolates it from upstream changes to other factories.

**Libraries:** —

### next-frontend-msw-foundation/TD-04

**Recommendation:** **Option A (universal handler set + `server.use(...)` overrides + `onUnhandledRequest: "error"`)**. The user's "import only what it needs" requirement is satisfied at the *authoring* layer by TD-01 (per-domain files; each phase adds one file). At the *runtime* layer, loading all handlers is the canonical MSW v2 model and imposes no cost on tests that don't fetch the extra URLs. `onUnhandledRequest: "error"` enforces that a phase's test cannot accidentally invoke a route outside its scope (the fetch fails loudly with "no handler matched"), which is the strongest version of "stays inside its phase" available. Option B's per-suite composition pays real boilerplate cost for an explicitness gain that TD-01 already provides at a different layer. Option C invents a Vitest-projects-shaped problem for a phase-shaped concern.

**Libraries:** —

### next-frontend-openapi-typing/TD-01

**Recommendation:** **Option A (`openapi-typescript` + `openapi-fetch`)**. Three reinforcing reasons. (1) **Strict BFF makes the SDK surface valueless on the client.** Only Route Handlers ever call the upstream Nest; they already use `fetch` (Next 16's caching extensions sit on top of native `fetch`); a generated SDK adds a third client style to learn for zero functional gain. (2) **Types-first matches the rest of the FE foundation.** Env validation is Zod-derived types; component variants are `cva` types; both are TS-first with zero generated runtime. `paths` is the natural extension — one `.d.ts` file imported wherever the contract is touched. (3) **MSW typing is solved by the same `paths` symbol.** Hand-written handlers in `mocks/handlers.ts` type their resolver returns off `paths["/videos"]["get"]["responses"][200]`, giving the contract guarantee without orval/kubb's verbose generated handlers (which would be overridden per-test anyway). The marginal cost of adding `openapi-fetch` (~6KB, server-side only) is small enough that we recommend the **types + thin-client** pair, not types alone — `openapi-fetch` removes the `fetch(API_URL + path, { method, headers, body })` boilerplate in each Route Handler while staying within the BFF model. Options B/C/D may be revisited if (a) client-side data-fetching enters the stack with TanStack Query and per-endpoint hooks are wanted, or (b) the API grows beyond ~20 operations and per-call boilerplate becomes painful.

**Libraries:** openapi-typescript, openapi-fetch

### next-frontend-openapi-typing/TD-02

**Recommendation:** **Option B (committed local copy + repo-root sync script)**. Three reasons. (1) **Preserves the compose-stack independence** that `next-frontend-config-base/TD-03` Context calls out as the current architecture — neither subproject's compose file references the other. (2) **Drift is eliminated structurally when paired with TD-03's CI freshness check** — the check runs the sync script and asserts no diff on either `openapi.json` or `types.gen.ts`, so a backend PR that forgets to re-sync fails CI with a clear message. (3) **The committed local file is a real artifact in PR review** — reviewers see the contract change in `next-frontend/openapi.json`'s diff at the same time as the backend change, doubling the visibility (an `openapi.json`-only diff in a feature PR is a red flag for accidental drift). Option A is acceptable as a pre-CI fallback; Option C is rejected because the cross-stack file dependency in `docker-compose.yaml` introduces coupling that the current architecture explicitly avoids, and the "no drift" gain over B is small once TD-03 lands.

**Libraries:** —

### next-frontend-openapi-typing/TD-03

**Recommendation:** **Option C (committed + CI freshness check)**. It is the only option that makes contract drift _both_ visible (in PR diffs) _and_ impossible to merge accidentally (CI fail). The complexity premium over Option A is one CI step. Option B's "no committed artifacts" purity is poorly paid for in a monorepo where the cross-subproject build coupling becomes a real ergonomic cost, and it wastes the PR visibility that TD-02 Option B's committed `openapi.json` is specifically designed to deliver. Option A is acceptable as a temporary state until the CI pipeline lands; downgrading from C to A is reversible (just remove the CI step) but upgrading to C later requires explaining `types.gen.ts` history in a separate commit. Start at C. Apply the same script-and-check pattern to any future generated artifact (e.g., if `openapi-fetch` is wrapped, the wrapper file is hand-written; the only generated artifact remains `types.gen.ts`).

**Libraries:** —

### next-frontend-openapi-typing/TD-04

**Recommendation:** **Option A (single `lib/api/contracts.ts` with explicit aliases)**. It is the only option that (i) handles pass-through and reshape with the same mechanism, (ii) gives a single grep target for "what shape does the BFF expose", and (iii) decouples Component imports from App Router file paths (Components import `from "@/lib/api/contracts"`, not `from "@/app/api/videos/route"`). Option B is theoretically minimal but fragile against Next's actual RSC/Client/Route-Handler typing; Option C scatters the contract surface and creates drift opportunities. The "long file" concern is bounded — for the scope of StreamTube, the BFF will likely have <30 contract aliases at peak; sectioning by feature header comments is sufficient. Make `lib/api/contracts.ts` the only file that imports `paths` from `types.gen.ts` (lintable later); every other consumer imports from `contracts.ts`.

**Libraries:** —

### next-frontend-openapi-typing/TD-05

**Recommendation:** **Option A (hand-written, typed via `paths`)**. Reasons: (1) **Determinism over auto-generation** — BFF integration tests assert on specific values; randomized fixtures are anti-helpful. (2) **Coherence with TD-01 recommendation** — `openapi-typescript`'s `paths` type is the single contract anchor; reusing it in MSW handlers means "spec ↔ handler ↔ assertion" is one type chain. (3) **Scale fit** — Phase 02 introduces few endpoints; the manual cost is negligible at this stage. If the API grows to dozens of endpoints and authoring overhead becomes real, this TD can be superseded with a Kubb-or-hey-api MSW plugin without touching TD-01's `paths` import sites (the generator just produces additional handler files; the existing manual handlers stay valid). Option B locks the project into a heavier TD-01 choice for marginal mock-authoring savings; Option C is Option A with an unnecessary detour.

**Libraries:** —

### openapi-docs-nestjs/TD-01

**Recommendation:** **Option A (`@nestjs/swagger`)** — é a única opção que preserva as decisões anteriores (`class-validator` em TD-06 de phase-02-auth) sem re-platform; o CLI plugin com `classValidatorShim: true` aproveita os decoradores `class-validator` existentes para inferir schemas, mantendo o boilerplate baixo. Nestia tem mérito técnico real mas o custo de migração do stack de validação inviabiliza-a sem uma decisão upstream de supersede de TD-06. Manual authoring é descartado.

**Libraries:** @nestjs/swagger

**Revisions:**
- 2026-05-12 — Esclarece que o CLI plugin (`classValidatorShim: true`) cobre apenas inferência de schemas de DTOs a partir de `class-validator`; documentação de operações, respostas tipadas por status code, contratos de erro (alinhados ao envelope de phase-02-auth/TD-07) e exemplos exigem decoradores explícitos (`@ApiOperation`, `@ApiResponse`, `@ApiBody`, `@ApiParam`, `@ApiQuery`, `@ApiExtraModels`). _Rationale:_ openapi.json gerado pelo bootstrap atual está genérico — sem detalhes de parâmetros, schemas de retorno por status, nem contratos de erro — porque a base instalada se apoiou só na introspecção automática. Esta revisão fixa que enriquecimento via decoradores explícitos faz parte da Option A escolhida, não é trabalho fora do escopo do TD.

### openapi-docs-nestjs/TD-02

**Recommendation:** **Option C (Ambos)** — o custo marginal sobre Option A é apenas um npm script (~15 linhas) e o benefício é uma fundação correta para futura integração FE (codegen offline) sem perder a UI interativa que dev/QA usam. Option B sozinho pune a experiência de desenvolvimento em dev/local; Option A sozinho compromete o pipeline de codegen futuro. Combinar é dominante.

**Libraries:** —

### openapi-docs-nestjs/TD-03

**Recommendation:** **Option B (Apenas em dev/staging)** — alinha com a postura defensiva já estabelecida em phase 02 e não compromete consumidores legítimos (o `openapi.json` commitado em TD-02 cumpre o papel de "spec consultável fora da UI"). Re-abrir como Option A ou C é trivial no futuro se um caso de uso de API pública aparecer.

**Libraries:** —

### phase-05-video-watch-frontend/TD-01

**Recommendation:** `/watch/[publicId]` gives a short share link, keeps public viewing apart from the owner's management routes, and uses a plain dynamic segment that Next validates per segment (`not-found.tsx` for an unknown or unreadable video).
**Libraries:** —

**Revisions:**
- 2026-11-09 — Unavailable-video state: `app/watch/[publicId]/not-found.tsx` renders a centered message "This video isn't available" and a "Go to home" link to `/`, using existing tokens and `components/ui/button.tsx`; it covers both an unknown `public_id` and a video the caller cannot read (draft of another user → upstream 404). No Figma frame exists for this state. Rationale: AMB-2 resolved in /plan-resolve phase-05-video-watch-frontend — the not-found content was undefined.

### phase-05-video-watch-frontend/TD-02

**Recommendation:** the detail must be on the server anyway (`notFound()`, `generateMetadata`, owner draft access through the session), and streaming the sidebar keeps the player from waiting on the suggestions query, with no extra Route Handlers for reads. The data is per-viewer (session, owner drafts, live `view_count`), so the reads are uncached (`cache: 'no-store'` / dynamic rendering).
**Libraries:** —

**Revisions:**
- 2026-11-09 — The channel name in the info block is a `next/link` to `/channels/[nickname]` (mirrors the backend `GET /channels/{nickname}`); the link ships now even though the public channel page belongs to the not-yet-built Phase 04 frontend slice, so it resolves to a 404 until that page lands (known gap, same pattern as the phase-02-auth-frontend reset-password destination). Rationale: OQ-6 resolved in /plan-resolve phase-05-video-watch-frontend — the link target route was undefined.
- 2026-11-09 — The channel avatar is an initials avatar (40 px circle, initials from `channel.name`, project tokens) authored as the reusable `components/ui/avatar.tsx`, because the detail contract carries no channel image. Rationale: OQ-7 resolved in /plan-resolve phase-05-video-watch-frontend.
- 2026-11-09 — Description expand/collapse: collapsed state clamps to 3 lines (`line-clamp-3`); a "Show more" button appears only when the text overflows and toggles to "Show less" when expanded, with `aria-expanded` on the button. Rationale: OQ-8 resolved in /plan-resolve phase-05-video-watch-frontend — Figma only shows the expanded card.
- 2026-11-09 — Relative publish date and compact counts render in English through native `Intl.RelativeTimeFormat('en')` and `Intl.NumberFormat('en', { notation: 'compact' })` in a `lib/` formatting utility (no new dependency), e.g. "3 weeks ago", "10K views"; the same utility formats the suggestion cards. Rationale: OQ-9 resolved in /plan-resolve phase-05-video-watch-frontend — format/locale were undefined; English matches Figma and the existing UI.

### phase-05-video-watch-frontend/TD-03

**Recommendation:** the bullet asks for exactly three controls over a single progressive MP4. Radix `Slider` and the existing `IconButton` already give accessible, design-consistent building blocks, so a library would add a dependency and a second component style for little gain. Vidstack (C) is the fallback if fullscreen, keyboard shortcuts or captions become requirements.
**Libraries:** radix-ui

**Revisions:**
- 2026-11-09 — When the video is readable but `processing_status` is not `ready` (the owner opening their own draft while it is processing or after it failed), the player area renders a status placeholder ("Processing…" / "Processing failed") instead of the player: no stream URL is fetched and no view is recorded; the info block and the suggestions sidebar render normally. Rationale: AMB-1 resolved in /plan-resolve phase-05-video-watch-frontend — the player state for non-ready videos was undefined.

### phase-05-video-watch-frontend/TD-04

**Recommendation:** it keeps A's server-side start and handles the one realistic failure (a tab open past the TTL) with a small, testable retry, without relying on browser-specific redirect behavior for media range requests.
**Libraries:** —

## Inherited Conventions

- Backend config uses `@nestjs/config` with namespaced `registerAs(name, () => ({...}))` factories — one file per domain in `src/config/`. _(from phase 01)_
- Env variables are validated by a Joi schema in `src/config/env.validation.ts`, passed to `ConfigModule.forRoot({ validationSchema, validationOptions... _(from phase 01)_
- Config is injected into modules via `ConfigType<typeof xxxConfig>` and `@Inject(xxxConfig.KEY)`; the same factory is importable as a plain function... _(from phase 01)_
- `data-source.ts` loads `.env` via `import 'dotenv/config'` at the top, then imports `databaseConfig` and calls it as a plain function. _(from phase 01)_
- Database connection parameters (host, port, etc.) are sourced from a single `databaseConfig` factory — never duplicated between `AppModule` and... _(from phase 01)_
- `TypeOrmModule.forRootAsync` is used (not `forRoot`), with `imports: [ConfigModule]`, `inject: [databaseConfig.KEY]`, `useFactory` returning... _(from phase 01)_

## Inherited Deferred Capabilities

| Capability | Status | Origin phase | Rationale |
|-----------|--------|--------------|-----------|
| Telas de frontend | deferred | phase-01-configuracao-base | `next-frontend/` is not initialized in this phase; UI surfaces start in a later phase. |
| Telas de cadastro, login, confirmação de conta e recuperação de senha | deferred | phase-02-auth | `next-frontend/` is not initialized in this phase; UI surfaces start in a later phase. |
| "Confirmação de conta via e-mail com link de ativação" | deferred | phase-02-auth-frontend | deferred_to_next_phase — UI landing screen de-scoped 2026-05-14; FE confirmation flow (TD-07) picked up by a future phase. BE side unchanged in `phase-02-auth`. |
| "Logout" | deferred | phase-02-auth-frontend | deferred_to_next_phase — logout button lives inside authenticated chrome (typically Phase 04). Phase 02 still implements POST `/api/auth/logout` (BFF route handler + `session.destroy()`) so the contract is ready when the chrome lands. |
| "Recuperação de senha (destination screen / set-new-password)" | deferred | phase-02-auth-frontend | deferred_to_next_phase — `/forgot-password` ships this phase sending the e-mail; the reset-password destination screen is absent from Figma → link destination remains a 404 until a later phase delivers the screen via `/screen-inventory` extension run. Documented as a known gap. |
| "Telas de cadastro, login, confirmação de conta e recuperação de senha" | deferred | phase-02-auth-frontend | a tela de confirmação da conta não será implementada nesta fase corrente, será adiada — the umbrella bullet's full coverage requires the confirmação and reset-password destination screens; both are deferred per Non-UI rows above. The 3 ship-this-phase telas (signup, login, forgot-password) are inventoried and covered by their own verbs; the umbrella bullet itself is deferred to the phase-02-auth-frontend phase that lands the missing screens. |

## UI Inventory

_No screen inventory — UI↔API sync deferred. Run /screen-inventory phase-06-social-interactions and then rerun /plan-context phase-06-social-interactions to activate UI checks._

## Non-UI / Deferred Capabilities

_None._

## Testing Requirements

### nestjs-project

| Artifact type | Required layers |
|---------------|-----------------|
| Entity (`*.entity.ts`) | Integration: constraints, defaults, `select: false` |
| Service with branching + DB | Unit: branch logic (mock repo) + Integration: DB contract |
| Service with DB only (no branching) | Integration: DB contract |
| Service with configured lib (JWT, cache) | Unit: real lib with test config |
| Service with side-effect dep (email, storage) | Integration: real capture service (Mailpit) or local adapter |
| Module with configured imports | Unit: compilation test |
| Controller | E2E only — do NOT write unit tests |
| DTO | E2E: one validation wiring test per endpoint |
| Guard (delegates to service for business logic) | E2E + Unit if complex internal logic |
| Guard (simple, delegates to Passport) | E2E only |
| Strategy (Passport) | E2E via guard |
| Pipe (custom transformation/validation) | Unit |
| Interceptor (response transform, logging) | Unit and/or E2E |
| Exception Filter | Unit + E2E |
| Middleware | E2E |

### next-frontend

_Deferred subproject — testing requirements will be defined in the future frontend slice of Phase 06._
