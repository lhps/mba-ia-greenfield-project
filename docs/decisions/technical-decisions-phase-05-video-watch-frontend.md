---
scope_type: phase
related_phases: [5]
status: decided
date: 2026-11-06
scope_description: "Frontend slice of Phase 05 (video watch page): the watch-page route, how the page loads its data through the BFF, the video player with play/pause, volume and progress controls, and how the player keeps a valid presigned stream URL. Cross-layer contracts (view counting, suggestions, download access) are settled in phase-05-video-watch/TD-01..TD-03 and are NOT reopened here."
covers_capabilities:
  - "Player de vídeo com controles: play/pause, volume e barra de progresso"
  - "Layout da página: vídeo principal + informações + sidebar com sugestões"
  - "Descrição do vídeo com expansão/recolhimento"
depends_on_slices: [phase-05-video-watch]
---

# Technical Decisions — Phase 05 Frontend (Video Watch Page)

_Subprojects in scope:_

- `next-frontend/` — primary subproject. Owns the watch-page route, its data loading through the BFF, the player client component, the suggestions sidebar rendering, the description expand/collapse block and the BFF Route Handlers the page calls from the browser (view recording, download URL, stream URL refresh). Covered by TD-01..TD-04.
- `nestjs-project/` — **no open decision in this document.** Every endpoint the page consumes already exists and is exported in `openapi.json` by the sibling slice `phase-05-video-watch` (merged into `dev`).

> Cross-doc anchors (already decided — do NOT reopen):
> - **Strict BFF — single server-only `API_URL`:** `next-frontend-config-base/TD-03`. The browser only talks to same-origin `/api/...`; RSC and Route Handlers call NestJS through `lib/api/upstream.ts`.
> - **Session in an `iron-session` cookie, rendered server-side and exposed through a React Context:** `phase-02-auth-frontend/TD-01`, `TD-02`, `TD-06`. Transparent refresh on upstream 401: `TD-03`. Browser mutations go through Route Handler POST + client `fetch`: `TD-05`.
> - **OpenAPI typing chain:** `next-frontend-openapi-typing/TD-01..TD-05` (`openapi-fetch`, committed `next-frontend/openapi.json` copy + sync script, aliases in `lib/api/contracts.ts`). The local copy must be re-synced to pick up the Phase 05 paths.
> - **MSW per domain:** `next-frontend-msw-foundation/TD-01..TD-04`.
> - **Media delivery:** progressive faststart MP4 through presigned GET URLs with HTTP Range, one object for stream and download (`phase-03-videos/TD-08`); URL TTL is the backend's `PRESIGNED_URL_TTL_SECONDS` (default 3600 s).
> - **Watch-page contracts:** `GET /videos/:id` returns `VideoDetail` with `view_count` and `channel { nickname, name }`; `POST /videos/:id/views` is called by the player at playback start, with the BFF appending the client IP to `X-Forwarded-For` and forwarding `User-Agent` (`phase-05-video-watch/TD-01` + revisions); `GET /videos/:id/suggestions` returns up to 12 `PublicVideoDto` cards (`TD-02` + revision); download stays owner-only and the button is shown only when `channel.nickname` equals the session `channelSlug` (`TD-03` + Note). Drafts are owner-only, unlisted is link-only (`phase-04-channel-management/TD-04`).
> - **Unique public id in URLs:** 11-char `public_id` (`phase-03-videos/TD-06`).

**Description expand/collapse — no TD.** The bullet "Descrição do vídeo com expansão/recolhimento" has no strategic alternative: a client toggle over a CSS `line-clamp` block, with the "mostrar mais" control shown only when the text overflows, is the canonical React + Tailwind idiom (resolved by `vercel-react-best-practices` / `next-best-practices` at implementation time) and touches a single component. It is covered by TD-02 (the page passes the description to that client island) and needs no decision of its own.

---

## TD-01: Watch Page Route

**Scope:** Frontend

**Capability:** Layout da página: vídeo principal + informações + sidebar com sugestões

