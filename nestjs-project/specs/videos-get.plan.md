---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.11
target_file: test/videos-get.e2e-spec.ts
---

# GET /videos/:id — Test Plan

## Application Overview

`GET /videos/:id` resolve um vídeo pela sua URL única (`public_id`, 11 chars) e devolve o estado de processamento e os metadados extraídos (`duration_seconds`, `width`, `height`) mais um `thumbnail_url` presignado. É público (`@Public()`) — na Fase 03 qualquer pessoa com o link vê o vídeo, mesmo em rascunho. Nunca expõe o `id` interno, `channel_id`, `upload_id` ou chaves de storage.

## Test Scenarios

### 1. Consultar vídeo pela URL única

**Setup:** `beforeAll` cria o app a partir de `AppModule` reproduzindo a config global do `main.ts`; `beforeEach` trunca `videos`, `channels`, `users` (e tabelas de tokens) e esvazia o bucket de teste; helper cria usuário confirmado + canal; helper `seedVideo(state)` insere diretamente uma linha em `videos` — para `ready`: `processing_status = 'ready'`, metadados (`duration_seconds = 2.0`, `width = 320`, `height = 240`), `video_key`/`thumbnail_key` preenchidos e um JPEG pequeno gravado em `thumbnail_key` via `StorageService`; para `processing`: metadados e chaves nulos.

#### 1.1. video-pronto-retorna-metadados-e-thumbnail

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. Seed de um vídeo `ready`
  2. GET /videos/<public_id> sem header `Authorization`
    - expect: status `200`
    - expect: body com `public_id`, `file_name`, `processing_status: "ready"`, `publication_status: "draft"`, `duration_seconds: 2`, `width: 320`, `height: 240`, `created_at` ISO-8601
    - expect: `thumbnail_url` começa com o valor de `S3_PUBLIC_ENDPOINT`

#### 1.2. video-em-processamento-retorna-metadados-nulos

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. Seed de um vídeo `processing`
  2. GET /videos/<public_id> sem token
    - expect: status `200` com `processing_status: "processing"`
    - expect: `duration_seconds`, `width`, `height` e `thumbnail_url` são `null`

#### 1.3. resposta-nao-expoe-campos-internos

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. Seed de um vídeo `ready`; GET /videos/<public_id>
    - expect: body não contém as chaves `id`, `channel_id`, `upload_id`, `original_key`, `video_key`, `thumbnail_key`, `failure_reason`

### 2. Vídeo inexistente

**Setup:** mesmo da seção 1.

#### 2.1. id-malformado-ou-desconhecido-retorna-404

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. GET /videos/abc
    - expect: status `404` com `error: "VIDEO_NOT_FOUND"`
  2. GET /videos/AAAAAAAAAAA (11 chars, inexistente)
    - expect: status `404` com `error: "VIDEO_NOT_FOUND"`
