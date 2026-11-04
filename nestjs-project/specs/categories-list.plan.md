---
subproject: backend
runner: jest+supertest
scope: phase-04-channel-management
si: SI-04.1
target_file: test/categories-list.e2e-spec.ts
---

# GET /categories — Test Plan

## Application Overview

`GET /categories` lista o catálogo fixo de categorias de vídeo (dados de referência semeados por migration). É público (`@Public()`) e devolve apenas `slug` e `name`, ordenados por `name`; o `slug` é o identificador que o frontend envia ao editar um vídeo.

## Test Scenarios

### 1. Listar categorias

**Setup:** `beforeAll` cria o app a partir de `AppModule` reproduzindo a config global do `main.ts` (helper `createVideosApp`); as categorias vêm da migration de seed (não são truncadas entre testes).

#### 1.1. lista-as-10-categorias-ordenadas-por-nome

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. GET /categories sem header `Authorization`
    - expect: status `200`
    - expect: `items` com 10 elementos, cada um `{ slug, name }`
    - expect: os `slug` são exatamente `musica`, `jogos`, `educacao`, `esportes`, `entretenimento`, `tecnologia`, `noticias`, `humor`, `viagens`, `outros` (em qualquer ordem de slug)
    - expect: `items` está ordenado por `name` (comparação com a lista ordenada)

#### 1.2. resposta-nao-expoe-id-interno

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. GET /categories
    - expect: nenhum item contém a chave `id` nem `created_at`
