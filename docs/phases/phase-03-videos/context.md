---
kind: phase
name: phase-03-videos
sources_mtime:
  docs/project-plan.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-11-03T19:01:23-03:00"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-next-frontend-openapi-typing.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-next-frontend-config-base.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-next-frontend-msw-foundation.md: "2026-10-21T16:43:34-03:00"
  docs/phases/phase-01-configuracao-base/context.md: "2026-10-21T16:43:34-03:00"
  docs/phases/phase-02-auth/context.md: "2026-10-21T16:43:34-03:00"
  docs/phases/phase-02-auth-frontend/context.md: "2026-10-21T16:43:34-03:00"
  .claude/skills/testing-guide-nestjs-project/SKILL.md: "2026-10-21T16:43:34-03:00"
---

# phase-03-videos — Context

## Scope

**Phase name:** Fase 03 — Upload e Processamento de Vídeos

**Capabilities** (literal, `docs/project-plan.md`):

- Serviço de armazenamento de arquivos (vídeos e thumbnails)
- Serviço de processamento em segundo plano (filas)
- Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance
- Pré-cadastro automático do vídeo como rascunho ao iniciar o upload
- Processamento automático do vídeo após upload (extração de duração e metadados)
- Geração automática de thumbnail a partir de um frame do vídeo
- URL única por vídeo, sem conflito com outros vídeos
- Reprodução via streaming (sem necessidade de download completo)
- Download do vídeo pelo usuário

**Out of scope:** _Not specified._
**Deliverables:** upload de até 10GB funcional, processamento automático do vídeo, streaming funcionando, URLs únicas geradas.
**Affected subprojects:** `nestjs-project/` (API, video worker, Compose infra). Not named explicitly in the phase section; derived from the phase-scope decisions doc's `_Subprojects in scope:_`.
**Deferred subprojects:** `next-frontend/` — upload screen and player deferred to a complementary ad-hoc decisions doc (`related_phases: [3]`) by user choice (2026-10-21, "Backend + infra"). Cross-layer contracts are decided in this slice.
**Sequencing notes:** Depende de: Fase 01, Fase 02

**Neighbors (for boundary detection only):**

