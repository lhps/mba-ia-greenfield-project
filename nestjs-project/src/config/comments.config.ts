import { registerAs } from '@nestjs/config';

export default registerAs('comments', () => ({
  /** Comments one user may post per window (phase-06 TD-06). */
  rateLimit: parseInt(process.env.COMMENT_RATE_LIMIT ?? '10', 10),
  rateTtlSeconds: parseInt(process.env.COMMENT_RATE_TTL_SECONDS ?? '60', 10),
}));
