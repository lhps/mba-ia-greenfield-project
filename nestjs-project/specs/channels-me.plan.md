---
subproject: backend
runner: jest+supertest
scope: phase-04-channel-management
si: SI-04.9
target_file: test/channels-me.e2e-spec.ts
---

# GET /channels/me and PATCH /channels/me — Test Plan

## Application Overview

`GET /channels/me` devolve o perfil do canal do usuário autenticado; `PATCH /channels/me` edita `nickname`, `name` e `description` e devolve o canal atualizado (para o frontend atualizar o `channelSlug` da sessão). O nickname segue `^[a-z0-9_]{3,30}$`, não pode estar na lista reservada nem em uso, e só pode mudar uma vez a cada 14 dias (`nickname_changed_at`); repetir o nickname atual é no-op. O cadastro passa a gerar nicknames dentro dessas regras.

## Test Scenarios

### 1. Ler e editar o perfil

**Setup:** `beforeAll` cria o app via `createVideosApp`; `beforeEach` chama `resetVideosState`; `createConfirmedUser` cria o dono (e-mail `canal@example.com`) e, quando o cenário pede, um segundo usuário.

#### 1.1. retorna-o-perfil-do-canal

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. GET /channels/me com token do dono
    - expect: status `200` com `nickname`, `name`, `description`, `nickname_changed_at` (`null`), `next_nickname_change_at` (`null`) e `created_at`

#### 1.2. troca-de-nickname-inicia-cooldown

**Covers AC:** #2, #3
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. PATCH /channels/me com `{ "nickname": "novo_canal" }`
    - expect: status `200` com `nickname: "novo_canal"` e `next_nickname_change_at` 14 dias após `nickname_changed_at`
  2. PATCH /channels/me com `{ "nickname": "outro_canal" }`
    - expect: status `409` com `error: "NICKNAME_CHANGE_COOLDOWN"`
  3. PATCH /channels/me com `{ "name": "Meu Canal", "description": "Sobre" }`
    - expect: status `200` com o novo `name` e `description`, `nickname` ainda `novo_canal`

### 2. Regras do nickname

**Setup:** mesmo da seção 1.

#### 2.1. nickname-em-uso-ou-reservado-retorna-409

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. Segundo usuário existe com nickname N2; PATCH /channels/me (dono) com `{ "nickname": N2 }`
    - expect: status `409` com `error: "NICKNAME_TAKEN"`
  2. PATCH /channels/me com `{ "nickname": "admin" }`
    - expect: status `409` com `error: "NICKNAME_RESERVED"`

#### 2.2. formato-invalido-ou-body-vazio-retorna-400

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. PATCH /channels/me com `{ "nickname": "ab" }`, depois `{ "nickname": "Bad-Name" }`, depois `{}`
    - expect: cada um retorna `400` com `error: "VALIDATION_ERROR"`

### 3. Geração no cadastro

**Setup:** `resetVideosState`; cadastro via `POST /auth/register` (sem confirmar).

#### 3.1. email-reservado-gera-user-random

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-11-04T03:42:00Z

**Steps:**
  1. Cadastrar e confirmar `admin@example.com`; GET /channels/me com o token dele
    - expect: `nickname` casa `^user_[a-z0-9]{8}$`
