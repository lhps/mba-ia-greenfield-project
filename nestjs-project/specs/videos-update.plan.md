---
subproject: backend
runner: jest+supertest
scope: phase-04-channel-management
si: SI-04.5
target_file: test/videos-update.e2e-spec.ts
---

# PATCH /videos/:id — Test Plan

## Application Overview

`PATCH /videos/:id` permite ao dono editar título, descrição, categoria (pelo `slug`) e visibilidade de um vídeo, de qualquer tela (inclusive do painel). Todos os campos são opcionais, mas pelo menos um é obrigatório. Uma categoria inexistente é `400 INVALID_CATEGORY`; limpar a categoria de um vídeo publicado é `409 PUBLISH_REQUIREMENTS_NOT_MET`. Responde `200` com `VideoDetail`.

## Test Scenarios

### 1. Dono edita o vídeo

**Setup:** `beforeAll` cria o app via `createVideosApp`; `beforeEach` chama `resetVideosState`; `createConfirmedUser` cria o dono e um segundo usuário; `seedVideo` insere um vídeo `ready` em `draft` do canal do dono (categorias vêm da migration de seed).

#### 1.1. edita-titulo-e-categoria

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. PATCH /videos/<public_id> com token do dono e body `{ "title": "Novo título", "category": "jogos" }`
    - expect: status `200`
    - expect: `title: "Novo título"` e `category: { slug: "jogos", name: "Jogos" }`
  2. GET /videos/<public_id> com token do dono
    - expect: os mesmos valores persistidos

#### 1.2. muda-visibilidade-sem-publicar

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. PATCH /videos/<public_id> com `{ "visibility": "unlisted" }`
    - expect: status `200` com `visibility: "unlisted"` e `publication_status: "draft"`

### 2. Validação e regras de negócio

**Setup:** mesmo da seção 1.

#### 2.1. body-vazio-ou-titulo-longo-retorna-400

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. PATCH /videos/<public_id> com `{}`
    - expect: status `400` com `error: "VALIDATION_ERROR"`
  2. PATCH /videos/<public_id> com `title` de 101 caracteres
    - expect: status `400` com `error: "VALIDATION_ERROR"`

#### 2.2. categoria-inexistente-retorna-400

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. PATCH /videos/<public_id> com `{ "category": "inexistente" }`
    - expect: status `400` com `error: "INVALID_CATEGORY"`

#### 2.3. limpar-categoria-de-video-publicado-retorna-409

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. Seed de vídeo `published` com categoria `jogos`; PATCH /videos/<public_id> com `{ "category": null }`
    - expect: status `409` com `error: "PUBLISH_REQUIREMENTS_NOT_MET"`
    - expect: a categoria continua `jogos` (GET /videos/<public_id>)

### 3. Autorização

**Setup:** mesmo da seção 1.

#### 3.1. outro-usuario-403-sem-token-401

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. PATCH /videos/<public_id> com token do segundo usuário e `{ "title": "x" }`
    - expect: status `403` com `error: "VIDEO_ACCESS_DENIED"`
  2. PATCH /videos/<public_id> sem `Authorization`
    - expect: status `401`
