---
kind: phase
name: phase-05-video-watch-frontend
test_specs_aware: true
sources_mtime:
  docs/phases/phase-05-video-watch-frontend/context.md: "2026-11-09T18:18:41-03:00"
  docs/phases/phase-05-video-watch-frontend/library-refs.md: "2026-11-09T18:18:11-03:00"
  docs/decisions/technical-decisions-phase-05-video-watch-frontend.md: "2026-11-09T18:17:32-03:00"
  docs/decisions/technical-decisions-next-frontend-msw-foundation.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-next-frontend-openapi-typing.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-next-frontend-config-base.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-10-21T16:43:34-03:00"
  docs/phases/phase-05-video-watch/library-refs.md: "2026-11-06T18:52:00-03:00"
---

# Phase 05 — Página de Visualização do Vídeo (frontend slice)

## Objective

Deliver the `next-frontend` watch page at `/watch/[publicId]` — a functional video player with play/pause, volume and progress bar controls, the info block (title, channel, view count, publish date, owner-only download), the description with expand/collapse, and the same-category suggestions sidebar — wired through the BFF to the watch-page backend already delivered by the sibling slice `phase-05-video-watch`, covering the capabilities "Player de vídeo com controles: play/pause, volume e barra de progresso", "Layout da página: vídeo principal + informações + sidebar com sugestões" and "Descrição do vídeo com expansão/recolhimento".

---

## Step Implementations

### SI-05.0.1 — Infra: install batch shadcn primitives

**Description:** Instalar os shadcn primitives `avatar` e `slider` via CLI registry e commitar os arquivos gerados em `components/ui/` (avatar de iniciais do canal; barra de progresso e volume do player).

**Technical actions:**

1. Rodar `docker compose exec next-frontend npx shadcn@latest add avatar slider` — gera `components/ui/avatar.tsx` e `components/ui/slider.tsx` sobre o pacote unificado `radix-ui` já instalado (per library-refs `radix-ui`).
2. Commitar `components/ui/avatar.tsx` e `components/ui/slider.tsx`.

**Tests:** _(empty — Infra)_

**Dependencies:** none

**Acceptance criteria:**

- `components/ui/avatar.tsx` e `components/ui/slider.tsx` existem e importam de `radix-ui` (nenhuma dependência `@radix-ui/*` avulsa adicionada ao `package.json`).
- Arquivos gerados compilam per `docker compose exec next-frontend npx tsc --noEmit`.

---

### SI-05.0.2 — Tests shadcn batch (avatar, slider)

**Description:** Unit tests para os shadcn primitives instalados em SI-05.0.1 — a11y, data-slot, event handlers.

**Technical actions:**

1. Author `components/ui/__tests__/avatar.test.tsx` e `components/ui/__tests__/slider.test.tsx`.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `avatar.tsx` | Unit per testing-guide-next-frontend § "UI Primitives" — `data-slot`, fallback de iniciais renderizado quando não há imagem | `components/ui/__tests__/avatar.test.tsx` |
| `slider.tsx` | Unit per testing-guide-next-frontend § "UI Primitives" — `role="slider"`, `aria-label`, `aria-valuenow`, `onValueChange` por teclado | `components/ui/__tests__/slider.test.tsx` |

**Dependencies:** SI-05.0.1

**Acceptance criteria:**

- Avatar sem `src` exibe o fallback com as iniciais passadas.
- Slider expõe `role="slider"` com `aria-valuenow` refletindo o valor e dispara `onValueChange` ao pressionar setas.
- Suite passa per `docker compose exec next-frontend npm test -- components/ui/__tests__`.

---

### SI-05.0.3 — Custom-business simple group: suggested-videos + video-card + video-info + video-player

**Description:** Author os business components base da watch page — esqueletos presentational/estruturais recebendo dados por props; a lógica & wiring (fetch, BFF, estado de mídia) é aplicada em SI-05.9b.

**Technical actions:**

1. Author `components/video/suggested-videos.tsx` per UI Contract (lista vertical de `VideoCard` a partir de `items: PublicVideoDto[]`; lista vazia não renderiza cards).
2. Author `components/video/video-card.tsx` per UI Contract (variante "list" horizontal: thumbnail com duration badge, título, views e data; `<Link>` para `/watch/{public_id}`).
3. Author `components/video/video-info.tsx` per UI Contract (`<h1>` do título, avatar de iniciais via `components/ui/avatar.tsx`, nome do canal como `<Link>` para `/channels/[nickname]`, slot da action row) (per `phase-05-video-watch-frontend/TD-02` revisions).
4. Author `components/video/video-player.tsx` per UI Contract (`"use client"`; `<video>` nativo + barra de controles: play/pause, sound + slider de volume, progress `components/ui/slider.tsx`, timestamp; sem Next/capítulo/controles à direita) (per `phase-05-video-watch-frontend/TD-03`).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `suggested-videos.tsx` | Unit per testing-guide-next-frontend § "Client Components" — render + props (N items → N cards; vazio → nenhum card) | `components/video/__tests__/suggested-videos.test.tsx` |
| `video-card.tsx` | Unit per testing-guide-next-frontend § "Client Components" — render + href `/watch/{public_id}` | `components/video/__tests__/video-card.test.tsx` |
| `video-info.tsx` | Unit per testing-guide-next-frontend § "Client Components" — render + props (heading, link do canal) | `components/video/__tests__/video-info.test.tsx` |
| `video-player.tsx` | Unit per testing-guide-next-frontend § "Client Components" — render + props (`src`, controles com nomes acessíveis) | `components/video/__tests__/video-player.test.tsx` |

**Dependencies:** SI-05.0.1

**Acceptance criteria:**

- Cada componente existe no path declarado e corresponde ao seu UI Contract.
- `VideoCard` aponta para `/watch/{public_id}`; o nome do canal em `VideoInfo` aponta para `/channels/{nickname}`.
- `VideoPlayer` expõe apenas os controles play/pause, mute/volume, progresso e timestamp.
- Suite passa per `docker compose exec next-frontend npm test -- components/video/__tests__`.

---

### SI-05.0.4 — Custom-business complex: video-description

**Description:** Author `components/video/video-description.tsx` — business component com estado local per Notes "Exibe descrição vinda do detalhe do vídeo com estado local expandir/recolher".

**Technical actions:**

1. Author `components/video/video-description.tsx` per UI Contract (`"use client"`; `components/ui/card.tsx` com a meta row recebida por props + texto clampado em 3 linhas (`line-clamp-3`); botão "Show more"/"Show less" com `aria-expanded`, exibido só quando o texto transborda) (per `phase-05-video-watch-frontend/TD-02` revision OQ-8).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `video-description.tsx` | Unit per testing-guide-next-frontend § "Client Components" baseline | `components/video/__tests__/video-description.test.tsx` |
| `video-description.tsx` | Unit: toggle/local-state assertions per Notes signal ("estado local expandir/recolher") — overflow → botão presente; sem overflow → ausente; clique alterna rótulo e `aria-expanded` | (same file) |

**Dependencies:** none

**Acceptance criteria:**

- Com texto que transborda 3 linhas, o botão "Show more" aparece com `aria-expanded="false"`; ao clicar vira "Show less" com `aria-expanded="true"` e o texto completo fica visível.
- Com texto que cabe em 3 linhas (ou descrição vazia), nenhum botão é renderizado.

---

### SI-05.1 — Sync do contrato OpenAPI e aliases de vídeo em `lib/api/contracts.ts`

