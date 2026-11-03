---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.6
target_file: test/videos-create.e2e-spec.ts
---

# POST /videos — Test Plan

## Application Overview

`POST /videos` inicia o upload de um vídeo: pré-cadastra o vídeo como rascunho (`processing_status: "uploading"`, `publication_status: "draft"`) no canal do usuário autenticado e abre um multipart upload no storage S3-compatível (MinIO). A resposta devolve o `public_id` (11 chars, URL única) e o plano de partes (`part_size`, `part_count`) que o cliente usa para enviar os bytes direto ao storage — a API nunca recebe os bytes do vídeo. Campos do wire em snake_case; `file_size` limitado por `MAX_UPLOAD_BYTES` (10 GiB) e `content_type` restrito à allowlist de MIME de vídeo.

## Test Scenarios

### 1. Pré-cadastrar vídeo como rascunho e iniciar upload

**Setup:** `beforeAll` cria o app a partir de `AppModule` reproduzindo a config global do `main.ts` (`ValidationPipe` com `whitelist`/`forbidNonWhitelisted`/`transform`, `DomainExceptionFilter`, `ValidationExceptionFilter`); `beforeEach` trunca `videos`, `refresh_tokens`, `verification_tokens`, `channels`, `users` e esvazia o bucket de teste (`S3_BUCKET` de teste, abortando multipart uploads pendentes); helper cria usuário confirmado + canal e obtém `access_token` via `POST /auth/login`.

#### 1.1. cria-rascunho-e-retorna-plano-de-partes

**Covers AC:** #1, #2
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. POST /videos com `Authorization: Bearer <token do usuário A>` e body `{ "file_name": "clip.mp4", "file_size": 157286400, "content_type": "video/mp4" }`
    - expect: status `201`
    - expect: body contém `public_id` casando `^[A-Za-z0-9_-]{11}$`, `processing_status: "uploading"`, `publication_status: "draft"`, `part_size: 67108864`, `part_count: 3`
    - expect: body não contém `id`, `channel_id`, `upload_id` nem chaves de storage
  2. Consultar a tabela `videos` pelo `public_id` retornado
    - expect: existe uma linha com `channel_id` igual ao canal do usuário A, `file_size = 157286400`, `content_type = 'video/mp4'` e `upload_id` não nulo
  3. Listar multipart uploads do bucket de teste (`ListMultipartUploads`)
    - expect: há um upload em andamento para a chave `videos/<id>/original` com o mesmo `UploadId` gravado na linha

#### 1.2. public-ids-distintos-por-upload

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. POST /videos duas vezes com o mesmo token e o mesmo body válido
    - expect: ambas retornam `201`
    - expect: os dois `public_id` são diferentes entre si

### 2. Validação e autenticação

**Setup:** mesmo da seção 1.

#### 2.1. rejeita-file-size-acima-do-limite

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. POST /videos com token válido e body `{ "file_name": "big.mp4", "file_size": 10737418241, "content_type": "video/mp4" }`
    - expect: status `400`
    - expect: body `{ statusCode: 400, error: "VALIDATION_ERROR", message: [...] }` com mensagem referente a `file_size`
    - expect: nenhuma linha criada em `videos` e nenhum multipart upload aberto

#### 2.2. rejeita-content-type-fora-da-allowlist

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. POST /videos com token válido e body `{ "file_name": "doc.pdf", "file_size": 1024, "content_type": "application/pdf" }`
    - expect: status `400` com `error: "VALIDATION_ERROR"`
    - expect: nenhuma linha criada em `videos`
  2. POST /videos com token válido e body válido acrescido de campo desconhecido `"processing_status": "ready"`
    - expect: status `400` com `error: "VALIDATION_ERROR"` (whitelist + forbidNonWhitelisted)

#### 2.3. exige-autenticacao

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. POST /videos sem header `Authorization` e com body válido
    - expect: status `401`
    - expect: nenhuma linha criada em `videos`
