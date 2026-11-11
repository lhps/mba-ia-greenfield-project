---
subproject: backend
runner: jest+supertest
scope: phase-06-social-interactions
si: SI-06.6
target_file: test/channels-subscription.e2e-spec.ts
---

# PUT/DELETE /channels/:nickname/subscription and GET /channels/:nickname — Subscriptions Test Plan

## Application Overview

Usuários autenticados seguem e deixam de seguir canais com `PUT` e `DELETE /channels/:nickname/subscription`, ambos idempotentes e respondendo `200` com `{ subscriber_count, is_subscribed }`. Seguir o próprio canal é rejeitado com `409 SELF_SUBSCRIPTION_NOT_ALLOWED`; nickname desconhecido → `404 CHANNEL_NOT_FOUND`. O cabeçalho público `GET /channels/:nickname` passa a trazer `subscriber_count` e `is_subscribed` (autenticação opcional: anônimo ou token expirado → `false`).

## Test Scenarios

### 1. Seguir e deixar de seguir

**Setup:** `beforeAll` cria o app via `createVideosApp`; `beforeEach` chama `resetVideosState`; `createConfirmedUser` cria o dono do canal e um segundo usuário (tokens; o nickname do canal do dono é lido de GET /channels/me).

#### 1.1. seguir-idempotente

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. PUT /channels/<nickname do dono>/subscription com o token do segundo usuário
    - expect: status `200` com `{ "subscriber_count": 1, "is_subscribed": true }`
  2. Repetir a mesma chamada
    - expect: status `200` com o mesmo corpo

#### 1.2. deixar-de-seguir-idempotente

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. PUT /channels/<nickname do dono>/subscription com o token do segundo usuário
    - expect: status `200` com `subscriber_count: 1`
  2. DELETE /channels/<nickname do dono>/subscription com o mesmo token
    - expect: status `200` com `{ "subscriber_count": 0, "is_subscribed": false }`
  3. Repetir o DELETE
    - expect: status `200` com `{ "subscriber_count": 0, "is_subscribed": false }`

#### 1.3. proprio-canal-inexistente-e-sem-token

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. PUT /channels/<nickname do dono>/subscription com o token do dono
    - expect: status `409` com `error: "SELF_SUBSCRIPTION_NOT_ALLOWED"`
  2. PUT /channels/canal_que_nao_existe/subscription com o token do segundo usuário
    - expect: status `404` com `error: "CHANNEL_NOT_FOUND"`
  3. PUT /channels/<nickname do dono>/subscription sem `Authorization`
    - expect: status `401`

### 2. Cabeçalho público do canal

**Setup:** mesmo app e reset do grupo 1; o segundo usuário segue o canal do dono.

#### 2.1. cabecalho-com-estado-do-espectador

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. GET /channels/<nickname do dono> sem `Authorization`
    - expect: status `200` com `subscriber_count: 1` e `is_subscribed: false`
  2. GET /channels/<nickname do dono> com o token do segundo usuário
    - expect: status `200` com `is_subscribed: true`
  3. GET /channels/<nickname do dono> com um token expirado (JWT assinado com `exp` no passado)
    - expect: status `200` com `is_subscribed: false`
