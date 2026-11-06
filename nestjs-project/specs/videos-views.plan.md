---
subproject: backend
runner: jest+supertest
scope: phase-05-video-watch
si: SI-05.4
target_file: test/videos-views.e2e-spec.ts
---

# POST /videos/:id/views — View Counting Test Plan

## Application Overview

O player chama `POST /videos/:id/views` quando a reprodução começa. A API conta a visualização no máximo uma vez por espectador dentro da janela `VIEW_DEDUP_WINDOW_SECONDS` (padrão 24 h), usando Redis `SET NX EX`: o espectador é o id do usuário quando autenticado, senão um hash SHA-256 de IP + User-Agent, onde o IP é a última entrada de `X-Forwarded-For` (`trust proxy` = 1). Visualizações do dono do canal nunca contam. A resposta é sempre `204`; a regra de leitura é a mesma de `GET /videos/:id` (rascunho de terceiros → `404`) e um vídeo que não está `ready` → `409`.

## Test Scenarios

### 1. Contagem e deduplicação

**Setup:** `beforeAll` cria o app via `createVideosApp` (com `trust proxy` = 1); `beforeEach` chama `resetVideosState` e apaga as chaves Redis `views:*`; `createConfirmedUser` cria o dono e um segundo usuário (tokens); `seedVideo` insere um vídeo `ready`, `published`, `public` do dono com `view_count = 0`. A contagem é lida com GET /videos/<public_id>.

#### 1.1. anonimo-conta-uma-visualizacao

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-06T17:55:55Z

**Steps:**
  1. POST /videos/<public_id>/views sem `Authorization`, com `X-Forwarded-For: 203.0.113.7` e `User-Agent: e2e-agent`
    - expect: status `204` sem corpo
  2. GET /videos/<public_id>
    - expect: `view_count` igual a `1`

#### 1.2. repeticao-mesmo-ip-e-ua-nao-conta

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-06T17:55:55Z

**Steps:**
  1. POST /videos/<public_id>/views duas vezes sem token, ambas com `X-Forwarded-For: 203.0.113.7` e `User-Agent: e2e-agent`
    - expect: as duas respostas com status `204`
  2. GET /videos/<public_id>
    - expect: `view_count` igual a `1`

#### 1.3. ips-diferentes-contam-separadamente

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-06T17:55:55Z

**Steps:**
  1. POST /videos/<public_id>/views sem token com `X-Forwarded-For: 203.0.113.7`
    - expect: status `204`
  2. POST /videos/<public_id>/views sem token com `X-Forwarded-For: 198.51.100.9` (mesmo `User-Agent`)
    - expect: status `204`
  3. GET /videos/<public_id>
    - expect: `view_count` igual a `2`

#### 1.4. usuario-autenticado-deduplicado-entre-ips

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-06T17:55:55Z

**Steps:**
  1. POST /videos/<public_id>/views com o token do segundo usuário e `X-Forwarded-For: 203.0.113.7`
    - expect: status `204`
  2. POST /videos/<public_id>/views com o token do segundo usuário e `X-Forwarded-For: 198.51.100.9`
    - expect: status `204`
  3. GET /videos/<public_id>
    - expect: `view_count` igual a `1`

#### 1.5. visualizacao-do-dono-nao-conta

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-11-06T17:55:55Z

**Steps:**
  1. POST /videos/<public_id>/views com o token do dono
    - expect: status `204`
  2. GET /videos/<public_id>
    - expect: `view_count` igual a `0`

### 2. Regras de acesso e prontidão

**Setup:** mesmo app e reset do grupo 1; `seedVideo` insere (a) um vídeo `ready` em `draft` e (b) um vídeo `published` com `processing_status = 'processing'`, ambos do dono.

#### 2.1. rascunho-404-e-nao-pronto-409

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-11-06T17:55:55Z

**Steps:**
  1. POST /videos/<public_id do rascunho>/views sem `Authorization`
    - expect: status `404` com `error: "VIDEO_NOT_FOUND"`
  2. POST /videos/<public_id do vídeo em processamento>/views sem `Authorization`
    - expect: status `409` com `error: "VIDEO_NOT_READY"`
  3. Consultar `view_count` dos dois vídeos no banco
    - expect: ambos continuam `0`
