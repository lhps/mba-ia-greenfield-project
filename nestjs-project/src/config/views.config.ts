import { registerAs } from '@nestjs/config';

export default registerAs('views', () => ({
  dedupWindowSeconds: parseInt(
    process.env.VIEW_DEDUP_WINDOW_SECONDS || '86400',
    10,
  ),
}));
