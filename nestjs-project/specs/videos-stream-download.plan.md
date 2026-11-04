---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.12
target_file: test/videos-stream-download.e2e-spec.ts
---

# GET /videos/:id/stream e GET /videos/:id/download — Test Plan

## Application Overview

Reprodução e download entregues por URLs presignadas de curta duração para o MP4 processado (faststart): o storage serve os bytes com suporte nativo a HTTP `Range` (seek sem baixar o arquivo inteiro) e API/BFF nunca fazem streaming de mídia. `GET /videos/:id/stream` é público (aberto pela URL única na Fase 03) e só funciona para vídeos `ready`. `GET /videos/:id/download` é exclusivo do dono e devolve uma URL do mesmo objeto processado com `Content-Disposition: attachment`.

## Test Scenarios

### 1. Streaming por URL única

**Setup:** `beforeAll` cria o app a partir de `AppModule` reproduzindo a config global do `main.ts`; `beforeEach` trunca `videos`, `channels`, `users` (e tabelas de tokens) e esvazia o bucket de teste; helpers criam usuário A (dono) e B confirmados com canais e tokens via `POST /auth/login`; helper `seedReadyVideo()` insere linha `ready` do usuário A com `file_name = 'clip.mov'` e grava `test/fixtures/sample.mp4` em `video_key` via `StorageService.uploadFile`; `seedProcessingVideo()` insere linha `processing` sem `video_key`. Requisições às URLs presignadas reescrevem o host público para o endpoint interno no cliente de teste.

#### 1.1. stream-anonimo-de-video-pronto-suporta-range

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. GET /videos/<public_id>/stream sem header `Authorization`
    - expect: status `200` com `url` (começando com `S3_PUBLIC_ENDPOINT`) e `expires_at` futuro
  2. GET na `url` com header `Range: bytes=0-1023`
    - expect: status `206`, `Content-Type: video/mp4`, corpo com 1024 bytes

#### 1.2. stream-de-video-nao-pronto-retorna-409

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. Seed de vídeo `processing`; GET /videos/<public_id>/stream
    - expect: status `409` com `error: "VIDEO_NOT_READY"`

### 2. Download pelo dono

**Setup:** mesmo da seção 1.

#### 2.1. dono-baixa-mp4-processado-como-anexo

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. GET /videos/<public_id>/download com token do usuário A
    - expect: status `200` com `url` e `expires_at` futuro
  2. GET na `url`
    - expect: status `200` e header `Content-Disposition: attachment; filename="clip.mp4"`
    - expect: corpo idêntico ao objeto em `video_key` (mesmo arquivo do streaming)

#### 2.2. download-exige-dono-e-autenticacao

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. GET /videos/<public_id>/download com token do usuário B
    - expect: status `403` com `error: "VIDEO_ACCESS_DENIED"`
  2. GET /videos/<public_id>/download sem header `Authorization`
    - expect: status `401`

#### 2.3. id-desconhecido-retorna-404-em-ambos

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. GET /videos/AAAAAAAAAAA/stream sem token
    - expect: status `404` com `error: "VIDEO_NOT_FOUND"`
  2. GET /videos/AAAAAAAAAAA/download com token do usuário A
    - expect: status `404` com `error: "VIDEO_NOT_FOUND"`
