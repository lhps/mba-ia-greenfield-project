---
subproject: backend
runner: jest+supertest
scope: phase-06-social-interactions
si: SI-06.3
target_file: test/videos-comments.e2e-spec.ts
---

# POST/GET /videos/:id/comments and GET /comments/:id/replies — Comments Test Plan

## Application Overview

Usuários autenticados comentam um vídeo com `POST /videos/:id/comments` (`body` aparado, 1–2.000 caracteres) ou respondem um comentário passando `parent_id`; responder uma resposta prende o novo comentário à raiz (um nível de respostas). A criação segue a regra de leitura do vídeo e exige `ready`, atualiza `videos.comment_count` (e `reply_count` da raiz) e é limitada por usuário (`COMMENT_RATE_LIMIT` por `COMMENT_RATE_TTL_SECONDS`, padrão 10 / 60 s). Qualquer pessoa lê os comentários raiz do mais novo para o mais antigo em `GET /videos/:id/comments` e as respostas do mais antigo para o mais novo em `GET /comments/:id/replies`, ambos com paginação keyset (`next_cursor`); `my_reaction` é `null` para anônimos.

## Test Scenarios

### 1. Criar comentários e respostas

**Setup:** `beforeAll` cria o app via `createVideosApp`; `beforeEach` chama `resetVideosState` e limpa o storage do throttler; `createConfirmedUser` cria o dono e um segundo usuário (tokens); `seedVideo` insere um vídeo `ready`, `published`, `public` do dono e um segundo vídeo publicado do dono.

#### 1.1. cria-comentario-aparado

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. POST /videos/<public_id>/comments com o token do segundo usuário e `{ "body": "  Nice video  " }`
    - expect: status `201` com `body: "Nice video"`, `parent_id: null`, `deleted: false`, `like_count: 0`, `reply_count: 0`, `my_reaction: null`
    - expect: `author.nickname` igual ao nickname do canal do segundo usuário
  2. GET /videos/<public_id>
    - expect: `comment_count` igual a `1`

#### 1.2. resposta-a-resposta-vai-para-raiz

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. POST /videos/<public_id>/comments com o token do dono e `{ "body": "root" }`
    - expect: status `201`; guardar `id` como raiz
  2. POST /videos/<public_id>/comments com o token do segundo usuário e `{ "body": "reply", "parent_id": "<raiz>" }`
    - expect: status `201` com `parent_id` igual à raiz
  3. POST /videos/<public_id>/comments com o token do dono e `{ "body": "reply to reply", "parent_id": "<id da resposta>" }`
    - expect: status `201` com `parent_id` igual à raiz
  4. GET /videos/<public_id>/comments
    - expect: a raiz tem `reply_count: 2`
  5. GET /videos/<public_id>
    - expect: `comment_count` igual a `3`

#### 1.3. corpo-invalido-e-pai-de-outro-video

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. POST /videos/<public_id>/comments com o token do segundo usuário e `{ "body": "   " }`
    - expect: status `400` com `error: "VALIDATION_ERROR"`
  2. POST com `body` de 2.001 caracteres
    - expect: status `400` com `error: "VALIDATION_ERROR"`
  3. Criar um comentário no segundo vídeo; POST /videos/<public_id>/comments com `{ "body": "x", "parent_id": "<id do comentário do segundo vídeo>" }`
    - expect: status `404` com `error: "COMMENT_NOT_FOUND"`

#### 1.4. nao-pronto-409-e-rascunho-404

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. `seedVideo` insere um vídeo `published` com `processing_status = 'processing'` e um vídeo `ready` em `draft`, ambos do dono
  2. POST /videos/<public_id em processamento>/comments com o token do segundo usuário e `{ "body": "x" }`
    - expect: status `409` com `error: "VIDEO_NOT_READY"`
  3. POST /videos/<public_id do rascunho>/comments com o mesmo token
    - expect: status `404` com `error: "VIDEO_NOT_FOUND"`

#### 1.5. throttle-por-usuario

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. POST /videos/<public_id>/comments 10 vezes com o token do segundo usuário, alternando `X-Forwarded-For` entre `203.0.113.7` e `198.51.100.9`
    - expect: as 10 respostas com status `201`
  2. 11ª chamada com o mesmo token e `X-Forwarded-For: 192.0.2.44`
    - expect: status `429`
  3. POST com o token do dono
    - expect: status `201` (o limite é por usuário)

### 2. Listar comentários e respostas

**Setup:** mesmo app e reset do grupo 1; o segundo usuário cria 3 comentários raiz em sequência (A, B, C) no vídeo publicado; o dono cria 2 respostas (R1, R2) em A.

#### 2.1. raizes-mais-novas-primeiro-paginadas

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. GET /videos/<public_id>/comments?limit=2 sem `Authorization`
    - expect: status `200` com `items` = [C, B], cada um com `my_reaction: null`, e `next_cursor` não nulo
  2. GET /videos/<public_id>/comments?limit=2&cursor=<next_cursor>
    - expect: status `200` com `items` = [A] e `next_cursor: null`
  3. GET /videos/<public_id>/comments?cursor=abc!
    - expect: status `400` com `error: "VALIDATION_ERROR"`

#### 2.2. respostas-mais-antigas-primeiro

**Covers AC:** #7
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. GET /comments/<id de A>/replies sem `Authorization`
    - expect: status `200` com `items` = [R1, R2], ambos com `parent_id` igual a A
  2. GET /comments/<id de R1>/replies
    - expect: status `404` com `error: "COMMENT_NOT_FOUND"`
