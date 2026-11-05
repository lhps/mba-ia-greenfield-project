---
subproject: backend
runner: jest+supertest
scope: phase-04-channel-management
si: SI-04.8
target_file: test/channels-me-videos.e2e-spec.ts
---

# GET /channels/me/videos — Test Plan

## Application Overview

`GET /channels/me/videos` alimenta o painel de gerenciamento: lista todos os vídeos do canal do usuário autenticado (rascunhos, publicados, em processamento e com falha), do mais novo para o mais antigo, com thumbnail, título, contadores (`view_count`, `like_count`, `comment_count`, sempre `0` na Fase 04), status, visibilidade e `published_at`. Paginação por página (`page`, `per_page` ≤ 50) com `total`.

## Test Scenarios

### 1. Listagem do painel

**Setup:** `beforeAll` cria o app via `createVideosApp`; `beforeEach` chama `resetVideosState`; `createConfirmedUser` cria o dono e um segundo usuário; `seedVideo` insere vídeos com `created_at` distintos por cenário.

#### 1.1. lista-todos-os-videos-do-dono-mais-novo-primeiro

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. Seed de 4 vídeos do dono: `draft`/`ready`, `published`/`ready`, `processing`, `failed`, com `created_at` crescentes
  2. GET /channels/me/videos com token do dono
    - expect: status `200` com 4 `items` ordenados por `created_at` decrescente
    - expect: cada item tem `view_count: 0`, `like_count: 0`, `comment_count: 0`, além de `public_id`, `title`, `thumbnail_url`, `processing_status`, `publication_status`, `visibility`, `published_at`, `created_at`, `duration_seconds`

#### 1.2. paginacao-por-pagina-com-total

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. Seed de 3 vídeos do dono; GET /channels/me/videos?page=2&per_page=1
    - expect: status `200` com 1 item (o segundo mais novo), `page: 2`, `per_page: 1`, `total: 3`

#### 1.3. videos-de-outros-canais-nao-aparecem

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. Seed de 1 vídeo do dono e 2 do segundo usuário; GET /channels/me/videos com token do dono
    - expect: `total: 1` e só o `public_id` do dono

### 2. Validação e autenticação

**Setup:** mesmo da seção 1.

#### 2.1. per-page-invalido-400-sem-token-401

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. GET /channels/me/videos?per_page=51 com token do dono
    - expect: status `400` com `error: "VALIDATION_ERROR"`
  2. GET /channels/me/videos sem `Authorization`
    - expect: status `401`