- **Phase 02:** Cadastro, Login e Gerenciamento de Conta — fluxo completo de criação de conta, confirmação por e-mail, login, logout e recuperação de senha.
- **Phase 04:** Gerenciamento de Vídeos e Canal (Depende de: Fase 02, Fase 03) — edição das informações do vídeo, fluxo de rascunho e publicação, painel de administração do canal e página pública.

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| phase-03-videos/TD-01 | phase | Repo-wide | Object Storage Backend (S3-compatible service) | decided | A | @aws-sdk/client-s3, @aws-sdk/s3-request-presigner |
| phase-03-videos/TD-02 | phase | Backend | Background Job Queue | decided | A | @nestjs/bullmq, bullmq |
| phase-03-videos/TD-03 | phase | Repo-wide | Video Worker Deployment Model | decided | A | — |
| phase-03-videos/TD-04 | phase | Cross-layer | Large-file Upload Protocol (up to 10GB) | decided | A | — |
|     └─ Last revision: 2026-11-03 — Acceptance criterion for "sem impacto na performance" fixed: uploa… | | | | | | |
| phase-03-videos/TD-05 | phase | Cross-layer | Video Lifecycle / Status Model | decided | A | — |
| phase-03-videos/TD-06 | phase | Cross-layer | Unique Public Video ID (URL identifier) | decided | B | — |
| phase-03-videos/TD-07 | phase | Backend | FFmpeg Integration Approach | decided | A | — |
| phase-03-videos/TD-08 | phase | Cross-layer | Streaming Format and Media Delivery (stream + download) | decided | A | — |
|     └─ Last revision: 2026-11-03 — In Phase 03 streaming is open by unique URL: anyone with the video… | | | | | | |
| phase-03-videos/TD-09 | phase | Cross-layer | Upload Limits and Input Validation Policy | decided | A | — |
|     └─ Last revision: 2026-11-03 — Wire field names follow the existing snake_case API convention (`r… | | | | | | |
| phase-03-videos/TD-10 | phase | Backend | Abandoned Upload Cleanup | decided | A | — |
| phase-03-videos/TD-11 | phase | Backend | Integration/E2E Test Strategy for Storage, Queue and FFmpeg | decided | A | — |

_Source files:_

- phase-03-videos — `docs/decisions/technical-decisions-phase-03-videos.md` (scope_type: phase)

## Capability Coverage

| Capability (from project-plan.md) | Covered by |
|-----------------------------------|------------|
| Serviço de armazenamento de arquivos (vídeos e thumbnails) | phase-03-videos/TD-01, phase-03-videos/TD-11 |
| Serviço de processamento em segundo plano (filas) | phase-03-videos/TD-02, phase-03-videos/TD-03, phase-03-videos/TD-11 |
| Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance | phase-03-videos/TD-04, phase-03-videos/TD-09 |
| Pré-cadastro automático do vídeo como rascunho ao iniciar o upload | phase-03-videos/TD-05, phase-03-videos/TD-10 |
| Processamento automático do vídeo após upload (extração de duração e metadados) | phase-03-videos/TD-03, phase-03-videos/TD-05, phase-03-videos/TD-07, phase-03-videos/TD-11 |
| Geração automática de thumbnail a partir de um frame do vídeo | phase-03-videos/TD-03, phase-03-videos/TD-07, phase-03-videos/TD-11 |
| URL única por vídeo, sem conflito com outros vídeos | phase-03-videos/TD-06 |
| Reprodução via streaming (sem necessidade de download completo) | phase-03-videos/TD-08 |
| Download do vídeo pelo usuário | phase-03-videos/TD-08 |

## Decisions Detail

### phase-03-videos/TD-01

**Recommendation:** MinIO pinned to the last community image; code talks only S3 API — the code is coupled only to the S3 API, so the frozen-upstream risk is confined to the dev/test container; MinIO is the only option that supports every S3 feature this phase relies on (browser presigned multipart, CORS, lifecycle abort rule) with zero bootstrap friction. Revisit (Option B) if the project ever targets a self-hosted production storage.
**Libraries:** @aws-sdk/client-s3, @aws-sdk/s3-request-presigner

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

## Inherited Decisions Detail

### phase-01-configuracao-base/TD-01

**Recommendation:** @nestjs/config — Official, core-team-maintained, guaranteed NestJS 11 compatibility. The `registerAs()` factory pattern solves the TypeORM CLI sharing problem: the factory function can be imported as a plain function by `data-source.ts` while also serving as a DI injection token inside NestJS. Building a custom module recreates solved functionality; third-party packages carry maintenance risk.
**Libraries:** `@nestjs/config@^4.x`

### phase-01-configuracao-base/TD-02

**Recommendation:** Joi — First-class integration with `@nestjs/config` via `validationSchema`, requiring zero custom wiring. Handles string-to-number coercion natively. Using a different tool for env validation vs. request validation is reasonable — env config is validated once at startup, DTOs are validated per-request. Zod is elegant but adds a third validation paradigm to the project.
**Libraries:** `joi@^17.x`

### phase-01-configuracao-base/TD-03

**Recommendation:** Namespaced/grouped with registerAs — The project roadmap explicitly calls for auth, email, and storage in upcoming phases. Namespaced configs provide clear file boundaries per domain, typed injection via `ConfigType<typeof databaseConfig>`, and natural scalability. The `registerAs()` factory is dual-purpose: DI token inside NestJS and plain importable function for `data-source.ts`. Initial files for Phase 01: `src/config/database.config.ts`, `src/config/app.config.ts`.
**Libraries:** —

### phase-01-configuracao-base/TD-04

**Recommendation:** Shared registerAs factory — Natural outcome of choosing `@nestjs/config` with `registerAs`. The factory is already callable by design. `data-source.ts` imports it, calls `dotenv.config()`, then calls the factory. Zero duplication, minimal code, no extra abstraction.
**Libraries:** `dotenv` (transitive via `@nestjs/config`)

### phase-02-auth/TD-01

**Recommendation:** Argon2id — For a greenfield project in 2026, Argon2id is the OWASP-recommended choice. The native build dependency is a one-time Docker setup cost. The project has no legacy constraints favoring bcrypt. OWASP minimum: 19MiB memory, 2 iterations.
**Libraries:** `argon2@^0.41.x`

### phase-02-auth/TD-02

**Recommendation:** @nestjs/passport — The project plan includes only email/password auth for now, but the plugin architecture costs little and future phases may add social login. Aligns with official NestJS docs, making onboarding and maintenance easier.
**Note:** Decision deliberately diverged from the Recommendation during implementation — custom guards were preferred over `@nestjs/passport` to keep the dependency surface smaller; social login is not on the near-term roadmap, so the plugin-architecture benefit did not justify the extra abstraction layer.
**Libraries:** `@nestjs/jwt@^11.0.0`

### phase-02-auth/TD-03

**Recommendation:** Refresh Token Rotation — Provides the strongest security model with automatic theft detection. The DB write overhead is acceptable for a video platform (auth refresh is infrequent vs. video operations). PostgreSQL is already in the stack, so no new infrastructure needed. Race conditions can be mitigated with a short grace period for the old token.
**Libraries:** —

### phase-02-auth/TD-04

**Recommendation:** Random Opaque Tokens in DB — Revocability is important: when a user requests a new password reset, previous tokens should be invalidated. The DB table is trivial to implement, and the tokens table can also serve future needs (e.g., API keys). Keeps email tokens decoupled from the JWT auth system.
**Libraries:** —

### phase-02-auth/TD-05

**Recommendation:** @nestjs-modules/mailer — Best NestJS integration with minimal boilerplate. Supports SMTP (matching the architecture diagram), works with MailHog/Mailpit for local development without external dependencies, and scales to any SMTP provider in production. Template engine support (Handlebars) simplifies email formatting. No vendor lock-in.
**Libraries:** `@nestjs-modules/mailer@^2.x`, `handlebars@^4.x`

### phase-02-auth/TD-06

**Recommendation:** class-validator + class-transformer — This is a backend-only project (no shared schemas with frontend), so Zod's single-source-of-truth advantage is less impactful. class-validator is the documented NestJS approach, and the project already uses decorators extensively (TypeORM entities, NestJS DI). Fewer integration surprises with NestJS 11.
**Libraries:** `class-validator@^0.14.x`, `class-transformer@^0.5.x`

### phase-02-auth/TD-07

**Recommendation:** Custom Domain Exception Filter — Provides machine-readable error codes that the Next.js frontend can switch on, without the overhead of RFC 9457's URI-based type system. The project is single-consumer (first-party frontend), so a simple `{ statusCode, error, message }` format with domain codes balances clarity and simplicity. The custom filter cost is low — two small files.
**Libraries:** —

### phase-02-auth/TD-08

**Recommendation:** @nestjs/throttler — Native NestJS integration is decisive: the guard system allows scoping rate limiting to `AuthModule` only via module-level `APP_GUARD`, with `@SkipThrottle()` for exemptions. The project is single-instance with no distributed requirements, so in-memory storage is sufficient. Using express-rate-limit would bypass NestJS's DI and guard lifecycle for no clear benefit.
**Libraries:** `@nestjs/throttler@^6.x`

### phase-02-auth/TD-09

**Recommendation:** Opaque — Since DB lookup is mandatory (TD-03), JWT signature adds no security value. Opaque tokens are shorter, leak no data, and are simpler to generate.
**Note:** Decision deliberately diverged from the Recommendation — JWT was kept to reuse the access-token signing/verification infrastructure (`@nestjs/jwt`), trading token size and base64-readability for a single token format across the codebase.
**Libraries:** `@nestjs/jwt@^11.0.0`

### phase-02-auth/TD-10

**Recommendation:** The platform is a video sharing service with URL-based channel handles. A strict `[a-z0-9_]` allowlist is the simplest and most portable choice: no extra dependencies, no edge cases around hyphen positioning, and the `user_<random>` fallback provides a valid handle even for extreme email prefixes. Hyphens can always be added in a future iteration if user feedback justifies it.
**Libraries:** —

### phase-02-auth-frontend/TD-01

**Recommendation:** Three reasons. (1) **Architectural fit.** The strict-BFF model in `next-frontend-config-base/TD-03` already nominates the Route Handler as the only NestJS caller; cookie-based sessions are the natural match, and Auth.js's framework adds layers between the BFF and the cookie that buy nothing because the backend is the auth authority. (2) **Smaller blast radius.** A ~50-LOC session helper is grep-friendly, debuggable, and test-friendly via the existing MSW+BFF integration test pattern. (3) **Compatibility with Next.js 16 / React 19.** Built-in `next/headers` `cookies()` is the canonical primitive. Option C is rejected as unsafe (`localStorage` for refresh tokens) and architecturally regressive.
**Libraries:** —

### phase-02-auth-frontend/TD-02

**Recommendation:** Three reasons. (1) **Defense in depth on the cookie content** — `httpOnly` blocks JS, encryption blocks accidental log/proxy inspection. (2) **Single cookie to manage** simplifies logout (one `session.destroy()` call). (3) **Room to carry minimal user metadata** (`userId`, `email`, `channelSlug`) lets `app/layout.tsx` RSC render the authenticated chrome without a per-render `/auth/me` round-trip.
**Libraries:** iron-session

### phase-02-auth-frontend/TD-03

**Recommendation:** The single-flight detail is non-trivial and goes in the helper from day one — tested by MSW with a "two concurrent intercepted upstream calls; one refresh expected" assertion. Option B's client-driven pattern is rejected because it doesn't replace Option A (RSC still needs server-side refresh). Option C's pre-emptive timer is rejected because the failure modes (multiple tabs, sleep/wake) outweigh the latency saving.
**Libraries:** —

### phase-02-auth-frontend/TD-04

**Recommendation:** Three reasons. (1) **Decoupled from TD-05** — works with Route Handlers OR Server Actions. (2) **Aligned with shadcn's canonical form primitive** — `npx shadcn@latest add form` produces react-hook-form wrappers. (3) **Zod-first developer ergonomics match the rest of the FE foundation.**
**Libraries:** react-hook-form, @hookform/resolvers

### phase-02-auth-frontend/TD-05

**Recommendation:** Three reasons. (1) **Strict-BFF alignment.** Route Handlers are the BFF surface; every mutation stays visible under `app/api/**`. (2) **Test scaffold already exists** for Route-Handlers-as-functions. (3) **Single mutation surface** — Phase 02 sets the precedent for Phases 03–07; uniformity beats per-mutation idiom-picking.
**Libraries:** —

### phase-02-auth-frontend/TD-06

**Recommendation:** Two reinforcing reasons. (1) **No first-render flicker, no round-trip** — the session is delivered in the same response as the page HTML; the Client Provider hydrates with the correct initial state. (2) **No new BFF endpoint** — the cookie is the source of truth, RSC reads it, the Provider broadcasts it. The `router.refresh()` requirement after mid-session mutations is a small price.
**Libraries:** —

### phase-02-auth-frontend/TD-07

**Recommendation:** Three reasons. (1) **First-paint-correct**. (2) **Single integration pattern across both flows** — "RSC owns the token, Client Component owns the input" split. (3) **Email-prefetch behavior** is solved at the backend's idempotent-confirmation level.
**Libraries:** —

### openapi-docs-nestjs/TD-01

**Recommendation:** `@nestjs/swagger` — é a única opção que preserva as decisões anteriores (`class-validator` em TD-06 de phase-02-auth) sem re-platform; o CLI plugin com `classValidatorShim: true` aproveita os decoradores `class-validator` existentes para inferir schemas, mantendo o boilerplate baixo. Nestia tem mérito técnico real mas o custo de migração do stack de validação inviabiliza-a sem uma decisão upstream de supersede de TD-06. Manual authoring é descartado.
**Libraries:** @nestjs/swagger
**Revisions:**
- 2026-05-12 — Esclarece que o CLI plugin (`classValidatorShim: true`) cobre apenas inferência de schemas de DTOs a partir de `class-validator`; documentação de operações, respostas tipadas por status code, contratos de erro (alinhados ao envelope de phase-02-auth/TD-07) e exemplos exigem decoradores explícitos (`@ApiOperation`, `@ApiResponse`, `@ApiBody`, `@ApiParam`, `@ApiQuery`, `@ApiExtraModels`). _Rationale:_ openapi.json gerado pelo bootstrap atual está genérico — sem detalhes de parâmetros, schemas de retorno por status, nem contratos de erro — porque a base instalada se apoiou só na introspecção automática. Esta revisão fixa que enriquecimento via decoradores explícitos faz parte da Option A escolhida, não é trabalho fora do escopo do TD.

### openapi-docs-nestjs/TD-02

**Recommendation:** Ambos (Runtime UI + `openapi.json` exportado) — o custo marginal sobre Option A é apenas um npm script (~15 linhas) e o benefício é uma fundação correta para futura integração FE (codegen offline) sem perder a UI interativa que dev/QA usam. Option B sozinho pune a experiência de desenvolvimento em dev/local; Option A sozinho compromete o pipeline de codegen futuro. Combinar é dominante.
**Libraries:** —

### openapi-docs-nestjs/TD-03

**Recommendation:** Apenas em dev/staging — alinha com a postura defensiva já estabelecida em phase 02 e não compromete consumidores legítimos (o `openapi.json` commitado em TD-02 cumpre o papel de "spec consultável fora da UI"). Re-abrir como Option A ou C é trivial no futuro se um caso de uso de API pública aparecer.
**Libraries:** —

### next-frontend-openapi-typing/TD-01

**Recommendation:** `openapi-typescript` + `openapi-fetch`. (1) **Strict BFF makes the SDK surface valueless on the client** — only Route Handlers call the upstream Nest. (2) **Types-first matches the rest of the FE foundation** — `paths` is one `.d.ts` file imported wherever the contract is touched. (3) **MSW typing is solved by the same `paths` symbol.** `openapi-fetch` (~6KB, server-side only) removes per-Route-Handler `fetch` boilerplate while staying within the BFF model.
**Libraries:** openapi-typescript, openapi-fetch

### next-frontend-openapi-typing/TD-02

**Recommendation:** Committed local copy + repo-root sync script. (1) Preserves compose-stack independence between subprojects. (2) Drift eliminated structurally when paired with TD-03's CI freshness check. (3) The committed local file is a real artifact in PR review.
**Libraries:** —

### next-frontend-openapi-typing/TD-03

**Recommendation:** Committed + CI freshness check — the only option that makes contract drift both visible (in PR diffs) and impossible to merge accidentally (CI fail). Apply the same script-and-check pattern to any future generated artifact; the only generated artifact remains `types.gen.ts`.
**Libraries:** —

### next-frontend-openapi-typing/TD-04

**Recommendation:** Single `lib/api/contracts.ts` with explicit aliases — handles pass-through and reshape with the same mechanism, gives a single grep target for "what shape does the BFF expose", and decouples Component imports from App Router file paths. Make `lib/api/contracts.ts` the only file that imports `paths` from `types.gen.ts`.
**Libraries:** —

### next-frontend-openapi-typing/TD-05

**Recommendation:** Hand-written MSW handlers, typed via `paths` — determinism over auto-generation; coherent with TD-01 (`paths` is the single contract anchor); manual cost negligible at current scale. Can be superseded later by a Kubb/hey-api MSW plugin without touching `paths` import sites.
**Libraries:** —

### next-frontend-config-base/TD-01

**Recommendation:** Zod 4. (1) Type-inference matches the FE's strict-TS culture. (2) Ecosystem gravity in Next.js / React 19. (3) Direct enablement of `@t3-oss/env-nextjs`. Backend parity with Joi is not load-bearing: env schemas are not shared FE↔BE.
**Libraries:** zod

### next-frontend-config-base/TD-02

**Recommendation:** `@t3-oss/env-nextjs` — the only option that combines type-level `NEXT_PUBLIC_` prefix enforcement, runtime Proxy-based leak detection, and single-file consumer ergonomics.
**Libraries:** @t3-oss/env-nextjs

### next-frontend-config-base/TD-03

**Recommendation:** Strict BFF — single server-only `API_URL`. Aligned with the BFF testing strategy in `next-frontend/CLAUDE.md` (Route Handlers as the only NestJS caller). Eliminates CORS and public exposure of the backend URL. Adding a public key later is non-breaking; removing one is breaking.
**Libraries:** —

### next-frontend-msw-foundation/TD-01

**Recommendation:** Per-domain modules + barrel (`mocks/handlers/<domain>.ts` + `mocks/handlers/index.ts`) — MSW's own best practice; domain ownership tracks the codebase (auth, videos, channels); append-only growth with minimal merge conflicts.
**Libraries:** —

### next-frontend-msw-foundation/TD-02

**Recommendation:** Test-only `setupServer` at the foundation; browser worker deferred until a real FE-offline-dev consumer exists.
**Libraries:** —

### next-frontend-msw-foundation/TD-03

**Recommendation:** Hand-written deterministic defaults as the default + opt-in seeded faker scoped to bulk-collection builders only; `@faker-js/faker` installed only when the first bulk builder is authored.
**Libraries:** —

### next-frontend-msw-foundation/TD-04

**Recommendation:** Universal handler set loaded into `setupServer` + per-test `server.use(...)` overrides + `onUnhandledRequest: "error"`.
**Libraries:** —

## Inherited Conventions

- Backend config uses `@nestjs/config` with namespaced `registerAs(name, () => ({...}))` factories — one file per domain in `src/config/`. _(from phase 01)_
- Env variables are validated by a Joi schema in `src/config/env.validation.ts`, passed to `ConfigModule.forRoot({ validationSchema, ... _(from phase 01)_
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
| "Recuperação de senha (destination screen / set-new-password)" | deferred | phase-02-auth-frontend | deferred_to_next_phase — `/forgot-password` ships this phase sending the e-mail; the reset-password destination screen is absent from Figma → link destination remains a 404 until a later phase delivers the screen. |
| "Telas de cadastro, login, confirmação de conta e recuperação de senha" | deferred | phase-02-auth-frontend | Umbrella bullet deferred to the phase that lands the missing confirmação and reset-password screens; signup, login, forgot-password shipped. |

## UI Inventory

_No screen inventory — UI↔API sync deferred. Run /screen-inventory 03 and then rerun /plan-context 03 to activate UI checks._

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

_Deferred subproject — upload screen/player decided in a complementary ad-hoc doc; testing requirements will be pulled from `testing-guide-next-frontend` when that doc enters the pipeline._
