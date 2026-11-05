import { randomBytes } from 'crypto';
import { NICKNAME_LENGTH, RESERVED_NICKNAMES } from './channels.constants';

/** Collision suffix appended by `appendRandomSuffix`: '_' + 3 hex chars. */
const SUFFIX_HEX_LENGTH = 3;
const SUFFIX_LENGTH = SUFFIX_HEX_LENGTH + 1;

/** Base length that keeps base + '_xxx' within the 30-char nickname limit. */
const MAX_BASE_LENGTH = NICKNAME_LENGTH.MAX - SUFFIX_LENGTH;

const FALLBACK_PREFIX = 'user_';
const FALLBACK_HEX_LENGTH = 8;

function randomHex(length: number): string {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

function fallbackNickname(): string {
  return FALLBACK_PREFIX + randomHex(FALLBACK_HEX_LENGTH);
}

/**
 * Derives a registration-time nickname from an e-mail prefix under the Phase 04
 * rules (phase-02-auth/TD-10 revision): `[a-z0-9_]` only, 3–30 chars, never a
 * reserved word. Empty or reserved results fall back to `user_<8 hex>`; a prefix
 * shorter than 3 chars is padded with `_` + random hex.
 */
export function sanitizeNickname(emailPrefix: string): string {
  const sanitized = emailPrefix
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, NICKNAME_LENGTH.MAX);
  if (!sanitized || RESERVED_NICKNAMES.has(sanitized)) {
    return fallbackNickname();
  }
  if (sanitized.length < NICKNAME_LENGTH.MIN) {
    return `${sanitized}_${randomHex(SUFFIX_HEX_LENGTH)}`;
  }
  return sanitized;
}

/** Collision retry: truncates the base so base + '_xxx' stays ≤ 30 chars. */
export function appendRandomSuffix(nickname: string): string {
  const base = nickname.slice(0, MAX_BASE_LENGTH);
  return `${base}_${randomHex(SUFFIX_HEX_LENGTH)}`;
}
