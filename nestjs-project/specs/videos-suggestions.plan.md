---
subproject: backend
runner: jest+supertest
scope: phase-05-video-watch
si: SI-05.5
target_file: test/videos-suggestions.e2e-spec.ts
---

# GET /videos/:id/suggestions — Same-category Sidebar Test Plan

## Application Overview

A sidebar da página de visualização lista até 12 sugestões (sem paginação) no formato de card público (`public_id`, `title`, `thumbnail_url`, `duration_seconds`, `published_at`, `view_count`). Primeiro vêm os vídeos da mesma categoria ordenados por `view_count` decrescente, com o `published_at` mais recente como desempate; se faltarem, completa com os mais recentes de outras categorias. Só entram vídeos `published` + `public` + `ready`, nunca o vídeo atual, rascunhos ou não listados. Se o chamador não pode ler o vídeo atual, a resposta é `404`; se o vídeo atual não tem categoria (só o rascunho do dono), devolve os públicos mais recentes.

## Test Scenarios

### 1. Ordenação e preenchimento

**Setup:** `beforeAll` cria o app via `createVideosApp`; `beforeEach` chama `resetVideosState`; `createConfirmedUser` cria o dono; `seedVideo` insere o vídeo atual `published`/`public`/`ready` na categoria `musica` e outros vídeos elegíveis com `view_count` e `published_at` controlados.

#### 1.1. mesma-categoria-por-visualizacoes-com-desempate-por-recencia

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-06T17:55:55Z

**Steps:**
  1. Semear em `musica`: A (`view_count` 5, publicado ontem), B (`view_count` 9, publicado há 3 dias), C (`view_count` 5, publicado hoje)
  2. GET /videos/<public_id atual>/suggestions sem `Authorization`
    - expect: status `200`
    - expect: `items` começa com B, C, A nessa ordem
    - expect: cada item tem só `public_id`, `title`, `thumbnail_url`, `duration_seconds`, `published_at`, `view_count`

#### 1.2. completa-com-outras-categorias-ate-12

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-06T17:55:55Z

**Steps:**
  1. Semear 3 vídeos elegíveis em `musica` e 15 elegíveis em `jogos` com `published_at` distintos
  2. GET /videos/<public_id atual>/suggestions
    - expect: `items` tem exatamente 12 itens
    - expect: os 3 primeiros são os de `musica`; os 9 seguintes são os 9 mais recentes de `jogos`, por `published_at` decrescente

#### 1.3. exclui-atual-rascunho-nao-listado-e-nao-pronto

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-06T17:55:55Z

**Steps:**
  1. Semear em `musica`: um rascunho, um `published` + `unlisted`, um `published` em `processing` e um elegível D
  2. GET /videos/<public_id atual>/suggestions
    - expect: `items` contém D
    - expect: `items` não contém o vídeo atual, o rascunho, o não listado nem o vídeo em processamento

#### 1.4. lista-vazia-quando-nao-ha-elegiveis

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-11-06T17:55:55Z

**Steps:**
  1. Sem outros vídeos além do atual, GET /videos/<public_id atual>/suggestions
    - expect: status `200` com `items: []`

### 2. Acesso ao vídeo atual

**Setup:** mesmo app e reset; `seedVideo` insere um rascunho do dono sem categoria e dois vídeos públicos elegíveis de outras categorias com `published_at` distintos.

#### 2.1. rascunho-sem-categoria-do-dono-recebe-recentes

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-06T17:55:55Z

**Steps:**
  1. GET /videos/<public_id do rascunho>/suggestions com o token do dono
    - expect: status `200`
    - expect: `items` são os vídeos públicos elegíveis por `published_at` decrescente

#### 2.2. rascunho-de-terceiro-retorna-404

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-11-06T17:55:55Z

**Steps:**
  1. GET /videos/<public_id do rascunho>/suggestions sem `Authorization`
    - expect: status `404` com `error: "VIDEO_NOT_FOUND"`
