---
subproject: backend
runner: jest+supertest
scope: phase-06-social-interactions
si: SI-06.2
target_file: test/videos-reaction.e2e-spec.ts
---

# PUT/DELETE /videos/:id/reaction — Video Like/Dislike Test Plan

## Application Overview

Um usuário autenticado curte, descurte ou remove sua reação a um vídeo com `PUT /videos/:id/reaction` (`{ "value": "like" | "dislike" }`) e `DELETE /videos/:id/reaction`. As duas rotas são idempotentes e respondem `200` com `ReactionState` `{ like_count, my_reaction }` — a contagem de dislikes é guardada mas nunca exposta. Escrever exige a regra de leitura do vídeo (rascunho de terceiros → `404 VIDEO_NOT_FOUND`) e `processing_status = ready` (senão `409 VIDEO_NOT_READY`); o dono do canal pode reagir ao próprio vídeo.

## Test Scenarios

### 1. Definir e remover reação

**Setup:** `beforeAll` cria o app via `createVideosApp`; `beforeEach` chama `resetVideosState`; `createConfirmedUser` cria o dono e um segundo usuário (tokens); `seedVideo` insere um vídeo `ready`, `published`, `public` do dono.

#### 1.1. like-idempotente

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. PUT /videos/<public_id>/reaction com o token do segundo usuário e body `{ "value": "like" }`
    - expect: status `200` com `{ "like_count": 1, "my_reaction": "like" }`
    - expect: o corpo não tem campo de contagem de dislikes
  2. Repetir a mesma chamada
    - expect: status `200` com o mesmo corpo `{ "like_count": 1, "my_reaction": "like" }`

#### 1.2. troca-like-para-dislike

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. PUT /videos/<public_id>/reaction com o token do segundo usuário e `{ "value": "like" }`
    - expect: status `200` com `like_count: 1`
  2. PUT /videos/<public_id>/reaction com o mesmo token e `{ "value": "dislike" }`
    - expect: status `200` com `{ "like_count": 0, "my_reaction": "dislike" }`
  3. Consultar a linha do vídeo no banco
    - expect: `like_count = 0` e `dislike_count = 1`

#### 1.3. delete-idempotente

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. PUT /videos/<public_id>/reaction com o token do segundo usuário e `{ "value": "like" }`
    - expect: status `200`
  2. DELETE /videos/<public_id>/reaction com o mesmo token
    - expect: status `200` com `{ "like_count": 0, "my_reaction": null }`
  3. Repetir o DELETE
    - expect: status `200` com `{ "like_count": 0, "my_reaction": null }`

### 2. Validação, autenticação e regra de escrita

**Setup:** mesmo app e reset do grupo 1; `seedVideo` insere também (a) um vídeo `ready` em `draft` do dono e (b) um vídeo `published` com `processing_status = 'processing'` do dono.

#### 2.1. valor-invalido-e-sem-token

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. PUT /videos/<public_id>/reaction com o token do segundo usuário e `{ "value": "love" }`
    - expect: status `400` com `error: "VALIDATION_ERROR"`
  2. PUT /videos/<public_id>/reaction sem `Authorization` e `{ "value": "like" }`
    - expect: status `401`

#### 2.2. rascunho-404-e-nao-pronto-409

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. PUT /videos/<public_id do rascunho>/reaction com o token do segundo usuário e `{ "value": "like" }`
    - expect: status `404` com `error: "VIDEO_NOT_FOUND"`
  2. PUT /videos/<public_id do vídeo em processamento>/reaction com o mesmo token e `{ "value": "like" }`
    - expect: status `409` com `error: "VIDEO_NOT_READY"`
  3. Consultar `like_count` dos dois vídeos no banco
    - expect: ambos continuam `0`

#### 2.3. dono-curte-proprio-video

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. PUT /videos/<public_id>/reaction com o token do dono e `{ "value": "like" }`
    - expect: status `200` com `{ "like_count": 1, "my_reaction": "like" }`
