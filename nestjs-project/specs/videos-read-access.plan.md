---
subproject: backend
runner: jest+supertest
scope: phase-04-channel-management
si: SI-04.4
target_file: test/videos-read-access.e2e-spec.ts
---

# GET /videos/:id and GET /videos/:id/stream — Read Access Test Plan

## Application Overview

Na Fase 04 o rascunho passa a ser privado: `GET /videos/:id` e `GET /videos/:id/stream` continuam públicos para vídeos publicados (públicos ou não listados, acessíveis pelo link), mas um vídeo em `draft` só é visível para o dono — qualquer outro chamador recebe `404 VIDEO_NOT_FOUND`, sem revelar que o vídeo existe. As rotas aceitam token opcional: token válido identifica o dono; token ausente, inválido ou expirado é tratado como anônimo. `GET /videos/:id` devolve o formato completo `VideoDetail`.

## Test Scenarios

### 1. Rascunho é privado

**Setup:** `beforeAll` cria o app via `createVideosApp`; `beforeEach` chama `resetVideosState`; helper `createConfirmedUser` cria o dono e um segundo usuário (tokens); `seedVideo` insere diretamente um vídeo `ready` do canal do dono com `publication_status = 'draft'`, `video_key` e `thumbnail_key` (objeto JPEG gravado em `thumbnails/…` via `StorageService`).

#### 1.1. rascunho-retorna-404-para-anonimo-e-outro-usuario

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. GET /videos/<public_id> sem `Authorization`
    - expect: status `404` com `error: "VIDEO_NOT_FOUND"`
  2. GET /videos/<public_id> com o token do segundo usuário
    - expect: status `404` com `error: "VIDEO_NOT_FOUND"`

#### 1.2. dono-ve-o-proprio-rascunho

**Covers AC:** #2, #6
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. GET /videos/<public_id> com o token do dono
    - expect: status `200` com `publication_status: "draft"`
    - expect: body contém `public_id`, `title`, `description`, `category`, `file_name`, `processing_status`, `publication_status`, `visibility`, `published_at`, `duration_seconds`, `width`, `height`, `thumbnail_url`, `created_at`
    - expect: body não contém `id`, `channel_id`, `upload_id`, `original_key`, `video_key`, `thumbnail_key`

#### 1.3. stream-de-rascunho-so-para-o-dono

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. GET /videos/<public_id>/stream sem token
    - expect: status `404` com `error: "VIDEO_NOT_FOUND"`
  2. GET /videos/<public_id>/stream com o token do dono
    - expect: status `200` com `url` e `expires_at`

### 2. Vídeo publicado é acessível pelo link

**Setup:** mesmo da seção 1, mas o `seedVideo` grava `publication_status = 'published'` e `published_at`.

#### 2.1. publicado-nao-listado-acessivel-sem-token

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. Seed com `visibility = 'unlisted'`; GET /videos/<public_id> sem `Authorization`
    - expect: status `200` com `visibility: "unlisted"` e `publication_status: "published"`

#### 2.2. token-expirado-em-video-publicado-e-tratado-como-anonimo

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. Seed com `visibility = 'public'`; GET /videos/<public_id> com um access token JWT expirado (assinado com o mesmo segredo, `exp` no passado)
    - expect: status `200` (não `401`)
