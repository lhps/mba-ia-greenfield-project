import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import queueConfig from '../config/queue.config';
import { QueueModule } from '../queue/queue.module';
import { JOBS, QUEUES } from '../queue/queue.constants';
import { VideoProcessingQueue } from './video-processing.queue';

describe('VideoProcessingQueue (integration)', () => {
  const originalPrefix = process.env.QUEUE_PREFIX;
  let module: TestingModule;
  let producer: VideoProcessingQueue;
  let queue: Queue;

  beforeAll(async () => {
    process.env.QUEUE_PREFIX = 'bull-test';
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [queueConfig] }),
        QueueModule,
        BullModule.registerQueue({ name: QUEUES.VIDEO_PROCESSING }),
      ],
      providers: [VideoProcessingQueue],
    }).compile();
    producer = module.get(VideoProcessingQueue);
    queue = module.get(getQueueToken(QUEUES.VIDEO_PROCESSING));
  });

  beforeEach(async () => {
    await queue.obliterate({ force: true });
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await module.close();
    process.env.QUEUE_PREFIX = originalPrefix;
  });

  it('should enqueue a process-video job keyed by the video id with retry options', async () => {
    const videoId = randomUUID();

    await producer.enqueue(videoId);

    const job = await queue.getJob(videoId);
    expect(job).toBeDefined();
    expect(job!.name).toBe(JOBS.PROCESS_VIDEO);
    expect(job!.data).toEqual({ video_id: videoId });
    expect(job!.opts).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
    expect(queue.opts.prefix).toBe('bull-test');
  });

  it('should keep a single job when the same video is enqueued twice', async () => {
    const videoId = randomUUID();

    await producer.enqueue(videoId);
    await producer.enqueue(videoId);

    const jobs = await queue.getJobs(['waiting', 'delayed', 'active']);
    expect(
      jobs.filter(
        (job) => (job.data as { video_id: string }).video_id === videoId,
      ),
    ).toHaveLength(1);
  });

  it('should leave jobs waiting because no worker is registered in this process', async () => {
    const videoId = randomUUID();

    await producer.enqueue(videoId);

    await expect(
      queue.getJob(videoId).then((j) => j?.getState()),
    ).resolves.toBe('waiting');
  });
});