**Description:** Trazer para o frontend o contrato de vídeo entregue pelo slice irmão `phase-05-video-watch` (hoje `lib/api/types.gen.ts` só tem `/auth`) e expor os aliases que o BFF, o RSC e os componentes consomem.

**Technical actions:**

1. Rodar no host `scripts/sync-openapi.sh` (copia `nestjs-project/openapi.json` → `next-frontend/openapi.json`) e depois `docker compose exec next-frontend npm run openapi:types` para regenerar `lib/api/types.gen.ts` (per `next-frontend-openapi-typing/TD-02`, `next-frontend-openapi-typing/TD-03`). _O `next-frontend/.gitignore` ignora `openapi.json`, divergindo de `next-frontend-openapi-typing/TD-02` — fora do escopo deste SI; registrado como tarefa separada._
2. Estender `lib/api/contracts.ts` (único importador de `paths`) com aliases pass-through: `VideoDetail` (`GET /videos/{id}` 200 → `VideoDetailDto`), `VideoSuggestions` (`GET /videos/{id}/suggestions` 200 → `VideoSuggestionsDto`), `PublicVideo` (item de `VideoSuggestions["items"]`), `PresignedUrl` (`GET /videos/{id}/stream` 200 → `PresignedUrlResponseDto`) (per `next-frontend-openapi-typing/TD-04`; shapes per `### API Contracts` → BFF tier).

**Tests:** _(empty — type-only aliases + generated file; compile-gated por `npx tsc --noEmit`)_

**Dependencies:** none

**Acceptance criteria:**

- `lib/api/types.gen.ts` contém os paths `/videos/{id}`, `/videos/{id}/suggestions`, `/videos/{id}/stream`, `/videos/{id}/download` e `/videos/{id}/views`.
- `lib/api/contracts.ts` exporta `VideoDetail`, `VideoSuggestions`, `PublicVideo` e `PresignedUrl`; `VideoDetail` inclui `view_count` e `channel { nickname, name }`.
- `docker compose exec next-frontend npx tsc --noEmit` sai com código 0 (os aliases de auth existentes continuam válidos após a regeneração).

---

### SI-05.2 — Handlers MSW de vídeos (`mocks/handlers/videos.ts`)

**Description:** Adicionar o domain file MSW de vídeos com os 5 endpoints upstream da watch page, consumido pelos testes de integração das Route Handlers (Vitest) e pelo E2E server-side (instrumentation).

**Technical actions:**

1. Criar `mocks/handlers/videos.ts` — handlers para upstream `GET /videos/{id}`, `GET /videos/{id}/suggestions`, `GET /videos/{id}/stream`, `GET /videos/{id}/download` e `POST /videos/{id}/views`, com corpos tipados via `VideoDetail`, `VideoSuggestions`, `PresignedUrl` e `ApiErrorEnvelope` de `@/lib/api/contracts` (per `next-frontend-openapi-typing/TD-05`; fixtures hand-written determinísticas per `next-frontend-msw-foundation/TD-03`).
2. Registrar o módulo no barrel `mocks/handlers/index.ts` (um arquivo novo + uma linha) (per `next-frontend-msw-foundation/TD-01`).
3. Embutir reserved trigger fixtures por `public_id` (11 chars): `missing0000` → 404 `VIDEO_NOT_FOUND` em todos os endpoints; `processing0` → detalhe com `processing_status: "processing"` e 409 `VIDEO_NOT_READY` em stream/views/download; `failed00000` → detalhe com `processing_status: "failed"`; `notowned000` → download 403 `VIDEO_ACCESS_DENIED`; download sem header `Authorization` → 401; qualquer outro id → vídeo `ready` publicado com `channel.nickname: "pixel_point"`, descrição longa (> 3 linhas) e 12 sugestões (per `next-frontend/CLAUDE.md` § E2E architecture — trigger values não colidem com os de auth).

**Tests:** _(empty — MSW handler set é test-infra; exercitado pelos testes de integração de SI-05.5..SI-05.7 e pelo E2E)_

**Dependencies:** SI-05.1

**Acceptance criteria:**

- `mocks/handlers/videos.ts` exporta handlers para os 5 endpoints upstream e está registrado no barrel.
- Cada trigger fixture produz o status e o `errorCode` documentados; demais ids retornam sucesso.
- Os tipos dos corpos derivam de `@/lib/api/contracts` (sem DTO duplicado à mão).

---

### SI-05.3 — Formatadores de exibição (`lib/format.ts`)

**Description:** Utilitário único de formatação em inglês para a meta row, os cards de sugestão e o timestamp do player, sem dependência nova.

**Technical actions:**

1. Criar `lib/format.ts` — `formatRelativeDate(iso, now)` via `Intl.RelativeTimeFormat('en')` (ex.: "3 weeks ago"), `formatCompactCount(n)` via `Intl.NumberFormat('en', { notation: 'compact' })` (ex.: "10K"), e `formatViews(n)` ("10K views", singular "1 view") (per `phase-05-video-watch-frontend/TD-02` revision OQ-9).
2. Adicionar `formatDuration(seconds)` → `m:ss` / `h:mm:ss`, usado no duration badge e no timestamp "current / duration" do player (per UI Contract → Rendered states).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `lib/format.ts` | Unit per testing-guide-next-frontend § "`lib/` utility" — fronteiras de unidade relativa (segundos→minutos→…→anos), compact (999, 1000, 1.2M), singular/plural de views, duração com e sem horas, `published_at` nulo | `lib/__tests__/format.test.ts` |

**Dependencies:** none

**Acceptance criteria:**

- `formatRelativeDate` de uma data 21 dias antes de `now` retorna "3 weeks ago".
- `formatViews(10000)` retorna "10K views" e `formatViews(1)` retorna "1 view".
- `formatDuration(751)` retorna "12:31" e `formatDuration(3725)` retorna "1:02:05".
- `formatRelativeDate` com data ausente retorna string vazia sem lançar.

---

### SI-05.4 — Headers de encaminhamento ao upstream (`lib/api/forwarding.ts`)

**Description:** Centralizar como o BFF e o RSC montam os headers upstream da watch page — bearer opcional da sessão e o par `User-Agent` / `X-Forwarded-For` que o backend usa para a chave anônima de view.

**Technical actions:**

1. Criar `lib/api/forwarding.ts` (`server-only`) — `sessionAuthHeader(session)` retorna `{ Authorization: "Bearer {accessToken}" }` só quando `session.isLoggedIn`, senão `{}` (per `phase-02-auth-frontend/TD-02`; bearer opcional per `### API Contracts` → BFF tier).
2. Adicionar `clientForwardingHeaders(request)` — copia o `user-agent` do request e monta `X-Forwarded-For` com o endereço do cliente como **última** entrada, derivado dos headers do request recebido pelo Next (per `phase-05-video-watch/TD-01` revision — API confia em exatamente um hop, `req.ip` = última entrada).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `lib/api/forwarding.ts` | Unit per testing-guide-next-frontend § "`lib/` utility" — sessão logada/anônima; `User-Agent` copiado; endereço do cliente como última entrada de `X-Forwarded-For`; ausência de headers de origem | `lib/api/__tests__/forwarding.test.ts` |

**Dependencies:** none

**Acceptance criteria:**

- Sessão logada produz `Authorization: Bearer {accessToken}`; sessão anônima não produz header `Authorization`.
- Um request com `user-agent: UA-1` e endereço de cliente `203.0.113.7` produz `User-Agent: UA-1` e `X-Forwarded-For` cuja última entrada é `203.0.113.7`.
- Um request sem informação de endereço não gera `X-Forwarded-For` vazio nem lança.

