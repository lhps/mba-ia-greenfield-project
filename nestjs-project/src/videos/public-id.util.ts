import { randomBytes } from 'node:crypto';
import { PUBLIC_ID_LENGTH } from './videos.constants';

const PUBLIC_ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${PUBLIC_ID_LENGTH}}$`);

/** 11 URL-safe chars (66 random bits) — non-enumerable public video identifier. */
export function generatePublicId(): string {
  return randomBytes(9).toString('base64url').slice(0, PUBLIC_ID_LENGTH);
}

export function isPublicId(value: string): boolean {
  return PUBLIC_ID_PATTERN.test(value);
}
