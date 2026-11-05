---
subproject: backend
runner: jest+supertest
scope: phase-04-channel-management
si: SI-04.7
target_file: test/videos-thumbnail.e2e-spec.ts
---

# PUT /videos/:id/thumbnail — Test Plan

## Application Overview

`PUT /videos/:id/thumbnail` recebe uma imagem (`multipart/form-data`, campo `file`, ≤ 2 MB, JPEG/PNG/WebP) do dono, re-codifica com FFmpeg para JPEG 1280×720 (16:9, sem EXIF), grava sob uma nova chave versionada no prefixo público `thumbnails/` e apaga a anterior. Responde `200 { thumbnail_url }`. Arquivo grande é `413 THUMBNAIL_TOO_LARGE`; conteúdo inválido ou corrompido é `400 INVALID_THUMBNAIL`.

## Test Scenarios

### 1. Dono troca a thumbnail

**Setup:** `beforeAll` cria o app via `createVideosApp` (bucket de teste com a policy de leitura pública em `thumbnails/*` aplicada pelo bootstrap); `beforeEach` chama `resetVideosState`; `createConfirmedUser` cria o dono e um segundo usuário; `seedVideo` insere um vídeo `ready` do dono; fixtures `test/fixtures/thumbnail.png` (não 16:9) e `test/fixtures/thumbnail-invalid.jpg`.

#### 1.1. png-valido-vira-jpeg-1280x720-publico

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. PUT /videos/<public_id>/thumbnail com token do dono e `file = thumbnail.png`
    - expect: status `200` com `thumbnail_url` contendo `/thumbnails/` e terminando em `.jpg`
  2. GET anônimo de `thumbnail_url` (cliente HTTP direto ao storage, mantendo o Host assinado/público)
    - expect: status `200` com `content-type: image/jpeg`
    - expect: a imagem tem 1280×720 (verificado via ffprobe ou leitura do cabeçalho JPEG)

#### 1.2. segundo-upload-gera-nova-url-e-apaga-a-anterior

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. Fazer o upload duas vezes, guardando U1 e U2
    - expect: U1 ≠ U2
  2. GET anônimo de U1
    - expect: não retorna `200` (objeto removido)

### 2. Validação do arquivo

**Setup:** mesmo da seção 1.

#### 2.1. arquivo-maior-que-2mb-retorna-413

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. PUT /videos/<public_id>/thumbnail com um buffer de 3 MB como `file`
    - expect: status `413` com `error: "THUMBNAIL_TOO_LARGE"`

#### 2.2. conteudo-invalido-ou-corrompido-retorna-400

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. PUT com um arquivo de texto enviado como `capa.jpg`
    - expect: status `400` com `error: "INVALID_THUMBNAIL"`
  2. PUT com `thumbnail-invalid.jpg` (assinatura JPEG, corpo truncado)
    - expect: status `400` com `error: "INVALID_THUMBNAIL"`
  3. GET /videos/<public_id> com token do dono
    - expect: `thumbnail_url` inalterado

### 3. Autorização

**Setup:** mesmo da seção 1.

#### 3.1. outro-usuario-retorna-403

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. PUT /videos/<public_id>/thumbnail com token do segundo usuário e `file = thumbnail.png`
    - expect: status `403` com `error: "VIDEO_ACCESS_DENIED"`
