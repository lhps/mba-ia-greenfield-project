# phase-05-video-watch-frontend — Progress

**Status:** completed
**SIs:** 15/15 completed

### SI-05.0.1 — Infra: install batch shadcn primitives
- **Status:** completed
- **Tests:** no tests (Infra) — `npx tsc --noEmit` exit 0
- **Observations:**
  - The shadcn `radix-nova` registry emits `import { cn } from "cn"` and adds the unrelated npm package `cn` to `package.json` (reproduced with both `shadcn@latest` and the pinned local `shadcn@^4.7.0`), ignoring the `utils: @/lib/utils` alias in `components.json`. Fixed by reverting `package.json`/`package-lock.json` and rewriting the import to `@/lib/utils` in both files. Future `shadcn add` runs need the same check — worth a follow-up task (registry/CLI issue or alias config).
  - Port 3001 is held by another project's container (`edgedns-logto`), so `docker compose up` fails; commands run via `docker compose run --rm next-frontend …` (no published port). The final E2E run needs port 3001 free.
  - `npm install` on this host flips `"dev": true` on `fsevents` in `package-lock.json` — platform noise, reverted.
  - Commit of the generated files left to the user (git is out of scope for /implement).

### SI-05.0.2 — Tests shadcn batch (avatar, slider)
- **Status:** completed
- **Tests:** 7 passing (`components/ui/__tests__/avatar.test.tsx` 3, `components/ui/__tests__/slider.test.tsx` 4)
- **Observations:**
  - Radix Slider needs `ResizeObserver`, absent in jsdom; the slider test stubs it locally (browser API, not an owned collaborator).
  - The generated shadcn `Slider` spreads props (incl. `aria-label`) onto `SliderPrimitive.Root`, while `role="slider"` lives on the `Thumb` — so a consumer cannot give the thumb an accessible name ("Seek"/"Volume", per library-refs `radix-ui`) through the wrapper as-is. The player wiring (SI-05.0.3 / SI-05.9b) must address this, e.g. via a thumb-label prop added during the SI-05.9a drift decisions; the test covers only what the primitive exposes today (`role`, `aria-valuenow/min/max`, keyboard `onValueChange`, `data-disabled`).
  - Per `.claude/rules/next-frontend-ui.md`, the installed `avatar`/`slider` still need token reconciliation against Figma — handled by the SI-05.9.0 audit / SI-05.9a decisions.

### SI-05.0.3 — Custom-business simple group: suggested-videos + video-card + video-info + video-player
- **Status:** completed
- **Tests:** 13 passing (suggested-videos 2, video-card 3, video-info 4, video-player 4); `npx tsc --noEmit` exit 0
- **Observations:**
  - Components take display-ready props (`durationLabel`, `metaLabel`, `channel { nickname, name }`) instead of DTOs; SI-05.9b maps `VideoDetail` / `PublicVideo` (aliases from SI-05.1) and formats via `lib/format.ts` (SI-05.3).
  - `VideoPlayer` carries a temporary local `formatTime` (m:ss) for the timestamp — to be replaced by `formatDuration` from `lib/format.ts` in SI-05.9b.
  - Created player icons `components/icons/{play,pause,volume,volume-off}-icon.tsx` (Material paths, project icon pattern); SI-05.9.0/9a may replace them with the Figma assets.
  - `VideoCard` uses `next/image` with `unoptimized` because remote thumbnail hosts are not in `images.remotePatterns` (`next.config.ts` is empty); configuring the storage host for optimization is a decision left to SI-05.9b / follow-up.
  - Fix attempt 1/3: progress `Slider` with `min=max=0` (no metadata yet) made Radix emit `calc(NaN% …)` inline styles, crashing jsdom's CSS parser (also invalid in browsers) — `max` falls back to 1 until `duration > 0`.
  - Slider thumbs still have no accessible name (wrapper puts `aria-label` on Root — see SI-05.0.2 note).

