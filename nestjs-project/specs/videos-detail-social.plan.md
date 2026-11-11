---
subproject: backend
runner: jest+supertest
scope: phase-06-social-interactions
si: SI-06.7
target_file: test/videos-detail-social.e2e-spec.ts
---

# GET /videos/:id — Counts and Viewer State Test Plan

## Application Overview

A leitura da página de exibição passa a trazer, numa chamada só, `like_count`, `comment_count`, o `my_reaction` do espectador e, no canal, `subscriber_count` e `is_subscribed`. Anônimos recebem `my_reaction: null` e `channel.is_subscribed: false`. Toda resposta `VideoDetail` (inclusive `PATCH /videos/:id` do dono) carrega os mesmos campos.

## Test Scenarios

### 1. Campos sociais no VideoDetail

**Setup:** `beforeAll` cria o app via `createVideosApp`; `beforeEach` chama `resetVideosState`; `createConfirmedUser` cria o dono e um segundo usuário; `seedVideo` insere um vídeo `ready`, `published`, `public` do dono.

#### 1.1. anonimo-recebe-contagens-e-estado-vazio

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. GET /videos/<public_id> sem `Authorization`
    - expect: status `200` com `like_count: 0`, `comment_count: 0`, `my_reaction: null`
    - expect: `channel.subscriber_count: 0` e `channel.is_subscribed: false`

#### 1.2. reacao-do-espectador-refletida

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. PUT /videos/<public_id>/reaction com o token do segundo usuário e `{ "value": "like" }`
    - expect: status `200`
  2. GET /videos/<public_id> com o mesmo token
    - expect: `my_reaction: "like"` e `like_count: 1`

#### 1.3. inscricao-do-espectador-refletida

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. PUT /channels/<nickname do dono>/subscription com o token do segundo usuário
    - expect: status `200`
  2. GET /videos/<public_id> com o mesmo token
    - expect: `channel.is_subscribed: true` e `channel.subscriber_count: 1`

#### 1.4. patch-do-dono-traz-mesmos-campos

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. PATCH /videos/<public_id> com o token do dono e `{ "title": "New title" }`
    - expect: status `200` com `like_count`, `comment_count`, `my_reaction`, `channel.subscriber_count` e `channel.is_subscribed` presentes
