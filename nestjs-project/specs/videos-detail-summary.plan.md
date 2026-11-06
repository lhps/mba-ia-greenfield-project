---
subproject: backend
runner: jest+supertest
scope: phase-05-video-watch
si: SI-05.3
target_file: test/videos-detail-summary.e2e-spec.ts
---

# GET /videos/:id — VideoDetail with View Count and Channel Summary Test Plan

## Application Overview

Na Fase 05 o formato compartilhado `VideoDetail` ganha `view_count` e o resumo do canal `channel: { nickname, name }`, para que a página de visualização monte o bloco de informações com uma única chamada e o frontend decida mostrar o botão de download comparando `channel.nickname` com o `channelSlug` da sessão. A regra de leitura de `GET /videos/:id` não muda; os mesmos campos aparecem em toda resposta que já devolve `VideoDetail` (`PATCH /videos/:id`, `POST /videos/:id/publish`, `POST /videos/:id/unpublish`).

## Test Scenarios

### 1. VideoDetail carrega contagem e canal

**Setup:** `beforeAll` cria o app via `createVideosApp`; `beforeEach` chama `resetVideosState`; `createConfirmedUser` cria o dono (token); `seedVideo` insere um vídeo `ready`, `published`, `public`, com categoria e `view_count = 7` no canal do dono.

#### 1.1. get-publicado-traz-view-count-e-canal

**Covers AC:** #1, #3
**Source:** auto
**Last sync:** 2026-11-06T17:55:55Z

**Steps:**
  1. GET /videos/<public_id> sem `Authorization`
    - expect: status `200`
    - expect: `view_count` igual a `7`
    - expect: `channel` igual a `{ nickname: <nickname do canal do dono>, name: <nome do canal do dono> }`
    - expect: `channel` não tem nenhuma outra chave (sem `id`, `user_id`)

#### 1.2. respostas-de-gestao-trazem-os-mesmos-campos

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-06T17:55:55Z

**Steps:**
  1. PATCH /videos/<public_id> com o token do dono e body `{ "title": "Novo título" }`
    - expect: status `200` com `view_count` e `channel { nickname, name }` presentes
  2. POST /videos/<public_id>/unpublish com o token do dono
    - expect: status `200` com `view_count` e `channel { nickname, name }` presentes
  3. POST /videos/<public_id>/publish com o token do dono
    - expect: status `200` com `view_count` e `channel { nickname, name }` presentes
