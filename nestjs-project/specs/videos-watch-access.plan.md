---
subproject: backend
runner: jest+supertest
scope: phase-05-video-watch
si: SI-05.6
target_file: test/videos-watch-access.e2e-spec.ts
---

# Watch-page Routes — Access Verification Test Plan

## Application Overview

A página de visualização depende de regras já decididas e aqui apenas verificadas: qualquer pessoa assiste vídeos publicados sem login (`GET /videos/:id`, `GET /videos/:id/stream`); vídeos não listados abrem pelo link mas nunca aparecem em listagens (sugestões e página pública do canal); o download continua exclusivo do dono do canal (`GET /videos/:id/download` — sem token `401`, outro usuário `403`, dono `200`).

## Test Scenarios

### 1. Acesso anônimo e não listados

**Setup:** `beforeAll` cria o app via `createVideosApp`; `beforeEach` chama `resetVideosState`; `createConfirmedUser` cria o dono e um segundo usuário (tokens); `seedVideo` insere no canal do dono um vídeo `ready` + `published` + `public` (com `video_key`) e um `ready` + `published` + `unlisted` na mesma categoria.

#### 1.1. publicado-assistivel-sem-login

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-06T17:55:55Z

**Steps:**
  1. GET /videos/<public_id público> sem `Authorization`
    - expect: status `200`
  2. GET /videos/<public_id público>/stream sem `Authorization`
    - expect: status `200` com `url` presignada

#### 1.2. nao-listado-por-link-fora-das-listagens

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-06T17:55:55Z

**Steps:**
  1. GET /videos/<public_id não listado> sem `Authorization`
    - expect: status `200`
  2. GET /videos/<public_id público>/suggestions
    - expect: `items` não contém o vídeo não listado
  3. GET /channels/<nickname do dono>/videos
    - expect: `items` não contém o vídeo não listado

### 2. Download exclusivo do dono

**Setup:** mesmo app e reset do grupo 1.

#### 2.1. download-so-para-o-dono

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-06T17:55:55Z

**Steps:**
  1. GET /videos/<public_id público>/download sem `Authorization`
    - expect: status `401`
  2. GET /videos/<public_id público>/download com o token do segundo usuário
    - expect: status `403` com `error: "VIDEO_ACCESS_DENIED"`
  3. GET /videos/<public_id público>/download com o token do dono
    - expect: status `200` com `url` presignada