**Context:** The watch page needs a URL built from the video's `public_id`. That URL is linked from every listing (suggestions sidebar here; management panel and public channel page in the Phase 04 frontend slice; home and search in Phases 06–07) and pasted as the share link of unlisted videos, so it is a convention every later frontend slice must reuse. It must not collide with the BFF's same-origin `/api/videos/...` Route Handlers.

**Options:**

### Option A: Path segment `/watch/[publicId]`
- Dynamic route `app/watch/[publicId]/page.tsx`; links are `/watch/dQw4w9WgXcQ`.
- **Pros:** short and readable share link; clearly a page, distinct from the `/videos` API resource names; `params` is the only input, so the page has no query-string parsing.
- **Cons:** a second name for the same resource (API says `videos`, UI says `watch`).

### Option B: Query string `/watch?v=[publicId]`
- Single static route `app/watch/page.tsx` reading `searchParams.v` (YouTube style).
- **Pros:** familiar to users; leaves room for more query params (e.g. a start time).
- **Cons:** `searchParams` is a dynamic API, so the id must be validated by hand; a missing or empty `v` is a separate case to handle; worse fit with Next's per-segment `not-found`/`loading` conventions.

### Option C: Path mirroring the API `/videos/[publicId]`
- Dynamic route `app/videos/[publicId]/page.tsx`.
- **Pros:** one vocabulary across API and UI.
- **Cons:** the same prefix as the BFF Route Handlers under `/api/videos/...` and as future management pages (e.g. `/videos/[id]/edit` for the owner), which blurs public vs owner pages in one tree.

**Recommendation:** Option A — `/watch/[publicId]` gives a short share link, keeps public viewing apart from the owner's management routes, and uses a plain dynamic segment that Next validates per segment (`not-found.tsx` for an unknown or unreadable video).

**Decision:** A (`/watch/[publicId]` — dynamic segment `app/watch/[publicId]/page.tsx` with a segment `not-found.tsx`)

**Revisions:**

- 2026-11-09 — Unavailable-video state: `app/watch/[publicId]/not-found.tsx` renders a centered message "This video isn't available" and a "Go to home" link to `/`, using existing tokens and `components/ui/button.tsx`; it covers both an unknown `public_id` and a video the caller cannot read (draft of another user → upstream 404). No Figma frame exists for this state. Rationale: AMB-2 resolved in /plan-resolve phase-05-video-watch-frontend — the not-found content was undefined.

---

## TD-02: Watch Page Rendering and Data Loading

**Scope:** Frontend

**Capability:** Transversal — covers: Layout da página: vídeo principal + informações + sidebar com sugestões; Descrição do vídeo com expansão/recolhimento

**Context:** The page shows three blocks: the player, the info block (title, `view_count`, channel, description, download button) and the suggestions sidebar. The data comes from `GET /videos/:id` and `GET /videos/:id/suggestions`. Both must carry the session's access token when there is one, because an owner can open their own draft (404 for everyone else). The page must work for anonymous visitors, and its `<title>` should be the video title for shared links. Depends on TD-01 for the route.

**Options:**

### Option A: Server Component page, everything awaited
- `page.tsx` is an async Server Component that calls `upstream` for the detail and the suggestions in parallel (forwarding the session token), and renders the info block and sidebar on the server. Only the player and the description toggle are Client Components. `generateMetadata` reuses the detail fetch.
- **Pros:** no client fetching code; one request per page view; title and metadata server-rendered; a 404 maps to `notFound()` directly.
- **Cons:** the first byte waits for the slower of the two calls; the sidebar can't appear before the main video.

### Option B: Server Component page with the sidebar streamed through Suspense
- Same as A for the detail (awaited, so `notFound()` and metadata work), but the suggestions sidebar is an async Server Component wrapped in `<Suspense>` with a skeleton, so the main video and info block stream first.
- **Pros:** everything in A, and the main content is not blocked by the suggestions call; matches Next 16's streaming model with no extra dependency.
- **Cons:** one more component boundary and a skeleton to design; suggestions errors need their own boundary so they don't break the page.

### Option C: Client-rendered page through BFF Route Handlers
- A thin page renders a Client Component that fetches `/api/videos/[id]` and `/api/videos/[id]/suggestions` (new Route Handlers) on mount and shows skeletons meanwhile.
- **Pros:** same pattern for every block; easy to refetch after actions.
- **Cons:** two extra Route Handlers that only proxy reads; no server-rendered title for shared links; 404 handled on the client; content appears only after hydration plus two round-trips.