---

### SI-05.5 — BFF Route Handler: POST /api/videos/[id]/views

**Route:** POST /api/videos/[id]/views
**API Contract:** see `## Technical Specifications` → `### API Contracts` → BFF tier → `#### POST /api/videos/[id]/views`

**Description:** Route Handler same-origin que registra uma visualização no upstream, preservando a identidade do cliente para a deduplicação anônima.

**Technical actions:**

1. Criar `app/api/videos/[id]/views/route.ts` — `POST` que encaminha para `POST /videos/{id}/views` via `upstream` (`openapi-fetch`) sem corpo (per `phase-02-auth-frontend/TD-05`; per `next-frontend-openapi-typing/TD-01`).
2. Montar headers com `sessionAuthHeader(session)` + `clientForwardingHeaders(request)` de `lib/api/forwarding.ts` (per `phase-05-video-watch/TD-01` revisions; per `### API Contracts` → BFF tier).
3. Responder `204` sem corpo em sucesso; repassar 404 `VIDEO_NOT_FOUND` e 409 `VIDEO_NOT_READY` verbatim no `ApiErrorEnvelope` (per `### API Contracts` → BFF tier).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `app/api/videos/[id]/views/route.ts` | Integration (MSW) per testing-guide-next-frontend § "Route handler" — 204 pass-through; `User-Agent` e `X-Forwarded-For` chegam ao upstream; `Authorization` só com sessão logada; 404/409 pass-through | `app/api/videos/[id]/views/__tests__/route.integration.test.ts` |

**Dependencies:** SI-05.1, SI-05.2, SI-05.4

**Acceptance criteria:**

- `POST /api/videos/{public_id}/views` para um vídeo `ready` retorna `204` sem corpo.
- O upstream recebe `User-Agent` do browser e `X-Forwarded-For` com o endereço do cliente como última entrada.
- Com sessão logada o upstream recebe `Authorization: Bearer {accessToken}`; sem sessão, nenhum `Authorization`.
- `POST /api/videos/missing0000/views` retorna `404` com `error: "VIDEO_NOT_FOUND"`; `POST /api/videos/processing0/views` retorna `409` com `error: "VIDEO_NOT_READY"`.

---

### SI-05.6 — BFF Route Handler: GET /api/videos/[id]/stream

**Route:** GET /api/videos/[id]/stream
**API Contract:** see `## Technical Specifications` → `### API Contracts` → BFF tier → `#### GET /api/videos/[id]/stream`

**Description:** Route Handler que entrega uma URL presigned nova quando a atual expira durante a reprodução.

**Technical actions:**

1. Criar `app/api/videos/[id]/stream/route.ts` — `GET` que encaminha para `GET /videos/{id}/stream` via `upstream`, com `sessionAuthHeader(session)` (bearer opcional, necessário para o rascunho `ready` do dono) (per `phase-05-video-watch-frontend/TD-04`; per `next-frontend-openapi-typing/TD-01`).
2. Responder `200` com `{ url, expires_at }` pass-through tipado por `PresignedUrl`, sem cache (`Cache-Control: no-store`) para nunca servir URL expirada (per `phase-05-video-watch-frontend/TD-02` — leituras sem cache).
3. Repassar 404 `VIDEO_NOT_FOUND` e 409 `VIDEO_NOT_READY` verbatim (per `### API Contracts` → BFF tier).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `app/api/videos/[id]/stream/route.ts` | Integration (MSW) per testing-guide-next-frontend § "Route handler" — 200 `{ url, expires_at }` pass-through com `no-store`; bearer só com sessão; 404/409 pass-through | `app/api/videos/[id]/stream/__tests__/route.integration.test.ts` |

**Dependencies:** SI-05.1, SI-05.2, SI-05.4

**Acceptance criteria:**

- `GET /api/videos/{public_id}/stream` para um vídeo `ready` retorna `200` com `url` e `expires_at` iguais aos do upstream e `Cache-Control: no-store`.
- Com sessão logada o upstream recebe `Authorization: Bearer {accessToken}`; sem sessão, nenhum `Authorization`.
- `GET /api/videos/missing0000/stream` retorna `404` (`VIDEO_NOT_FOUND`); `GET /api/videos/processing0/stream` retorna `409` (`VIDEO_NOT_READY`).

---

### SI-05.7 — BFF Route Handler: GET /api/videos/[id]/download

**Route:** GET /api/videos/[id]/download
**API Contract:** see `## Technical Specifications` → `### API Contracts` → BFF tier → `#### GET /api/videos/[id]/download`

**Description:** Route Handler owner-only que obtém a URL de download (attachment) do upstream com refresh transparente de sessão.

**Technical actions:**

1. Criar `app/api/videos/[id]/download/route.ts` — `GET`; sem sessão logada responde `401` `{ statusCode: 401, error: "UNAUTHORIZED", message }` sem chamar o upstream (per `### API Contracts` → BFF tier; per `### Authorization Matrix`).
2. Com sessão, chamar `GET /videos/{id}/download` com `Authorization: Bearer {accessToken}` dentro de `withRefresh` de `lib/auth/refresh.ts` — refresh single-flight no 401 e cookie re-selado (permitido em Route Handler) (per `phase-02-auth-frontend/TD-03`).
3. Responder `200` com `{ url, expires_at }` pass-through (`PresignedUrl`, `Cache-Control: no-store`); repassar 403 `VIDEO_ACCESS_DENIED`, 404 `VIDEO_NOT_FOUND`, 409 `VIDEO_NOT_READY` e o 401 de refresh falho verbatim (per `### API Contracts` → BFF tier).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `app/api/videos/[id]/download/route.ts` | Integration (MSW) per testing-guide-next-frontend § "Route handler" — 401 sem sessão sem chamada upstream; 200 pass-through com bearer; 401 upstream → refresh → retry; 403/404/409 pass-through | `app/api/videos/[id]/download/__tests__/route.integration.test.ts` |

**Dependencies:** SI-05.1, SI-05.2, SI-05.4

**Acceptance criteria:**

- `GET /api/videos/{public_id}/download` sem sessão retorna `401` com `error: "UNAUTHORIZED"` e o upstream não é chamado.
- Com sessão do dono retorna `200` com `url` e `expires_at` do upstream.
- Quando o upstream responde 401 com access token expirado, exatamente um `POST /auth/refresh` ocorre e a chamada é refeita com o novo token, retornando `200`.
- `GET /api/videos/notowned000/download` com sessão retorna `403` (`VIDEO_ACCESS_DENIED`).

---

### SI-05.8 — Sessão carrega `channelSlug` no login (`POST /api/auth/login`)

**Route:** POST /api/auth/login
**API Contract:** see `## Technical Specifications` → `### API Contracts` → BFF tier → `#### POST /api/auth/login — amendment: session channelSlug`

**Description:** Popular o `channelSlug` da sessão no login (hoje gravado vazio) para que a watch page reconheça o dono do vídeo e exiba o botão Download.

**Technical actions:**

