---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.8
target_file: test/videos-upload-complete.e2e-spec.ts
---

# POST /videos/:id/upload/complete — Test Plan

## Application Overview

`POST /videos/:id/upload/complete` finaliza o multipart upload com os ETags de todas as partes, verifica o tamanho real do objeto no storage (`HeadObject` ≤ `MAX_UPLOAD_BYTES`) e entrega o vídeo ao processamento em segundo plano: `processing_status` passa a `'processing'`, `upload_id` é limpo e um job `process-video` com `{ "video_id": <uuid> }` é enfileirado em `video-processing` (BullMQ/Redis). Só o dono pode completar e só enquanto o upload está em andamento. ETags inválidos mantêm o upload retomável; arquivo acima do limite é removido e o vídeo vira `failed`.

## Test Scenarios

### 1. Finalizar upload e enfileirar processamento

**Setup:** `beforeAll` cria o app a partir de `AppModule` reproduzindo a config global do `main.ts`; `beforeEach` trunca `videos`, `refresh_tokens`, `verification_tokens`, `channels`, `users`, esvazia o bucket de teste (abortando multipart uploads pendentes) e oblitera a fila `video-processing` de teste; helpers criam usuário A (dono) e B confirmados com canais e obtêm tokens via `POST /auth/login`; helper `uploadParts(public_id, buffers)` pede URLs via `POST /videos/:id/upload/parts`, faz `PUT` de cada buffer (host público reescrito para o endpoint interno no cliente de teste) e devolve `[{ part_number, etag }]`. Cenários usam vídeo de 1 parte (`file_size` pequeno, ex. 5 MiB).

#### 1.1. completa-upload-e-enfileira-job

**Covers AC:** #1, #2
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. Usuário A inicia upload via POST /videos (`file_size: 5242880`) e envia a parte 1 com `uploadParts`
  2. POST /videos/<public_id>/upload/complete com token do usuário A e body `{ "parts": [{ "part_number": 1, "etag": "<etag>" }] }`
    - expect: status `202` com body `{ public_id: <public_id>, processing_status: "processing" }`
  3. Consultar a linha do vídeo no banco
    - expect: `processing_status = 'processing'` e `upload_id IS NULL`
  4. `HeadObject` em `videos/<id>/original` no bucket de teste
    - expect: objeto existe com `ContentLength = 5242880`
  5. Ler a fila `video-processing`
    - expect: existe exatamente um job `process-video` com `jobId = <id>` e `data = { "video_id": "<id>" }`

### 2. Erros de partes, tamanho, estado e acesso

**Setup:** mesmo da seção 1.

#### 2.1. etag-invalido-retorna-400-e-mantem-upload

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. Usuário A inicia upload e envia a parte 1
  2. POST /videos/<public_id>/upload/complete com body `{ "parts": [{ "part_number": 1, "etag": "\"deadbeef\"" }] }`
    - expect: status `400` com `error: "UPLOAD_PARTS_INVALID"`
    - expect: a linha continua com `processing_status = 'uploading'` e `upload_id` não nulo
    - expect: nenhum job enfileirado
  3. Repetir o complete com o ETag correto
    - expect: status `202` (upload continuou retomável)

#### 2.2. arquivo-acima-do-limite-retorna-413

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. Em um app separado inicializado com `MAX_UPLOAD_BYTES=1024` (override de config antes do `compile()`), usuário A inicia upload com `file_size: 1000`
  2. Enviar a parte 1 com um buffer de 2048 bytes (mais que o limite real)
  3. POST /videos/<public_id>/upload/complete com o ETag correto
    - expect: status `413` com `error: "FILE_TOO_LARGE"`
    - expect: `videos/<id>/original` não existe mais no bucket
    - expect: a linha tem `processing_status = 'failed'`, `failure_reason = 'FILE_TOO_LARGE'`, `upload_id IS NULL`
    - expect: nenhum job enfileirado

#### 2.3. upload-ja-completado-retorna-409

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. Completar um upload com sucesso como em 1.1
  2. Repetir POST /videos/<public_id>/upload/complete com o mesmo body
    - expect: status `409` com `error: "UPLOAD_NOT_IN_PROGRESS"`

#### 2.4. nao-dono-retorna-403

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. Usuário A inicia upload e envia a parte 1
  2. POST /videos/<public_id>/upload/complete com token do usuário B e o body correto
    - expect: status `403` com `error: "VIDEO_ACCESS_DENIED"`
    - expect: a linha continua `uploading`
  3. Mesma requisição com body `{ "parts": [] }` e token do usuário A
    - expect: status `400` com `error: "VALIDATION_ERROR"`
