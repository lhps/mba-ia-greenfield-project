---
subproject: frontend
runner: playwright
scope: phase-05-video-watch-frontend
si: SI-05.9b
target_file: tests/video-watch.e2e-spec.ts
---

# Página de visualização do vídeo — Test Plan

## Application Overview

A rota `/watch/[publicId]` é a página pública de visualização de um vídeo. É um async Server Component que lê o detalhe (`GET /videos/{id}`), a URL inicial de stream (só quando `processing_status` é `ready`) e, num boundary `<Suspense>`, as sugestões da sidebar — todas leituras server-side sem cache, com o bearer da sessão quando há login. Visitantes anônimos assistem vídeos publicados; o botão Download aparece apenas para o dono (sessão `channelSlug` igual a `channel.nickname`) e chama o BFF `GET /api/videos/[id]/download`, navegando para a URL presigned de attachment. Um `public_id` desconhecido (ou rascunho de outro usuário) renderiza `not-found.tsx`; um vídeo do dono ainda não pronto mostra um placeholder de status no lugar do player. O upstream NestJS é falsificado server-side pelos handlers MSW de `mocks/` (reserved trigger fixtures por `public_id`: `missing0000` → 404, `processing0` → processando, `failed00000` → falhou; demais ids → vídeo publicado do canal `pixel_point`).

## Test Scenarios

### 1. Exibir o vídeo, suas informações e as sugestões na página de visualização

**Setup:** `next-frontend/tests/fixtures.ts` (MSW network fixture auto-applied; server-side upstream faked via `instrumentation.ts`, no browser `page.route()` of `/api/**`)

#### 1.1. watch-anonimo-video-publicado

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-10T12:22:48Z

**Steps:**
  1. Visitante anônimo (sem cookie de sessão) navega para `/watch/abcDEF12345`
    - expect: o player renderiza com os controles "Play", "Mute" e os sliders "Seek" e "Volume"
    - expect: o título do vídeo aparece como `<h1>` e o nome do canal é um link para `/channels/pixel_point`
    - expect: a meta row mostra "{N} views • {data relativa}" em inglês (ex.: "10K views", "3 weeks ago")
  2. Visitante observa a descrição e a sidebar
    - expect: a descrição aparece recolhida em 3 linhas com o botão "Show more" (`aria-expanded="false"`)
    - expect: a sidebar lista cards de sugestão, cada um com link para `/watch/{public_id}` e duration badge
  3. Visitante procura o botão Download
    - expect: nenhum botão "Download" é renderizado

#### 1.2. watch-dono-baixa-video

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-10T12:22:48Z

**Steps:**
  1. Usuário faz login em `/login` com credenciais válidas (fixture padrão → sessão com `channelSlug: "pixel_point"`)
    - expect: o login conclui e a sessão é estabelecida
  2. Usuário navega para `/watch/abcDEF12345` (vídeo do canal `pixel_point`)
    - expect: o botão "Download" é renderizado na action row
  3. Usuário clica em "Download"
    - expect: a requisição `GET /api/videos/abcDEF12345/download` é disparada e responde `200`
    - expect: o browser navega/baixa a `url` retornada (download iniciado), sem mensagem de erro inline

#### 1.3. watch-video-indisponivel

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-10T12:22:48Z

**Steps:**
  1. Visitante navega para `/watch/missing0000` (reserved trigger upstream → `404 VIDEO_NOT_FOUND`)
    - expect: a página mostra a mensagem centralizada "This video isn't available"
    - expect: nenhum player nem sidebar de sugestões é renderizado
  2. Visitante clica em "Go to home"
    - expect: a URL passa a ser `/`

#### 1.4. watch-placeholder-video-nao-pronto

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-10T12:22:48Z

**Steps:**
  1. Usuário logado como dono navega para `/watch/processing0` (reserved trigger → `processing_status: "processing"`)
    - expect: a área do player mostra "Processing…" e nenhum elemento `<video>` é renderizado
    - expect: o título e a sidebar de sugestões renderizam normalmente
    - expect: nenhuma requisição para `/api/videos/processing0/stream` nem `/api/videos/processing0/views` é disparada
  2. Usuário navega para `/watch/failed00000` (reserved trigger → `processing_status: "failed"`)
    - expect: a área do player mostra "Processing failed" e nenhum elemento `<video>` é renderizado
