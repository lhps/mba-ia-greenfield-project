---
subproject: backend
runner: jest+supertest
scope: phase-06-social-interactions
si: SI-06.5
target_file: test/comments-reaction.e2e-spec.ts
---

# PUT/DELETE /comments/:id/reaction — Comment Like/Dislike Test Plan

## Application Overview

Usuários autenticados curtem, descurtem ou removem a reação a um comentário com `PUT /comments/:id/reaction` (`{ "value": "like" | "dislike" }`) e `DELETE /comments/:id/reaction`, com o mesmo contrato idempotente de reações em vídeo: `200` com `{ like_count, my_reaction }`. O comentário precisa existir, não ser placeholder e ter o vídeo legível pelo chamador (senão `404 COMMENT_NOT_FOUND`); o vídeo precisa estar `ready`. A listagem de comentários mostra `like_count` e o `my_reaction` do espectador.

## Test Scenarios

### 1. Reagir a comentários

**Setup:** `beforeAll` cria o app via `createVideosApp`; `beforeEach` chama `resetVideosState`; `createConfirmedUser` cria o dono e um segundo usuário; `seedVideo` insere um vídeo `ready`, `published`, `public` do dono; o dono cria o comentário C via POST /videos/<public_id>/comments.

#### 1.1. like-aparece-na-listagem

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. PUT /comments/<C>/reaction com o token do segundo usuário e `{ "value": "like" }`
    - expect: status `200` com `{ "like_count": 1, "my_reaction": "like" }`
  2. GET /videos/<public_id>/comments com o token do segundo usuário
    - expect: C com `like_count: 1` e `my_reaction: "like"`
  3. GET /videos/<public_id>/comments sem `Authorization`
    - expect: C com `like_count: 1` e `my_reaction: null`

#### 1.2. troca-remove-e-idempotencia

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. PUT /comments/<C>/reaction com o token do segundo usuário e `{ "value": "like" }`
    - expect: status `200` com `like_count: 1`
  2. PUT com `{ "value": "dislike" }`
    - expect: status `200` com `{ "like_count": 0, "my_reaction": "dislike" }`
  3. Repetir o PUT com `dislike`
    - expect: status `200` com o mesmo corpo
  4. DELETE /comments/<C>/reaction com o mesmo token, duas vezes
    - expect: as duas respostas `200` com `{ "like_count": 0, "my_reaction": null }`

### 2. Comentários indisponíveis

**Setup:** mesmo app e reset do grupo 1; além de C, o segundo usuário responde C com R e o dono apaga C (placeholder); `seedVideo` insere um vídeo `ready` em `draft` do dono e o dono comenta nele (comentário D).

#### 2.1. placeholder-404

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. PUT /comments/<C>/reaction com o token do segundo usuário e `{ "value": "like" }`
    - expect: status `404` com `error: "COMMENT_NOT_FOUND"`

#### 2.2. video-rascunho-404-e-sem-token-401

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. PUT /comments/<D>/reaction com o token do segundo usuário e `{ "value": "like" }`
    - expect: status `404` com `error: "COMMENT_NOT_FOUND"`
  2. PUT /comments/<R>/reaction sem `Authorization` e `{ "value": "like" }`
    - expect: status `401`
