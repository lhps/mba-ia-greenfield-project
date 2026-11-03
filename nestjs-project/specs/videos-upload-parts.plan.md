---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.7
target_file: test/videos-upload-parts.e2e-spec.ts
---

# POST /videos/:id/upload/parts — Test Plan

## Application Overview

`POST /videos/:id/upload/parts` emite URLs presignadas de `UploadPart` para os números de parte pedidos, permitindo ao browser enviar os bytes direto ao storage (em paralelo) e re-solicitar URLs para retomar partes que falharam. Somente o dono do vídeo pode pedir URLs, e só enquanto `processing_status = 'uploading'`. `:id` é o `public_id`. As URLs são assinadas com `S3_PUBLIC_ENDPOINT` (host acessível pelo browser, não o nome de serviço do Compose).

## Test Scenarios

### 1. Emitir URLs presignadas de partes para o dono

**Setup:** `beforeAll` cria o app a partir de `AppModule` reproduzindo a config global do `main.ts`; `beforeEach` trunca `videos`, `refresh_tokens`, `verification_tokens`, `channels`, `users`, esvazia o bucket de teste abortando multipart uploads pendentes; helpers criam usuário A (dono) e usuário B confirmados com canais e obtêm tokens via `POST /auth/login`; usuário A inicia um upload via `POST /videos` com `file_size: 157286400` (`part_count: 3`) e guarda o `public_id`.

#### 1.1. dono-recebe-urls-presignadas

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. POST /videos/<public_id>/upload/parts com token do usuário A e body `{ "part_numbers": [1, 2] }`
    - expect: status `200`
    - expect: `parts` tem 2 itens com `part_number` 1 e 2
    - expect: cada `url` começa com o valor de `S3_PUBLIC_ENDPOINT`
    - expect: `expires_at` é uma data ISO-8601 no futuro

#### 1.2. put-na-url-presignada-retorna-etag

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. Obter URL da parte 1 como em 1.1; reescrever o host público para o endpoint interno do MinIO apenas no cliente de teste (o processo de teste roda dentro do container)
  2. `PUT` de um buffer de 5 MiB na URL
    - expect: status `200`
    - expect: resposta contém header `ETag` não vazio

### 2. Erros de acesso e estado

**Setup:** mesmo da seção 1.

#### 2.1. nao-dono-recebe-403

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. POST /videos/<public_id do usuário A>/upload/parts com token do usuário B e body `{ "part_numbers": [1] }`
    - expect: status `403` com `error: "VIDEO_ACCESS_DENIED"`
  2. Mesma requisição sem header `Authorization`
    - expect: status `401`

#### 2.2. id-desconhecido-ou-malformado-retorna-404

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. POST /videos/AAAAAAAAAAA/upload/parts (11 chars inexistente) com token do usuário A e body `{ "part_numbers": [1] }`
    - expect: status `404` com `error: "VIDEO_NOT_FOUND"`
  2. POST /videos/abc/upload/parts (malformado) com o mesmo token e body
    - expect: status `404` com `error: "VIDEO_NOT_FOUND"`

#### 2.3. numero-de-parte-fora-do-intervalo-retorna-400

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. POST /videos/<public_id>/upload/parts com token do usuário A e body `{ "part_numbers": [4] }` (`part_count` é 3)
    - expect: status `400` com `error: "VALIDATION_ERROR"`
  2. Mesma rota com body `{ "part_numbers": [] }`
    - expect: status `400` com `error: "VALIDATION_ERROR"`

#### 2.4. upload-fora-de-andamento-retorna-409

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-11-03T22:17:02Z

**Steps:**
  1. Atualizar no banco a linha do vídeo para `processing_status = 'processing'`
  2. POST /videos/<public_id>/upload/parts com token do usuário A e body `{ "part_numbers": [1] }`
    - expect: status `409` com `error: "UPLOAD_NOT_IN_PROGRESS"`
