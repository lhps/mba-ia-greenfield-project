/**
 * Handles that can never be generated or chosen: route words and ambiguous
 * values (phase-04-channel-management/TD-11 revision). Shared by
 * registration-time generation and `PATCH /channels/me` validation.
 */
export const RESERVED_NICKNAMES: ReadonlySet<string> = new Set([
  'me',
  'admin',
  'api',
  'auth',
  'login',
  'logout',
  'signup',
  'register',
  'channel',
  'channels',
  'video',
  'videos',
  'upload',
  'studio',
  'settings',
  'help',
  'about',
  'support',
  'root',
  'null',
  'undefined',
  'streamtube',
]);

/** Nickname length bounds for new values (TD-11); existing handles are grandfathered. */
export const NICKNAME_LENGTH = { MIN: 3, MAX: 30 } as const;

/** Format of a newly submitted nickname (TD-11). */
export const NICKNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

/** One nickname change per this many days (TD-11). */
export const NICKNAME_CHANGE_COOLDOWN_DAYS = 14;

export const NICKNAME_CHANGE_COOLDOWN_MS =
  NICKNAME_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

/** Channel display name limit for edits (TD-11). */
export const CHANNEL_NAME_MAX_LENGTH = 50;

/** Channel description limit for edits (TD-11). */
export const CHANNEL_DESCRIPTION_MAX_LENGTH = 1000;

/** Fields editable through `PATCH /channels/me`; at least one is required. */
export const UPDATABLE_CHANNEL_FIELDS = [
  'nickname',
  'name',
  'description',
] as const;

/** Keyset pagination of GET /me/subscriptions (phase-06 TD-09). */
export const SUBSCRIPTION_PAGINATION = {
  DEFAULT_LIMIT: 24,
  MAX_LIMIT: 50,
} as const;