**Recommendation:** Option B — the detail must be on the server anyway (`notFound()`, `generateMetadata`, owner draft access through the session), and streaming the sidebar keeps the player from waiting on the suggestions query, with no extra Route Handlers for reads. The data is per-viewer (session, owner drafts, live `view_count`), so the reads are uncached (`cache: 'no-store'` / dynamic rendering).

**Decision:** B (async Server Component page awaiting the video detail — `notFound()`, `generateMetadata`, session token forwarded — with the suggestions sidebar as an async Server Component streamed through `<Suspense>` + skeleton; reads uncached)

**Revisions:**

- 2026-11-09 — The channel name in the info block is a `next/link` to `/channels/[nickname]` (mirrors the backend `GET /channels/{nickname}`); the link ships now even though the public channel page belongs to the not-yet-built Phase 04 frontend slice, so it resolves to a 404 until that page lands (known gap, same pattern as the phase-02-auth-frontend reset-password destination). Rationale: OQ-6 resolved in /plan-resolve phase-05-video-watch-frontend — the link target route was undefined.
- 2026-11-09 — The channel avatar is an initials avatar (40 px circle, initials from `channel.name`, project tokens) authored as the reusable `components/ui/avatar.tsx`, because the detail contract carries no channel image. Rationale: OQ-7 resolved in /plan-resolve phase-05-video-watch-frontend.
- 2026-11-09 — Description expand/collapse: collapsed state clamps to 3 lines (`line-clamp-3`); a "Show more" button appears only when the text overflows and toggles to "Show less" when expanded, with `aria-expanded` on the button. Rationale: OQ-8 resolved in /plan-resolve phase-05-video-watch-frontend — Figma only shows the expanded card.
- 2026-11-09 — Relative publish date and compact counts render in English through native `Intl.RelativeTimeFormat('en')` and `Intl.NumberFormat('en', { notation: 'compact' })` in a `lib/` formatting utility (no new dependency), e.g. "3 weeks ago", "10K views"; the same utility formats the suggestion cards. Rationale: OQ-9 resolved in /plan-resolve phase-05-video-watch-frontend — format/locale were undefined; English matches Figma and the existing UI.

---

## TD-03: Video Player Implementation

**Scope:** Frontend

**Capability:** Player de vídeo com controles: play/pause, volume e barra de progresso

**Context:** The bullet requires a player with play/pause, volume and a progress bar over the progressive MP4 (`phase-03-videos/TD-08`), styled like the rest of the app (Tailwind + shadcn/Radix primitives) and matching the Figma watch screen. The player must also fire the view call once when playback starts (`phase-05-video-watch/TD-01`). `next-frontend` has React 19.2 and `radix-ui` 1.4 installed (it includes an accessible `Slider`); no media library is installed.

**Options:**

### Option A: Native `<video controls>`
- The browser's built-in controls; the component only sets `src`, `poster` and the `play` listener.
- **Pros:** zero code for controls; native keyboard support and accessibility; fullscreen and picture-in-picture for free.
- **Cons:** look and behavior differ per browser and can't be styled to the Figma design; no control over the progress bar or the volume UI.

### Option B: Custom controls over a native `<video>` element
- A Client Component drives `HTMLVideoElement` (play/pause, `volume`/`muted`, `currentTime`/`duration`, `buffered`) through a small hook, with Radix `Slider` for the progress and volume bars and the project's `IconButton` for play/mute.
- **Pros:** matches the design system exactly; no new dependency; only the three controls the bullet asks for; Radix gives the sliders ARIA roles and keyboard handling.
- **Cons:** the code owns media edge cases (buffering state, `ended`, seeking while paused) and player-level keyboard shortcuts; fullscreen is extra work if wanted.

