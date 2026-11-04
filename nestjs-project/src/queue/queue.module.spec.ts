import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import queueConfig from '../config/queue.config';
import { QueueModule } from './queue.module';
import { QUEUES } from './queue.constants';

describe('QueueModule', () => {
  it('should compile and provide queues bound to the configured Redis', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [queueConfig] }),
        QueueModule,
        BullModule.registerQueue({ name: QUEUES.VIDEO_PROCESSING }),
      ],
    }).compile();

    const queue = module.get<Queue>(getQueueToken(QUEUES.VIDEO_PROCESSING));
    expect(queue.opts.connection).toMatchObject({
      host: process.env.REDIS_HOST ?? 'redis',
    });
    await module.close();
  });
});
