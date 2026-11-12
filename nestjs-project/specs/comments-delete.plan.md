---
subproject: backend
runner: jest+supertest
scope: phase-06-social-interactions
si: SI-06.4
target_file: test/comments-delete.e2e-spec.ts
---

# DELETE /comments/:id — Author Deletion Test Plan

## Application Overview

O autor apaga o próprio comentário com `DELETE /comments/:id` (`204`). Um comentário raiz com respostas vira um placeholder (`deleted: true`, `body: null`, `author: null`) para o fio continuar; qualquer outro comentário é removido. Os contadores acompanham: `videos.comment_count −1`, e para respostas `reply_count −1` na raiz; um placeholder cuja última resposta é apagada some da listagem. Outro usuário recebe `403 COMMENT_ACCESS_DENIED`; id desconhecido ou placeholder → `404 COMMENT_NOT_FOUND`.

## Test Scenarios

### 1. Apagar comentários

**Setup:** `beforeAll` cria o app via `createVideosApp`; `beforeEach` chama `resetVideosState`; `createConfirmedUser` cria o dono do vídeo e dois usuários (autor e terceiro); `seedVideo` insere um vídeo `ready`, `published`, `public`; comentários são criados via POST /videos/<public_id>/comments.

#### 1.1. raiz-sem-respostas-removida

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. O autor cria a raiz X; DELETE /comments/<X> com o token do autor
    - expect: status `204` sem corpo
  2. GET /videos/<public_id>/comments
    - expect: X não aparece em `items`
  3. GET /videos/<public_id>
    - expect: `comment_count` igual a `0`

#### 1.2. raiz-com-respostas-vira-placeholder

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. O autor cria a raiz X; o terceiro responde X com R
  2. DELETE /comments/<X> com o token do autor
    - expect: status `204`
  3. GET /videos/<public_id>/comments
    - expect: X aparece com `deleted: true`, `body: null`, `author: null`, `reply_count: 1`
  4. GET /comments/<X>/replies
    - expect: status `200` com `items` = [R]
  5. GET /videos/<public_id>
    - expect: `comment_count` igual a `1`

#### 1.3. apagar-resposta-decrementa

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. O terceiro cria a raiz X; o autor responde X com R
  2. DELETE /comments/<R> com o token do autor
    - expect: status `204`
  3. GET /videos/<public_id>/comments
    - expect: X com `reply_count: 0`
  4. GET /videos/<public_id>
    - expect: `comment_count` igual a `1`

#### 1.4. placeholder-some-com-ultima-resposta

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. O autor cria a raiz X; o terceiro responde X com R; o autor apaga X (placeholder)
  2. DELETE /comments/<R> com o token do terceiro
    - expect: status `204`
  3. GET /videos/<public_id>/comments
    - expect: X não aparece em `items`
  4. GET /videos/<public_id>
    - expect: `comment_count` igual a `0`

### 2. Acesso negado e não encontrado

**Setup:** mesmo app e reset do grupo 1; o autor cria a raiz X; o terceiro responde X com R; o autor apaga X (placeholder).

#### 2.1. outro-usuario-403-e-inexistente-404

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-11-11T19:26:00Z

**Steps:**
  1. DELETE /comments/<R> com o token do autor (R é do terceiro)
    - expect: status `403` com `error: "COMMENT_ACCESS_DENIED"`
  2. DELETE /comments/<uuid aleatório> com o token do autor
    - expect: status `404` com `error: "COMMENT_NOT_FOUND"`
  3. DELETE /comments/<X> (placeholder) com o token do autor
    - expect: status `404` com `error: "COMMENT_NOT_FOUND"`
  4. DELETE /comments/<R> sem `Authorization`
    - expect: status `401`