### Option C: Vidstack (`@vidstack/react` 1.15)
- A headless React media library: `MediaPlayer` + `MediaProvider` with unstyled `PlayButton`, `MuteButton`, `VolumeSlider`, `TimeSlider` components styled with Tailwind (React 19 is a supported peer).
- **Pros:** media state, keyboard shortcuts, accessibility and fullscreen are handled and tested by the library; still fully stylable.
- **Cons:** a new runtime dependency and API surface for three controls; its components replace the design-system sliders, so two slider styles coexist; most of its features (HLS, captions, chapters) are unused with a single progressive MP4.

**Recommendation:** Option B — the bullet asks for exactly three controls over a single progressive MP4. Radix `Slider` and the existing `IconButton` already give accessible, design-consistent building blocks, so a library would add a dependency and a second component style for little gain. Vidstack (C) is the fallback if fullscreen, keyboard shortcuts or captions become requirements.

**Decision:** B (custom controls over a native `<video>` element: play/pause, mute + volume slider, progress bar and time display, built with Radix `Slider` and the project `IconButton`)
**Libraries:** radix-ui

**Revisions:**

- 2026-11-09 — When the video is readable but `processing_status` is not `ready` (the owner opening their own draft while it is processing or after it failed), the player area renders a status placeholder ("Processing…" / "Processing failed") instead of the player: no stream URL is fetched and no view is recorded; the info block and the suggestions sidebar render normally. Rationale: AMB-1 resolved in /plan-resolve phase-05-video-watch-frontend — the player state for non-ready videos was undefined.

---

## TD-04: Stream URL Acquisition and Expiry

**Scope:** Frontend

**Capability:** Player de vídeo com controles: play/pause, volume e barra de progresso

**Context:** The player's `src` is a presigned GET URL from `GET /videos/:id/stream`, valid for `PRESIGNED_URL_TTL_SECONDS` (default 1 h). The browser issues new HTTP Range requests whenever the viewer seeks or resumes after the buffer runs out, so a page left open past the TTL fails with `403` on the next range request. The page must decide where the URL is fetched and what happens when it expires. Depends on TD-02 (rendering) and TD-03 (player).

**Options:**

### Option A: Fetch the URL on the server and pass it as `src`
- The Server Component calls `GET /videos/:id/stream` with the detail and passes the URL to the player.
- **Pros:** simplest; the video can start loading as soon as the HTML arrives.
- **Cons:** once the TTL passes, seeking or resuming fails with a media error and the viewer has to reload the page.

### Option B: Server-fetched URL, refreshed by the player on media error
- As A, plus a BFF Route Handler `GET /api/videos/[id]/stream`; when the `<video>` element raises an error, the player fetches a fresh URL through it, swaps `src` and restores `currentTime` and the play state (one retry per error).
- **Pros:** fast start like A; long sessions recover by themselves; the retry is local to the player.
- **Cons:** one extra Route Handler and a retry path to test; a short visible stall while the new URL loads.

### Option C: Same-origin redirect route as `src`
- `src` is `/api/videos/[id]/media`, a Route Handler that answers each request with a `307` to a fresh presigned URL.
- **Pros:** the URL in the page never expires; no client retry code.
- **Cons:** a BFF round-trip and a NestJS call before playback, and potentially on later range requests; browsers differ in whether they reuse the redirect target for range requests, so expiry recovery is not guaranteed; the redirect target needs CORS-free media loading to keep working.

**Recommendation:** Option B — it keeps A's server-side start and handles the one realistic failure (a tab open past the TTL) with a small, testable retry, without relying on browser-specific redirect behavior for media range requests.

**Decision:** B (stream URL fetched by the Server Component and passed as `src`; on a media error the player fetches a fresh URL through a BFF Route Handler `GET /api/videos/[id]/stream`, swaps `src` and restores `currentTime` and the play state — one retry per error)

---

## Decisions Summary

| ID | Scope | Decision | Recommendation | Choice |
|----|-------|----------|---------------|--------|
| TD-01 | Frontend | Watch Page Route | A — `/watch/[publicId]` | A |
| TD-02 | Frontend | Watch Page Rendering and Data Loading | B — RSC detail + Suspense-streamed sidebar | B |
| TD-03 | Frontend | Video Player Implementation | B — custom controls on native `<video>` + Radix Slider | B |
| TD-04 | Frontend | Stream URL Acquisition and Expiry | B — server URL + refresh on media error | B |