### SI-05.0.4 — Custom-business complex: video-description
- **Status:** completed
- **Tests:** 5 passing (`components/video/__tests__/video-description.test.tsx`); `npx tsc --noEmit` exit 0
- **Observations:**
  - Overflow detection compares `scrollHeight > clientHeight` on the clamped `<p>` (re-measured via `ResizeObserver` when available); jsdom does no layout, so the test stubs both properties on `HTMLElement.prototype`.
  - Fix attempt 1/3: passing `data-slot` to `Card` overrode the primitive's own `data-slot="card"` (props spread last); removed the override.
  - Card styling (`bg-muted p-3`) is a placeholder pending the SI-05.9.0 drift audit against Figma 152:2487.

### SI-05.1 — Sync do contrato OpenAPI e aliases de vídeo em `lib/api/contracts.ts`
- **Status:** completed
- **Tests:** no tests (type-only) — `npx tsc --noEmit` exit 0
- **Observations:**
  - `scripts/sync-openapi.sh` (host) + `npm run openapi:types` (container) regenerated `lib/api/types.gen.ts`; it now has `/videos/{id}`, `/suggestions`, `/stream`, `/download`, `/views` and `/channels/me`.
  - `next-frontend/openapi.json` stays untracked because `next-frontend/.gitignore` ignores it — divergence from `next-frontend-openapi-typing/TD-02` (committed copy) and no `.github/workflows/openapi-freshness.yml` exists; separate follow-up task.
  - Added aliases `VideoDetail`, `VideoSuggestions`, `PublicVideo`, `PresignedUrl` (pass-through). `ChannelProfile` is added in SI-05.8 per plan.

### SI-05.2 — Handlers MSW de vídeos (`mocks/handlers/videos.ts`)
- **Status:** completed
- **Tests:** no tests (test-infra) — `npx tsc --noEmit` exit 0, `eslint mocks` exit 0; trigger behavior exercised by SI-05.5..SI-05.7 integration tests
- **Observations:**
  - Fixture bodies live in `mocks/factories/videos.ts` (`buildVideoDetail`, `buildDraftVideoDetail`, `buildPublicVideo`, `buildSuggestionList`, `buildPresignedUrl`) per `.claude/rules/next-frontend-msw-mocks.md`; typed by the `@/lib/api/contracts` aliases (same as `auth.ts`).
  - Triggers exported as constants (`MISSING_VIDEO_ID`, `PROCESSING_VIDEO_ID`, `FAILED_VIDEO_ID`, `NOT_OWNED_VIDEO_ID`) so tests reference them instead of literals; default fixture channel `pixel_point`; presigned URLs point at the fake host `https://storage.test`.

### SI-05.3 — Formatadores de exibição (`lib/format.ts`)
- **Status:** completed
- **Tests:** 19 passing (`lib/__tests__/format.test.ts`); `npx tsc --noEmit` exit 0
- **Observations:**
  - Relative-date buckets: seconds < 1 min, minutes < 1 h, hours < 1 day, days < 1 week, weeks < 30 days, months < 365 days, else years (floor per unit; future dates clamp to "0 seconds ago").

### SI-05.4 — Headers de encaminhamento ao upstream (`lib/api/forwarding.ts`)
- **Status:** completed
- **Tests:** 8 passing (`lib/api/__tests__/forwarding.test.ts`); `npx tsc --noEmit` exit 0
- **Observations:**
  - Next 16 removed `request.ip`; the Next server fills `x-forwarded-for` from the socket only when the header is absent (`??=`, confirmed in context7 / Next source). `clientForwardingHeaders` therefore forwards the **last** incoming `x-forwarded-for` entry (fallback `x-real-ip`) as a single-entry `X-Forwarded-For`.
  - **Security limitation (follow-up):** with no trusted reverse proxy in front of Next that overwrites `x-forwarded-for`, a client can send its own header and choose the address the API uses for the anonymous viewer key — it can bypass view deduplication (inflate `view_count`). It does not affect auth throttling, which keys on the address the API sees for requests reaching `AuthModule`; but those requests also pass through the BFF, so the same spoofing applies there. Deployment should front Next with a proxy that sets `x-forwarded-for` (phase-05-video-watch/TD-01 revision already requires the API to be reachable only through the BFF).

