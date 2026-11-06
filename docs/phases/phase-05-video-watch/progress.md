# phase-05-video-watch — Progress

**Status:** completed
**SIs:** 7/7 completed

### SI-05.1 — Proxy Trust at Bootstrap (Client IP Behind the BFF)
- **Status:** completed
- **Tests:** passing — auth.e2e-spec.ts + swagger.e2e-spec.ts (re-verified together with SI-05.3: 59 e2e tests across 3 suites; 3 new throttling-by-client-IP cases)
- **Observations:**
  - First run reported as done by mistake: the edit scripts used an asdf `python3` shim with no version set, which exits 1 silently, so the edits to existing files were never written and the first test run ran against unchanged code. Edits re-applied with `/usr/bin/python3` and re-tested.
  - `test/auth.e2e-spec.ts` builds a local `NestExpressApplication` to call `set('trust proxy', 1)`, then assigns it to the suite's existing `app: INestApplication<App>` — suite typing unchanged.

### SI-05.2 — Infra: View Dedup Store on Redis and Dedup Window Config
- **Status:** completed
- **Tests:** passing — env.validation.spec.ts, view-dedup.store.integration-spec.ts, views.module.spec.ts (re-verified together with SI-05.3: 26 unit/integration tests across 4 suites); no Jest open-handle warning
- **Observations:**
  - The env schema / `.env.example` / env.validation.spec edits were missing after the first pass (same silent `python3` failure as SI-05.1); re-applied and re-tested.
  - The Redis connection is closed in `ViewsModule.onModuleDestroy` (same pattern as `StorageModule`) rather than inside the provider file; `redis-client.provider.ts` holds only the `REDIS_CLIENT` token and factory.
  - Jest run prints a Node warning "`--localstorage-file` was provided without a valid path" — pre-existing runtime/tooling noise, unrelated to this SI.

### SI-05.3 — VideoDetail with View Count and Channel Summary (GET /videos/:id)
- **Status:** completed
- **Tests:** passing — videos.service.spec.ts (new channel-ids case) + spec-derived test/videos-detail-summary.e2e-spec.ts (2 scenarios)
- **Observations:**
  - A `prettier --write src` run also reformatted `src/mail/templates/confirmation.hbs` and `password-reset.hbs` (out of scope); revert via `git checkout` was blocked by the permission classifier — user reverted them manually; not part of this phase's diff.

### SI-05.4 — Endpoint POST /videos/:id/views (View Counting)
- **Status:** completed
- **Tests:** 15 passing in src/views (unit + integration, 4 suites) + 8 e2e passing (spec-derived test/videos-views.e2e-spec.ts 6 scenarios + videos-detail-summary 2)
- **Observations:**
  - `VideoViewsController` carries `@SkipThrottle()` (same as `AppController`): the `ThrottlerGuard` is a global `APP_GUARD`, and the contract says the views route is not throttled.
  - Wiring `ViewsModule` → `VideosModule` forced updates to SI-05.2 tests: `views.module.spec.ts` now compiles with the full config set + test data source + `QueueModule`, and `view-dedup.store.integration-spec.ts` builds only the Redis provider + store (closing the client itself) instead of the whole module.
  - Integration run prints a pg `DeprecationWarning: Calling client.query() when the client is already executing a query` (breaks on pg@9). The same warning appears when running the TypeORM CLI (`migration:generate`), so it comes from TypeORM's own pg usage, not from this phase's tests — follow-up: track a TypeORM/pg upgrade.

### SI-05.5 — Endpoint GET /videos/:id/suggestions (Same-category Sidebar)
- **Status:** completed
- **Tests:** 15 passing in video-listing.service.integration-spec.ts (6 new listSuggestions cases) + 6 passing in spec-derived test/videos-suggestions.e2e-spec.ts
- **Observations:**
  - Migration `1793998924959-AddVideoSuggestionsIndex` generated from the `@Index(['category_id', 'view_count', 'published_at'])` diff (only the CREATE INDEX) and applied to the dev DB.
  - The fill query excludes the current category with `IS DISTINCT FROM` instead of an id list: when the same-category list is short, every eligible same-category video is already picked, so excluding the category covers "already-picked ids".
  - The route resolves the current video in the controller (`VideoAccessService.findReadableOrFail`) then calls `listSuggestions(current)`, as the plan specifies; `VideosController` now also injects `VideoAccessService` and `VideoListingService`.

### SI-05.6 — Watch-page Access Verification (Anonymous, Unlisted, Owner-only Download)
- **Status:** completed
- **Tests:** 3 passing (spec-derived test/videos-watch-access.e2e-spec.ts); no inline Tests section
- **Observations:**
  - Audit found no gap: `POST :id/views` and `GET :id/suggestions` both resolve through `VideoAccessService.findReadableOrFail`; both public listings (channel videos, suggestions) filter `visibility = public`. Only change: the download route's Swagger description now states the owner-only download button rule.

### SI-05.7 — OpenAPI Contract Export and HTTP Examples for the Watch Page
- **Status:** completed
- **Tests:** 11 passing (test/swagger.e2e-spec.ts; 2 new Phase 05 cases)
- **Observations:**
  - `openapi.json` regenerated with `npm run openapi:export`; a second export produced a byte-identical file. Not committed — version control is left to the user (the plan's "commit" wording covers the regenerated file only).
  - Diff removals are expected: the old `GET :id` / download descriptions, `PublicVideoDto.view_count` "Always 0 in Phase 04", and `PublicVideoDto` moving earlier in `components.schemas` (now referenced by `VideoSuggestionsDto`).
  - `api.http` gained steps 27–31 (get video → view → deduplicated repeat → suggestions → owner download).
