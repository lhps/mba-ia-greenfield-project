/** Keyset pagination of comment roots and replies (phase-06 TD-05). */
export const COMMENT_PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 50,
} as const;

export const COMMENT_BODY_MAX_LENGTH = 2000;

/** Name of the per-user comment throttler — keeps its counters apart from the global per-IP one. */
export const COMMENT_THROTTLER_NAME = 'comments';
