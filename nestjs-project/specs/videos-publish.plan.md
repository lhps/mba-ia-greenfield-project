---
subproject: backend
runner: jest+supertest
scope: phase-04-channel-management
si: SI-04.6
target_file: test/videos-publish.e2e-spec.ts
---

# POST /videos/:id/publish and /unpublish — Test Plan

## Application Overview

O fluxo rascunho → publicação: `POST /videos/:id/publish` publica um vídeo do dono que já está `ready` e tem categoria, gravando `published_at` só na primeira publicação; `POST /videos/:id/unpublish` volta para `draft` mantendo `published_at`. Ambos são idempotentes (chamar no estado já atingido devolve `200` sem mudança) e respondem `VideoDetail`.

## Test Scenarios

### 1. Publicar e despublicar

**Setup:** `beforeAll` cria o app via `createVideosApp`; `beforeEach` chama `resetVideosState`; `createConfirmedUser` cria o dono e um segundo usuário; `seedVideo` insere um vídeo do canal do dono em `draft`, com `processing_status` e categoria definidos por cenário.

#### 1.1. publica-video-pronto-com-categoria

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. Seed `ready` com categoria `jogos`; POST /videos/<public_id>/publish com token do dono
    - expect: status `200` com `publication_status: "published"` e `published_at` ISO-8601 não nulo

#### 1.2. despublicar-e-republicar-mantem-published-at

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. Seed `ready` com categoria; POST /videos/<public_id>/publish e guardar `published_at` como T1
  2. POST /videos/<public_id>/unpublish
    - expect: status `200` com `publication_status: "draft"` e `published_at` igual a T1
  3. POST /videos/<public_id>/publish
    - expect: status `200` com `publication_status: "published"` e `published_at` igual a T1

#### 1.3. chamadas-repetidas-sao-idempotentes

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. Seed `ready` com categoria; publicar e publicar de novo
    - expect: a segunda chamada retorna `200` com o mesmo `publication_status` e `published_at`
  2. Despublicar e despublicar de novo
    - expect: a segunda chamada retorna `200` com `publication_status: "draft"` sem mudança

### 2. Pré-condições

**Setup:** mesmo da seção 1.

#### 2.1. video-em-processamento-retorna-409

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. Seed `processing` com categoria; POST /videos/<public_id>/publish
    - expect: status `409` com `error: "VIDEO_NOT_READY"`

#### 2.2. sem-categoria-retorna-409

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. Seed `ready` sem categoria; POST /videos/<public_id>/publish
    - expect: status `409` com `error: "PUBLISH_REQUIREMENTS_NOT_MET"`
    - expect: o vídeo continua em `draft`

### 3. Autorização

**Setup:** mesmo da seção 1.

#### 3.1. outro-usuario-retorna-403

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. Seed `ready` com categoria; POST /videos/<public_id>/publish com token do segundo usuário
    - expect: status `403` com `error: "VIDEO_ACCESS_DENIED"`