### SI-05.5 — BFF Route Handler: POST /api/videos/[id]/views
- **Status:** completed
- **Tests:** 5 passing (`app/api/videos/[id]/views/__tests__/route.integration.test.ts`); `npx tsc --noEmit` exit 0
- **Observations:**
  - Route context typed as `{ params: Promise<{ id: string }> }` (Next 16 async params); test reuses the `next/headers` cookie-map mock pattern from the auth route tests and captures upstream headers via a per-test `server.use(...)` override.

### SI-05.6 — BFF Route Handler: GET /api/videos/[id]/stream
- **Status:** completed
- **Tests:** 4 passing (`app/api/videos/[id]/stream/__tests__/route.integration.test.ts`); `npx tsc --noEmit` exit 0
- **Observations:** none

### SI-05.7 — BFF Route Handler: GET /api/videos/[id]/download
- **Status:** completed
- **Tests:** 7 passing (`app/api/videos/[id]/download/__tests__/route.integration.test.ts`); `npx tsc --noEmit` exit 0
- **Observations:**
  - `withRefresh` takes a raw-`Response` fetcher; the route keeps the last `openapi-fetch` result in a closure and treats "returned response ≠ last upstream response" as the refresh-failed branch (passes `withRefresh`'s 401 envelope through). The session is re-read on each attempt so the retry carries the rotated token.

### SI-05.8 — Sessão carrega `channelSlug` no login (`POST /api/auth/login`)
- **Status:** completed
- **Tests:** 7 passing (`app/api/auth/login/__tests__/route.integration.test.ts` — 4 existing + 3 new); `npx tsc --noEmit` exit 0
- **Observations:**
  - Added `ChannelProfile` alias, `mocks/handlers/channels.ts` (`GET /channels/me` → `pixel_point`, 401 without bearer) and the barrel line; login reads the slug via `readChannelSlug` (errors and network failures fall back to `""`).
  - Pre-existing `console.log(error, data, response)` in `app/api/auth/login/route.ts` left untouched (out of scope — already listed as a follow-up); it logs upstream responses including tokens to the server console.
  - `userId` is still sealed as `""` at login (pre-existing; `/auth/me` would provide `sub`) — not needed by this slice, follow-up.
  - Nickname edits (Phase 04 frontend) will need to refresh `channelSlug` per phase-04-channel-management/TD-11 revision — not in this slice.

### SI-05.9.0 — Drift audit: Página de visualização do vídeo
- **Status:** completed
- **Tests:** no tests (audit-only)
- **Observations:**
  - Created `frontend-drift-report.md`: 9 components (2 alinhado, 2 drift menor, 5 drift relevante, 0 ausente).
  - `figma:figma-implement-design` is not registered in this session; the audit used the Figma MCP directly (`get_design_context` on 152:2323, 152:2440, 158:3729 + `get_metadata` on 2732:2119) after loading `skill://figma/figma-design-to-code/SKILL.md`. No `.claude/rules/design-system.md` alias map exists → only retune-exact / additive forms used.
  - AC "`git diff --name-only HEAD -- next-frontend` empty" cannot hold literally because SI-05.0.x–SI-05.8 changes are still uncommitted; the audit itself wrote nothing under `next-frontend/`.
  - Not representable from the contract: the VideoCard channel line + verified badge (`PublicVideoDto` has no channel) and the blue timestamp/URL links in the description (no linkify capability) — left out, no Decision row.
  - The Download button has no Figma node; it reuses the Button `secondary`/`md` styling of Share (158:2697) and needs a download icon (no Figma asset) in SI-05.9a.

### SI-05.9a — Tela de Página de visualização do vídeo (visual shell)
- **Status:** completed
- **Tests:** no tests (visual shell) — `npx tsc --noEmit` exit 0, eslint exit 0; regression of the touched DS component tests: 25 passing
- **Observations:**
  - Applied all 9 Drift Report decisions verbatim (report not edited by the user). Updated existing DS: `components/ui/slider.tsx` (+variant 'timeline'), `components/ui/slider.tsx` (+prop 'aria-label' → Thumb), `components/ui/avatar.tsx` (+size 'md'), plus base retunes in `video-player.tsx`, `video-info.tsx`, `video-description.tsx`, `suggested-videos.tsx`, `video-card.tsx`.
  - Player icons now use the Figma "Play button" / "Sound button" SVG paths (`currentColor`; the Figma fill is #0F0F0F, nearly invisible on the black player — rendered white via `text-primary-foreground`); pause / muted icons keep the Material glyphs (not designed).
  - Created `app/watch/[publicId]/page.tsx` (two-column layout with static placeholder data), `app/watch/[publicId]/not-found.tsx`, `components/video/suggested-videos-skeleton.tsx`, `components/video/video-status-placeholder.tsx`, `components/icons/download-icon.tsx` (Material glyph — no Figma asset).
  - Visual fidelity against Figma 152:2219 was not checked in a browser: the dev server cannot publish port 3001 (held by `edgedns-logto`). To verify once the port is free.
  - The pre-existing call-site classes on the player IconButtons (`text-primary-foreground hover:bg-transparent`) override IconButton colour identity — a DS overlay variant would be cleaner; left as is.

### SI-05.9b — Tela de Página de visualização do vídeo (lógica & wiring)
- **Status:** completed
- **Tests:** unit 16 passing (`video-player.wiring` 6, `download-button` 6, `video-player` 4 regression); E2E `tests/video-watch.e2e-spec.ts` (from `specs/watch.plan.md`) 4 passing; `npx tsc --noEmit` exit 0; `npm run lint` exit 0 (1 pre-existing warning in `components/auth/signup-form.tsx`).
- **Observations:**
  - Actions 1–5 done: (1) owner check `session.isLoggedIn && channelSlug === channel.nickname` gates `DownloadButton`; (2) async RSC page with `cache()`-memoized `getVideoDetail` shared by `generateMetadata` + page, `notFound()`, suggestions in `<Suspense>` with skeleton, `cache: "no-store"`, no `withRefresh` in RSC; (3) stream URL only when `ready`, else `VideoStatusPlaceholder`; player records one view on first play and refreshes the URL once on a media error, resuming from the saved position; (4) error mapping ("Video unavailable", inline download messages); (5) `components/video/download-button.tsx`.
  - Read helpers live in `app/watch/[publicId]/data.ts` (`server-only`).
  - Fix attempt 1/3: eslint `react-hooks/set-state-in-effect` on the mount-time stream refresh → extracted `fetchFreshStreamUrl` and set state only from the promise callbacks (with cancellation).
  - The temporary `formatTime` from SI-05.0.3 now delegates to `formatDuration` (`lib/format.ts`).
  - In E2E the fixture stream URL (`https://storage.test/...`) is unreachable, so the player ends in "Video unavailable" after one refresh; the spec scenarios do not assert playback (AC #5/#6 are covered by the unit wiring test).
  - Local `ResizeObserver` stubs in SI-05.0.2/0.3 tests are redundant with the global stub in `vitest.setup.ts` (harmless).
  - E2E environment: the user stopped `edgedns-logto` to free port 3001; the dev server needed a local `next-frontend/.env.local` (git-ignored; `API_URL=http://nestjs-api:3000` + random `SESSION_PASSWORD`) because no env file existed — `.env.example` referenced by `next-frontend/CLAUDE.md` is missing (follow-up). Playwright's Chromium was installed on the host (`npx playwright install chromium`).