1. Em `app/api/auth/login/route.ts`, após o 200 de `POST /auth/login`, chamar `GET /channels/me` via `upstream` com `Authorization: Bearer {access_token}` e selar `channelSlug` = `nickname` em `setSession` (per `phase-02-auth-frontend/TD-02`; per `phase-05-video-watch/TD-03` Note).
2. Se `GET /channels/me` falhar, manter o login com `channelSlug: ""` e o mesmo corpo FE-facing `{}` (per `### API Contracts` → BFF tier amendment).
3. Adicionar alias `ChannelProfile` (`GET /channels/me` 200) em `lib/api/contracts.ts` e o handler upstream `GET /channels/me` em `mocks/handlers/channels.ts` (fixture `nickname: "pixel_point"`) registrado no barrel (per `next-frontend-openapi-typing/TD-04`, `next-frontend-msw-foundation/TD-01`).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `app/api/auth/login/route.ts` | Integration (MSW) per testing-guide-next-frontend § "Route handler" — sessão selada com `channelSlug` do `GET /channels/me`; falha do `GET /channels/me` mantém login com slug vazio; corpo FE-facing sem tokens (regressão) | `app/api/auth/login/__tests__/route.integration.test.ts` |

**Dependencies:** SI-05.1

**Acceptance criteria:**

- `POST /api/auth/login` com credenciais válidas retorna `200` e a sessão selada tem `channelSlug: "pixel_point"` (o `nickname` de `GET /channels/me`).
- Quando `GET /channels/me` responde erro, `POST /api/auth/login` ainda retorna `200` com cookie de sessão e `channelSlug: ""`.
- O corpo FE-facing do login continua sem `access_token` e `refresh_token`.

---

### SI-05.9.0 — Drift audit: Página de visualização do vídeo

**Figma:** https://www.figma.com/design/Wa3MJdwiXSgQW2VqZ9q4Zu/FC-Tube?node-id=152-2219
**UI Contract:** see `## Technical Specifications` → `### UI Contracts` → `#### Screen: Página de visualização do vídeo`

**Technical actions:**

