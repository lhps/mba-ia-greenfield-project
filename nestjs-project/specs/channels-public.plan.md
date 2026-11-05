---
subproject: backend
runner: jest+supertest
scope: phase-04-channel-management
si: SI-04.10
target_file: test/channels-public.e2e-spec.ts
---

# GET /channels/:nickname and GET /channels/:nickname/videos — Test Plan

## Application Overview

A página pública do canal: `GET /channels/:nickname` devolve `nickname`, `name`, `description` e `created_at`; `GET /channels/:nickname/videos` lista apenas vídeos publicados, públicos e prontos, do `published_at` mais recente para o mais antigo, com paginação por cursor opaco (`next_cursor`, `limit` ≤ 50). Ambos são públicos. `/channels/me` continua sendo o perfil autenticado.

## Test Scenarios

### 1. Informações do canal

**Setup:** `beforeAll` cria o app via `createVideosApp`; `beforeEach` chama `resetVideosState`; `createConfirmedUser` cria o dono (nickname conhecido).

#### 1.1. canal-existente-e-inexistente

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. GET /channels/<nickname> sem token
    - expect: status `200` com `nickname`, `name`, `description`, `created_at`
  2. GET /channels/nao_existe
    - expect: status `404` com `error: "CHANNEL_NOT_FOUND"`

#### 1.2. rota-me-continua-sendo-o-perfil-autenticado

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. GET /channels/me sem token
    - expect: status `401` (não `404 CHANNEL_NOT_FOUND`)
  2. GET /channels/me com token do dono
    - expect: status `200` com o `nickname` do dono

### 2. Listagem pública de vídeos

**Setup:** mesmo da seção 1; `seedVideo` insere vídeos do dono com combinações de `publication_status`, `visibility`, `processing_status` e `published_at` distintos.

#### 2.1. so-publicados-publicos-e-prontos

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. Seed: 2 `published`/`public`/`ready`, 1 `draft`, 1 `published`/`unlisted`, 1 `published`/`public`/`processing`
  2. GET /channels/<nickname>/videos sem token
    - expect: status `200` com exatamente os 2 vídeos públicos prontos, `published_at` decrescente
  3. A mesma chamada com o token do dono
    - expect: o mesmo resultado (rascunho e não listado continuam fora)

#### 2.2. cursor-percorre-todas-as-paginas

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. Seed de 5 vídeos publicados/públicos/prontos; GET /channels/<nickname>/videos?limit=2
    - expect: 2 itens e `next_cursor` não nulo
  2. Repetir com `cursor=<next_cursor>` até `next_cursor: null`
    - expect: páginas de 2, 2 e 1 itens, sem `public_id` repetido, totalizando os 5

#### 2.3. cursor-malformado-retorna-400

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. GET /channels/<nickname>/videos?cursor=garbage
    - expect: status `400` com `error: "VALIDATION_ERROR"`
