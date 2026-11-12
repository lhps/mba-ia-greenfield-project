---
subproject: backend
runner: jest+supertest
scope: phase-06-social-interactions
si: SI-06.8
target_file: test/me-subscriptions.e2e-spec.ts
---

# GET /me/subscriptions and GET /me/subscriptions/videos — Subscribed-channels Area Test Plan

## Application Overview

A área de canais seguidos tem duas leituras autenticadas. `GET /me/subscriptions` lista os canais seguidos pelo chamador, da inscrição mais recente para a mais antiga (`nickname`, `name`, `subscriber_count`, `subscribed_at`), com paginação keyset. `GET /me/subscriptions/videos` devolve um `PublicVideoPage` com os vídeos publicados, públicos e prontos desses canais, do mais novo para o mais antigo (`published_at, public_id`) — mesmo formato e cursor da listagem pública do canal. Quem não segue ninguém recebe listas vazias.

## Test Scenarios

### 1. Canais seguidos e feed

**Setup:** `beforeAll` cria o app via `createVideosApp`; `beforeEach` chama `resetVideosState`; `createConfirmedUser` cria o espectador e os donos A, B e C; o espectador segue A e depois B (nessa ordem) via PUT /channels/:nickname/subscription; `seedVideo` insere vídeos `ready`/`published`/`public` em A e B com `published_at` distintos, mais em A um rascunho, um `unlisted` e um em `processing`, e em C um vídeo público.

#### 1.1. canais-seguidos-ordenados-e-paginados

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. GET /me/subscriptions?limit=1 com o token do espectador
    - expect: status `200` com `items` = [B] contendo `nickname`, `name`, `subscriber_count: 1`, `subscribed_at`, e `next_cursor` não nulo
  2. GET /me/subscriptions?limit=1&cursor=<next_cursor>
    - expect: status `200` com `items` = [A] e `next_cursor: null`

#### 1.2. feed-so-publicos-prontos-dos-seguidos

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. GET /me/subscriptions/videos com o token do espectador
    - expect: status `200` com `items` contendo só os vídeos públicos, publicados e prontos de A e B, ordenados por `published_at` decrescente
    - expect: o rascunho, o `unlisted`, o vídeo em `processing` e o vídeo de C não aparecem
    - expect: cada item tem `public_id`, `title`, `thumbnail_url`, `duration_seconds`, `published_at`, `view_count`

### 2. Casos vazios e erros

**Setup:** mesmo app e reset do grupo 1; um usuário extra sem inscrições.

#### 2.1. sem-inscricoes-listas-vazias

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. GET /me/subscriptions com o token do usuário sem inscrições
    - expect: status `200` com `{ "items": [], "next_cursor": null }`
  2. GET /me/subscriptions/videos com o mesmo token
    - expect: status `200` com `{ "items": [], "next_cursor": null }`

#### 2.2. sem-token-401-e-cursor-invalido-400

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. GET /me/subscriptions e GET /me/subscriptions/videos sem `Authorization`
    - expect: ambos com status `401`
  2. GET /me/subscriptions?cursor=abc! e GET /me/subscriptions/videos?cursor=abc! com o token do espectador
    - expect: ambos com status `400` e `error: "VALIDATION_ERROR"`
