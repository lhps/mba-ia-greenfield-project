import type { Provider } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Redis } from 'ioredis';
import queueConfig from '../config/queue.config';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** Dedicated Redis connection for view dedup, separate from the BullMQ one; same host/port. */
export const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [queueConfig.KEY],
  useFactory: (queue: ConfigType<typeof queueConfig>) =>
    new Redis({ host: queue.host, port: queue.port }),
};