1. **Drift audit** — invoke `figma:figma-implement-design` (narrow handoff per Decisão #31) with:
   - Figma URL: https://www.figma.com/design/Wa3MJdwiXSgQW2VqZ9q4Zu/FC-Tube?node-id=152-2219
   - Reused DS components: [`components/video/video-player.tsx`, `components/ui/slider.tsx`, `components/video/video-info.tsx`, `components/ui/avatar.tsx`, `components/ui/button.tsx`, `components/video/video-description.tsx`, `components/ui/card.tsx`, `components/video/suggested-videos.tsx`, `components/video/video-card.tsx`]
   - Server-connected component names (no endpoints/auth/errors): [Video, video title block, video meta row, Button "Download", recommended videos list, description card wrap]
   - Target paths (read-only context for audit; no writes here): `app/watch/[publicId]/page.tsx` + `components/video/*.tsx`

   For each component in the Reused DS list, perform value-level diff against the file on disk and classify per the 4-value status enum (`alinhado` / `drift menor` / `drift relevante` / `componente ausente`). Compose Decision per default policy (see `.claude/skills/plan-build/references/frontend-drift-report-schema.md` § Default decisions per status). Read prior sections of `frontend-drift-report.md` to build `prior_decisions`; populate `Prior` column with CONFLICT detection (executed by `/implement` per its SKILL.md cross-screen consultation algorithm). Write a `## Screen: pagina-de-visualizacao-do-video — audited at SI-05.9.0 ({YYYY-MM-DD})` section to `frontend-drift-report.md` (append on first run, overwrite-in-place on re-run). Figma-only elements marked "Não implementar" / "Fora do escopo deste slice" in the inventory are excluded from the diff. **No code edits — verifiable via `git diff` at SI end.**

**Dependencies:** SI-05.0.1, SI-05.0.3, SI-05.0.4

**Tests:** _(empty — audit-only; the report is the deliverable)_

**Acceptance criteria:**

- `docs/phases/phase-05-video-watch-frontend/frontend-drift-report.md` exists; section `## Screen: pagina-de-visualizacao-do-video` exists with the current run's date in heading (appended on first run, overwritten in place on re-run per schema § Section ownership and update discipline).
- Every component in the Reused DS list has exactly one row in the table.
- Every row has a Decision column populated:
  - `alinhado` → `skip`
  - `drift menor` → `auto-Edit "<specifics>"` or `exception "<reason>"`
  - `drift relevante` → `auto-Edit "<specifics>"`, `exception "<reason>"`, or `CONFLICT: <one-liner>; <verb> "<specifics>"`
  - `componente ausente` → `create`
- Every `exception` decision carries a one-liner justification.
- `git diff --name-only HEAD -- next-frontend` after the SI is empty.

---

### SI-05.9a — Tela de Página de visualização do vídeo (visual shell)

**Route:** /watch/[publicId]
**Figma:** https://www.figma.com/design/Wa3MJdwiXSgQW2VqZ9q4Zu/FC-Tube?node-id=152-2219
**UI Contract:** see `## Technical Specifications` → `### UI Contracts` → `#### Screen: Página de visualização do vídeo`
**Drift Report:** see `frontend-drift-report.md` → `## Screen: pagina-de-visualizacao-do-video`

**Technical actions:**

1. **Apply drift decisions** — read the Drift Report section for this screen. For each row, parse the Decision column and apply per the verb body:
   - `auto-Edit "<specifics>"` → apply `Edit` on the named DS file with the documented specifics
   - `create` → create the file (icons via Figma asset into `components/icons/`; components per spec)
   - `exception` / `skip` → no-op
   - `CONFLICT: <one-liner>; <verb> "<specifics>"` → strip the `CONFLICT: <one-liner>;` prefix (informational only) and apply the verb body per the rules above

   No drift detection or auto-judgment in this step. The audit-SI did the analysis; this step is mechanical application.

2. **Visual shell generation** — invoke `figma:figma-implement-design` (narrow handoff per Decisão #31) with:
   - Figma URL: https://www.figma.com/design/Wa3MJdwiXSgQW2VqZ9q4Zu/FC-Tube?node-id=152-2219
   - Reused DS components: [`components/video/video-player.tsx`, `components/ui/slider.tsx`, `components/video/video-info.tsx`, `components/ui/avatar.tsx`, `components/ui/button.tsx`, `components/video/video-description.tsx`, `components/ui/card.tsx`, `components/video/suggested-videos.tsx`, `components/video/video-card.tsx`] _(now reflecting any DS edits from action 1)_
   - Server-connected component names (no endpoints/auth/errors): [Video, video title block, video meta row, Button "Download", recommended videos list, description card wrap]
   - Target paths: `app/watch/[publicId]/page.tsx` (two-column layout with static placeholder data), `app/watch/[publicId]/not-found.tsx` ("This video isn't available" + "Go to home" link, per `phase-05-video-watch-frontend/TD-01` revision), `components/video/suggested-videos-skeleton.tsx` (Suspense fallback), player status placeholder ("Processing…" / "Processing failed", per `phase-05-video-watch-frontend/TD-03` revision)

**Dependencies:** SI-05.9.0 + SI-05.0.1, SI-05.0.3, SI-05.0.4

**Tests:** _(empty — shell smoke-gated by build AC; Unit tests live in SI-Xb; E2E in /plan-test-specs spec)_

**Acceptance criteria:**

- All target paths exist, export expected components, and compile per `docker compose exec next-frontend npx tsc --noEmit`.
- Rendering matches Figma node `152:2219` fidelity within tolerance of DS component set, excluding elements marked out of scope in the inventory (TopNav, social actions, comments, Share, TabMenu, extra player controls).
- No runtime imports beyond Reused DS list (stays visually scoped).

---

### SI-05.9b — Tela de Página de visualização do vídeo (lógica & wiring)

**Test Specs:** see `next-frontend/specs/watch.plan.md`
**UI Contract:** see `## Technical Specifications` → `### UI Contracts` → `#### Screen: Página de visualização do vídeo`

**Technical actions:**

1. **Route guard application** — per UI Contract `**Auth requirement:**` (Mixed): a página não tem guard (anônimo vê vídeos publicados); o botão Download só é renderizado quando `session.isLoggedIn && session.channelSlug === video.channel.nickname` (per `phase-05-video-watch/TD-03` Note; per `### Authorization Matrix`).
2. **Rendering strategy application** — `app/watch/[publicId]/page.tsx` como async Server Component: `await params`, leitura de `GET /videos/{id}` via `upstream` + `sessionAuthHeader` com `cache: 'no-store'`, 404 → `notFound()`, `generateMetadata` com o título; `GET /videos/{id}/suggestions` dentro de `<Suspense fallback={<SuggestedVideosSkeleton />}>`; sem `withRefresh` no RSC (gap aceito — token expirado degrada para leitura anônima) (per `phase-05-video-watch-frontend/TD-01`, `phase-05-video-watch-frontend/TD-02`; per `### API Contracts` → RSC server-side reads).
3. **Endpoint wiring** — com `processing_status === "ready"`, buscar `GET /videos/{id}/stream` no servidor e passar `src` + `publicId` ao `VideoPlayer`; senão renderizar o placeholder de status sem stream nem view (per `phase-05-video-watch-frontend/TD-03` revision). No `VideoPlayer`: primeiro `play` do carregamento → `POST /api/videos/[id]/views` uma única vez (fire-and-forget); evento `error` → `GET /api/videos/[id]/stream` uma vez, troca `src`, `seek` para o `currentTime` salvo e retoma (per `phase-05-video-watch-frontend/TD-04`); controles via Radix Slider (`value`/`onValueChange`/`onValueCommit`, camada buffered irmã) (per library-refs `radix-ui`). Meta row e cards via `lib/format.ts`.
4. **Error mapping** — per UI Contract `**Error Catalog → UX mapping:**`: refresh do stream falho → mensagem inline "Video unavailable" no player; erros de view ignorados; erros de download (`UNAUTHORIZED`, `VIDEO_ACCESS_DENIED`, `VIDEO_NOT_FOUND`, `VIDEO_NOT_READY`) → mensagem inline junto ao botão.
5. **Download button** — criar `components/video/download-button.tsx` (`"use client"`, `components/ui/button.tsx` no estilo do "Share"): clique → `GET /api/videos/[id]/download` → `window.location.assign(url)`; botão desabilitado enquanto a requisição está pendente.

**Dependencies:**

- `SI-05.9a` (visual shell must exist before wiring).
- BFF SIs: `SI-05.5` (views), `SI-05.6` (stream refresh), `SI-05.7` (download), `SI-05.8` (session `channelSlug`).
- Shared-types SI: `SI-05.1` (aliases de vídeo); `SI-05.2` (fixtures MSW para Vitest e E2E); `SI-05.3` (formatadores); `SI-05.4` (headers upstream do RSC).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `components/video/video-player.tsx` | Unit per testing-guide-next-frontend § "Client Components" — play/pause e mute alteram o `<video>`; primeiro `play` chama `POST /api/videos/{id}/views` uma única vez (MSW); `error` de mídia busca nova URL, troca `src` e restaura `currentTime`; refresh falho mostra "Video unavailable" | `components/video/__tests__/video-player.wiring.test.tsx` |
| `components/video/download-button.tsx` | Unit per testing-guide-next-frontend § "Client Components" — clique navega para a `url` retornada; botão desabilitado enquanto pendente; 401/403/404/409 mostram mensagem inline | `components/video/__tests__/download-button.test.tsx` |

E2E for the page (anonymous view, owner Download visibility, not-found, non-ready placeholder, suggestions streaming) is authored externally by `/plan-test-specs` in the spec file referenced by `**Test Specs:**` above and consumed JIT by `/implement` Step 3. /plan-build does NOT emit E2E rows here. Page-level Unit testing is excluded by `testing-guide-next-frontend` artifact rule "Pages → E2E only" (async RSC).

**Acceptance criteria:**

- `/watch/{public_id}` de um vídeo publicado renderiza player, título, canal, "{N} views • {data relativa}", descrição e sugestões para visitante anônimo, sem botão Download.
- Para o dono logado (`channelSlug` igual a `channel.nickname`) o botão Download aparece e baixa o arquivo via a URL retornada.
- `/watch/missing0000` renderiza "This video isn't available" com link "Go to home".
- Um vídeo do dono com `processing_status` diferente de `ready` mostra "Processing…" ou "Processing failed" no lugar do player, sem chamadas a stream nem views.
- Iniciar a reprodução registra exatamente uma visualização por carregamento de página, mesmo após pausar e retomar.
- Quando a URL de stream expira durante a reprodução, o vídeo retoma do mesmo ponto após uma única renovação.

---

## Technical Specifications

### API Contracts

> _BFF tier — frontend-exposed contract. The browser calls the FE-facing route; the route proxies the upstream per the project's documented BFF architecture (`next-frontend/CLAUDE.md` § "Talking to the NestJS API"). Contract source: `nestjs-project/openapi.json` synced to `next-frontend/openapi.json` → `lib/api/types.gen.ts` → aliases in `lib/api/contracts.ts` (SI-05.1). The upstream `{id}` is the 11-char `public_id`. Error bodies use `ApiErrorEnvelope` `{ statusCode, error, message }`._

#### RSC server-side reads — `/watch/[publicId]` (SI-05.9b)

No FE-facing route: the page is an async Server Component that calls `upstream` (`lib/api/upstream.ts`) directly; reads are uncached (`cache: 'no-store'` / dynamic rendering) *(per phase-05-video-watch-frontend/TD-02)*. The suggestions read runs inside a Suspense boundary so the player does not wait on it *(per phase-05-video-watch-frontend/TD-02)*.

- `GET /videos/{id}` → `VideoDetailDto` *(derived: project contract source)*; 404 `VIDEO_NOT_FOUND` → `notFound()` → `app/watch/[publicId]/not-found.tsx` *(per phase-05-video-watch-frontend/TD-01)*.
- `GET /videos/{id}/suggestions` → `VideoSuggestionsDto` `{ items: PublicVideoDto[] }` (max 12) *(derived: project contract source)*.
- `GET /videos/{id}/stream` → `PresignedUrlResponseDto` `{ url, expires_at }` — the initial stream URL, fetched only when `processing_status` is `ready` *(derived: project contract source; reshape: none)*; non-ready → status placeholder, no stream fetch *(per phase-05-video-watch-frontend/TD-03 revision)*.

**Request headers (all three reads):**
- Authorization: Bearer {session.accessToken}, sent only when the iron-session cookie has `isLoggedIn` *(per phase-02-auth-frontend/TD-02)*; optional upstream (missing/invalid/expired → anonymous) *(derived: project contract source)*.
- **No refresh in RSC:** Server Components can read but not write cookies, so `withRefresh` (which persists the rotated pair via `setSession`) is not used here; an expired access token degrades the read to anonymous *(known gap accepted by the user at /plan-build 2026-11-09 — affects only the owner opening their own draft after the access token expires: the page renders the not-found state until a BFF Route Handler refreshes the cookie; follow-up task: Next `proxy.ts` refresh before render)*.

---

#### POST /api/videos/[id]/views (SI-05.5)

**forwards-to:** `POST /videos/{id}/views` *(derived: project contract source)*

Called once by the player on the first `play` event of a page load *(per phase-05-video-watch/TD-01 — counts actual plays, not page loads)*; never called for a non-ready video *(per phase-05-video-watch-frontend/TD-03 revision)*.

**Request headers:**
- Authorization: Bearer {session.accessToken}, added by the BFF when the session is logged in; optional upstream *(derived: project contract source)*
- User-Agent: the browser's `user-agent`, forwarded by the BFF *(per phase-05-video-watch/TD-01 revision — anonymous viewer key = SHA-256 of client IP + user agent)*
- X-Forwarded-For: the BFF appends the client address as the last entry *(per phase-05-video-watch/TD-01 revision — API trusts exactly one hop, `req.ip` = last entry)*

**Request body:** none *(derived: project contract source)*

**Response 204 (FE-facing):** No content — pass-through, whether counted, deduplicated or owner self-view *(derived: project contract source; reshape: none)*

**Error responses (FE-facing):**
- 404 VIDEO_NOT_FOUND: pass-through *(derived: project contract source)*
- 409 VIDEO_NOT_READY: pass-through *(derived: project contract source)*

The player treats every error as non-fatal (fire-and-forget; playback continues) *(per phase-05-video-watch-frontend/TD-03)*.

---

#### GET /api/videos/[id]/stream (SI-05.6)

**forwards-to:** `GET /videos/{id}/stream` *(derived: project contract source)*

Called by the player only after a media `error` event on the current `src`, to replace an expired presigned URL and resume from the last `currentTime` *(per phase-05-video-watch-frontend/TD-04)*.

**Request headers:**
- Authorization: Bearer {session.accessToken}, added by the BFF when the session is logged in (needed for the owner's ready draft); optional upstream *(derived: project contract source)*

**Response 200 (FE-facing):** `PresignedUrlResponseDto` `{ url, expires_at }` — pass-through *(derived: project contract source; reshape: none)*

**Error responses (FE-facing):**
- 404 VIDEO_NOT_FOUND: pass-through *(derived: project contract source)*
- 409 VIDEO_NOT_READY: pass-through *(derived: project contract source)*

---

#### GET /api/videos/[id]/download (SI-05.7)

**forwards-to:** `GET /videos/{id}/download` *(derived: project contract source)*

Called by the owner-only Download button; the client then navigates to the returned `url` (presigned GET with `response-content-disposition=attachment` per phase-03-videos/TD-08 revision, so the browser downloads instead of playing).

**Request headers:**
- Authorization: Bearer {session.accessToken}, required upstream *(derived: project contract source)*; the upstream call is wrapped in `withRefresh` (single-flight refresh on 401, cookie persisted — allowed in a Route Handler) *(per phase-02-auth-frontend/TD-03)*

**Response 200 (FE-facing):** `PresignedUrlResponseDto` `{ url, expires_at }` — pass-through *(derived: project contract source; reshape: none)*

**Error responses (FE-facing):**
- 401 UNAUTHORIZED: no logged-in session (the BFF answers without calling upstream) or refresh failed — envelope as produced by `withRefresh` *(per phase-02-auth-frontend/TD-03)*
- 403 VIDEO_ACCESS_DENIED: pass-through *(derived: project contract source)*
- 404 VIDEO_NOT_FOUND: pass-through *(derived: project contract source)*
- 409 VIDEO_NOT_READY: pass-through *(derived: project contract source)*

---

#### POST /api/auth/login — amendment: session `channelSlug` (SI-05.8)

Existing route from phase-02-auth-frontend; request, FE-facing response and error pass-through are unchanged. Today it seals `channelSlug: ""` because `POST /auth/login` returns only `{ access_token, refresh_token }` *(derived: project contract source)*, so the owner-only Download button could never render.

**Additional upstream call:** after the 200 from `POST /auth/login`, the route calls `GET /channels/me` with `Authorization: Bearer {access_token}` *(derived: project contract source)* → `ChannelProfileDto` *(derived: project contract source)*.

**Set-Cookie / session side-effect:** the sealed session carries `channelSlug` = `ChannelProfileDto.nickname` *(per phase-02-auth-frontend/TD-02 — cookie carries `channelSlug`; per phase-05-video-watch/TD-03 Note — Download visibility compares it with `channel.nickname`; resolved with the user at /plan-build 2026-11-09)*. If `GET /channels/me` fails, login still succeeds with `channelSlug: ""` (the Download button stays hidden) — the login outcome never depends on the channel read. Sessions created before this change keep the empty slug until the next login.

### Authorization Matrix

FE-facing surfaces of this slice; the upstream rules are owned by the sibling slice (`phase-05-video-watch` Authorization Matrix) and phase-04-channel-management/TD-04. "Owner" = logged-in session whose `channelSlug` equals the video's `channel.nickname`.

| Endpoint | Anonymous | Authenticated | Owner |
|----------|-----------|---------------|-------|
| `/watch/[publicId]` page (published public/unlisted) | ✓ | ✓ | ✓ |
| `/watch/[publicId]` page (draft) | ✗ (not-found) | ✗ (not-found) | ✓ (status placeholder unless `ready`) |
| POST /api/videos/[id]/views (published) | ✓ counted | ✓ counted | ✓ 204, not counted |
| GET /api/videos/[id]/stream (published) | ✓ | ✓ | ✓ |
| GET /api/videos/[id]/stream (ready draft) | ✗ (404) | ✗ (404) | ✓ |
| GET /api/videos/[id]/download | ✗ (401) | ✗ (403) | ✓ |
| Download button rendered | ✗ | ✗ | ✓ *(per phase-05-video-watch/TD-03 Note — `channelSlug` vs `channel.nickname`)* |

### Error Catalog

No new error codes; this slice consumes the upstream codes (envelope per phase-02-auth/TD-07) and the BFF's own 401 from `withRefresh`.

| errorCode | HTTP | Trigger |
|-----------|------|---------|
| VIDEO_NOT_FOUND | 404 | Unknown/malformed `publicId`, or a draft read by a non-owner — on the RSC detail read it renders `not-found.tsx`; on BFF routes it is passed through |
| VIDEO_NOT_READY | 409 | `POST /api/videos/[id]/views`, `GET /api/videos/[id]/stream` or `GET /api/videos/[id]/download` on a video whose `processing_status` is not `ready` |
| VIDEO_ACCESS_DENIED | 403 | `GET /api/videos/[id]/download` by an authenticated non-owner |
| UNAUTHORIZED | 401 | `GET /api/videos/[id]/download` with no logged-in session, or after a failed refresh (`withRefresh`) |

### UI Contracts

#### Screen: Página de visualização do vídeo

**Route:** `/watch/[publicId]` *(per phase-05-video-watch-frontend/TD-01)*
**Figma:** https://www.figma.com/design/Wa3MJdwiXSgQW2VqZ9q4Zu/FC-Tube?node-id=152-2219 (node `Wa3MJdwiXSgQW2VqZ9q4Zu:152:2219`)
**Purpose:** "Layout da página: vídeo principal + informações + sidebar com sugestões"

**Auth requirement:** Mixed — specify manually per screen Observations hint. _(The page is Anonymous for every verb except the Download button, which is Owner-only — inventory Observation: "a tela não exige sessão para nenhum verbo do slice — só o download (owner-only) depende da sessão". Source: §Authorization Matrix.)_

**Rendering strategy:** async Server Component page; detail (and the initial stream URL when `ready`) awaited on the server with `notFound()` + `generateMetadata`; suggestions sidebar streamed in a `<Suspense>` boundary with a skeleton fallback; all reads uncached *(source: phase-05-video-watch-frontend/TD-02)*. Client Components only for the player (`components/video/video-player.tsx`), the description toggle (`components/video/video-description.tsx`) and the Download button.

**Reused DS components:**
- `components/video/video-player.tsx (new)` — Video (152:2323) — Descrição Figma: "Video player mockup with play controls, scrubber bar, timestamp, and chrome overlays". Recebe URL de stream (presigned, expira) e registra visualização no início da reprodução. Implementação depende de TD-03/TD-04 (pendentes)
- `components/ui/slider.tsx (new)` — Timeline / progress bar (I152:2323;108:249) — Barra de progresso com camadas "loaded"/"played" + scrubber (108:258); opera sobre o `<video>` no cliente
- `new` — Sound button (I152:2323;108:266) — Mute/unmute + slider de nível de volume revelado no hover/foco (decisão do usuário 2026-11-09; slider não desenhado no Figma — reusa `components/ui/slider.tsx (new)`)
- `components/video/video-info.tsx (new)` — video title block (152:2441) — Bloco de informações: título, canal, ações. Dados do detalhe do vídeo (title, channel {nickname, name})
- `components/ui/avatar.tsx (new)` — Avatar do canal (2409:2276) — Figma Avatar (5 tamanhos sm/md/lg/xl/2xl); aqui md 40px. Contrato de detalhe não traz avatar do canal (ver Observations)
- `components/ui/button.tsx` — Button "Download" (sem nó — adicionado à action row 152:2460) — Não desenhado no Figma; adicionado por decisão do usuário 2026-11-09. Visível só ao dono (channel.nickname == channelSlug da sessão); mesmo estilo do Button "Share" (158:2697)
- `components/video/video-description.tsx (new)` — description card wrap (152:2487) — Exibe descrição vinda do detalhe do vídeo com estado local expandir/recolher
- `components/ui/card.tsx` — Card (158:4025) — Container da descrição
- `components/video/suggested-videos.tsx (new)` — recommended videos list (158:3801) — Sidebar de sugestões (até 12, mesma categoria); Figma mostra 5
- `components/video/video-card.tsx (new)` — VideoCard (158:3729, 158:3767, 158:3784, 158:3802, 158:3819) — Variante "list" (horizontal) do VideoCard Figma; navega para `/watch/[publicId]` via `<Link>`; dados recebidos da lista
- `new` — Duration badge "12:31" (I158:3729;143:2533) — Sub-elemento do VideoCard; exibido (decisão do usuário 2026-11-09) — `PublicVideoDto` já expõe `duration_seconds`
- `new` — Main content (2732:2119), Left column (2732:2117), Right column (2732:2118), video main column (152:2440) — layout wrappers (two columns: video + info on the left, suggestions on the right)
- `new` — Poster/thumbnail, Play button, Timestamp, Title text, Channel name, video meta row, Description text, "Show More" toggle — sub-elements of the components above (see inventory rows)

**Server-connected components:**
- `Video` — verbs: Reproduzir o vídeo com controles de play/pause, volume e barra de progresso; Registrar uma visualização ao iniciar a reprodução; Renovar a URL de stream quando ela expirar durante a reprodução | endpoint: RSC read `GET /videos/{id}/stream` (initial URL), `POST /api/videos/[id]/views`, `GET /api/videos/[id]/stream` (§API Contracts → BFF tier) | reuse: `components/video/video-player.tsx (new)`
- `video title block` — verbs: Exibir título e canal do vídeo | endpoint: RSC read `GET /videos/{id}` (§API Contracts → BFF tier) | reuse: `components/video/video-info.tsx (new)`
- `video meta row` — verbs: Exibir contagem de visualizações e data de publicação | endpoint: RSC read `GET /videos/{id}` (§API Contracts → BFF tier) | reuse: new
- `Button "Download"` — verbs: Baixar o arquivo do vídeo (apenas para o dono do canal) | endpoint: `GET /api/videos/[id]/download` (§API Contracts → BFF tier) | reuse: `components/ui/button.tsx`
- `recommended videos list` — verbs: Exibir sugestões de vídeos da mesma categoria na sidebar | endpoint: RSC read `GET /videos/{id}/suggestions` (§API Contracts → BFF tier) | reuse: `components/video/suggested-videos.tsx (new)`
- `description card wrap` — verbs: Exibir descrição do vídeo com expansão/recolhimento | endpoint: RSC read `GET /videos/{id}` (§API Contracts → BFF tier) | reuse: `components/video/video-description.tsx (new)`

**Behaviors:**

*Rendered states:*
- Loading: the route awaits the detail on the server (no client spinner for the main column); the suggestions sidebar shows a skeleton list while its Suspense boundary resolves *(per phase-05-video-watch-frontend/TD-02)*.
- Empty: suggestions `{ items: [] }` → the sidebar renders no cards (no error); an empty `description` → the description card shows only the meta row and no "Show more".
- Success: player with play/pause, volume (mute + slider on hover/focus), progress bar with buffered and played layers, and timestamp "current / duration"; title `<h1>`, initials avatar + channel name link to `/channels/[nickname]`, Download button only for the owner; meta row "{N} views • {relative date}" formatted in English via `Intl` (e.g., "10K views", "3 weeks ago"); description clamped to 3 lines; up to 12 suggestion cards with thumbnail, duration badge, title, compact views and relative date *(per phase-05-video-watch-frontend/TD-02 revisions)*.
- Not ready (owner's own draft, `processing_status` not `ready`): the player area shows a status placeholder — "Processing…" while processing, "Processing failed" when failed; no stream URL fetch, no view call; info block and sidebar render normally *(per phase-05-video-watch-frontend/TD-03 revision)*.
- Not found: unknown `publicId` or a draft read by a non-owner → `app/watch/[publicId]/not-found.tsx` with a centered "This video isn't available" and a "Go to home" link to `/` (`components/ui/button.tsx`) *(per phase-05-video-watch-frontend/TD-01 revision)*. Also the accepted gap for the owner's draft with an expired access token (see §API Contracts → RSC server-side reads).
- Error: stream `error` event → the player calls `GET /api/videos/[id]/stream` once, swaps `src` and seeks back to the saved `currentTime`; if the refresh fails, the player shows an inline "Video unavailable" message *(per phase-05-video-watch-frontend/TD-04)*; view-call errors are ignored; download errors show an inline message next to the button.

*Interactions:*
- Play button click / video click → toggles `play()` / `pause()`; the first `play` of the page load fires `POST /api/videos/[id]/views` once.
- Progress slider drag/keyboard → seeks `currentTime` on commit (`onValueCommit`); during playback the slider follows `timeupdate`, the buffered layer follows `progress` *(per library-refs `radix-ui` Slider)*.
- Sound button click → toggles `muted`; hover/focus on the sound control reveals the volume slider, which sets `volume` 0–1.
- "Show more" click → expands the full description and the button becomes "Show less" (`aria-expanded` toggles); the button exists only when the clamped text overflows *(per phase-05-video-watch-frontend/TD-02 revision)*.
- Download button click → `GET /api/videos/[id]/download` → navigate to the returned `url` (attachment download).
- Suggestion card click → `<Link>` to `/watch/{public_id}`.
- Channel name click → `<Link>` to `/channels/[nickname]` (404 until the Phase 04 frontend lands — known gap, per phase-05-video-watch-frontend/TD-02 revision).

**Error Catalog → UX mapping:**

| errorCode (from §Error Catalog) | UX treatment |
|---------------------------------|--------------|
| `VIDEO_NOT_FOUND` | Detail read → `not-found.tsx`; stream refresh → inline "Video unavailable" in the player; views → ignored; download → inline error next to the button |
| `VIDEO_NOT_READY` | Not reachable from the UI for detail (placeholder shown instead of the player); stream/download → inline error; views → ignored |
| `VIDEO_ACCESS_DENIED` | Download → inline error next to the button (button is normally hidden for non-owners) |
| `UNAUTHORIZED` | Download → inline "Session expired — log in again" message next to the button |

**Client-side validation mirror:** _None — the screen has no form input._

**Accessibility notes:**
- Player controls are buttons with accessible names that reflect state ("Play"/"Pause", "Mute"/"Unmute"); sliders carry `aria-label` ("Seek", "Volume") and keyboard support from Radix Slider *(per library-refs `radix-ui`)*.
- Title is the page `<h1>`; "Show more"/"Show less" exposes `aria-expanded` *(per phase-05-video-watch-frontend/TD-02 revision)*.
- Initials avatar is decorative next to the channel name link (empty `alt` / `aria-hidden`); duration badge text stays readable by assistive tech.
- Follow DS defaults for focus-visible states on buttons and links.

### UI ↔ API Traceability Matrix

| Verb | Component | Screen | Endpoint (from API Contracts) | TD ref |
|------|-----------|--------|-------------------------------|--------|
| Reproduzir o vídeo com controles de play/pause, volume e barra de progresso | Video | /watch/[publicId] | RSC read → `GET /videos/{id}/stream` | phase-05-video-watch-frontend/TD-03, phase-05-video-watch-frontend/TD-04 |
| Registrar uma visualização ao iniciar a reprodução | Video | /watch/[publicId] | POST /api/videos/[id]/views → forwards-to POST /videos/{id}/views | phase-05-video-watch/TD-01 |
| Renovar a URL de stream quando ela expirar durante a reprodução | Video | /watch/[publicId] | GET /api/videos/[id]/stream → forwards-to GET /videos/{id}/stream | phase-05-video-watch-frontend/TD-04 |
| Exibir título e canal do vídeo | video title block | /watch/[publicId] | RSC read → `GET /videos/{id}` | phase-05-video-watch-frontend/TD-02 |
| Exibir contagem de visualizações e data de publicação | video meta row | /watch/[publicId] | RSC read → `GET /videos/{id}` | phase-05-video-watch-frontend/TD-02 |
| Baixar o arquivo do vídeo (apenas para o dono do canal) | Button "Download" | /watch/[publicId] | GET /api/videos/[id]/download → forwards-to GET /videos/{id}/download | phase-05-video-watch/TD-03 |
| Exibir sugestões de vídeos da mesma categoria na sidebar | recommended videos list | /watch/[publicId] | RSC read → `GET /videos/{id}/suggestions` | phase-05-video-watch-frontend/TD-02, phase-05-video-watch/TD-02 |
| Exibir descrição do vídeo com expansão/recolhimento | description card wrap | /watch/[publicId] | RSC read → `GET /videos/{id}` | phase-05-video-watch-frontend/TD-02 |

_Capabilities marked in `## Non-UI / Deferred Capabilities` are excluded from this matrix (none in this slice)._

---

## Dependency Map

SI-05.0.1 (root) — shadcn `avatar` + `slider`
├── SI-05.0.2 — depends on SI-05.0.1 (tests the installed primitives)
└── SI-05.0.3 — depends on SI-05.0.1 (player uses `slider`, info block uses `avatar`)
SI-05.0.4 (root, independent) — video-description
SI-05.1 (root) — OpenAPI sync + video aliases
├── SI-05.2 — depends on SI-05.1 (MSW bodies typed by the aliases)
│   ├── SI-05.5 — depends on SI-05.1, SI-05.2, SI-05.4 (views route)
│   ├── SI-05.6 — depends on SI-05.1, SI-05.2, SI-05.4 (stream refresh route)
│   └── SI-05.7 — depends on SI-05.1, SI-05.2, SI-05.4 (download route)
└── SI-05.8 — depends on SI-05.1 (`ChannelProfile` alias; login seals `channelSlug`)
SI-05.3 (root, independent) — `lib/format.ts`
SI-05.4 (root, independent) — `lib/api/forwarding.ts`
SI-05.9.0 — depends on SI-05.0.1, SI-05.0.3, SI-05.0.4 (audit reads the bootstrap files)
└── SI-05.9a — depends on SI-05.9.0 + SI-05.0.1, SI-05.0.3, SI-05.0.4 (applies drift decisions, renders shell)
    └── SI-05.9b — depends on SI-05.9a, SI-05.1, SI-05.2, SI-05.3, SI-05.4, SI-05.5, SI-05.6, SI-05.7, SI-05.8 (wires RSC reads, player and Download)

---

## Deliverables

- [ ] SI-05.0.1 — Infra: install batch shadcn primitives
- [ ] SI-05.0.2 — Tests shadcn batch (avatar, slider)
- [ ] SI-05.0.3 — Custom-business simple group: suggested-videos + video-card + video-info + video-player
- [ ] SI-05.0.4 — Custom-business complex: video-description
- [ ] SI-05.1 — Sync do contrato OpenAPI e aliases de vídeo em `lib/api/contracts.ts`
- [ ] SI-05.2 — Handlers MSW de vídeos (`mocks/handlers/videos.ts`)
- [ ] SI-05.3 — Formatadores de exibição (`lib/format.ts`)
- [ ] SI-05.4 — Headers de encaminhamento ao upstream (`lib/api/forwarding.ts`)
- [ ] SI-05.5 — BFF Route Handler: POST /api/videos/[id]/views
- [ ] SI-05.6 — BFF Route Handler: GET /api/videos/[id]/stream
- [ ] SI-05.7 — BFF Route Handler: GET /api/videos/[id]/download
- [ ] SI-05.8 — Sessão carrega `channelSlug` no login (`POST /api/auth/login`)
- [ ] SI-05.9.0 — Drift audit: Página de visualização do vídeo
- [ ] SI-05.9a — Tela de Página de visualização do vídeo (visual shell)
- [ ] SI-05.9b — Tela de Página de visualização do vídeo (lógica & wiring)

**Per-screen deliverables:**

- [ ] Screen Página de visualização do vídeo (/watch/[publicId]) is routable
- [ ] Screen Página de visualização do vídeo (/watch/[publicId]) renders loading (suggestions skeleton), success, not-ready placeholder, not-found and error states
- [ ] Screen Página de visualização do vídeo (/watch/[publicId]) passes component tests (per testing-guide-next-frontend layers)

**Full test suites:**

- [ ] Frontend tests pass (`cd next-frontend && docker compose exec next-frontend npm test`)
- [ ] E2E tests pass (`cd next-frontend && npx playwright test` on the host, dev server running in the container with `MSW_ENABLED=true`)
- [ ] Type/compilation checks pass (`cd next-frontend && docker compose exec next-frontend npx tsc --noEmit`)
- [ ] Lint passes (`cd next-frontend && docker compose exec next-frontend npm run lint`)
