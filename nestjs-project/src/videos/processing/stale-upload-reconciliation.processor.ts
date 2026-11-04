import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { JOBS, QUEUES } from '../../queue/queue.constants';
import { StaleUploadReconciliationService } from './stale-upload-reconciliation.service';

const HOURLY = '0 * * * *';

@Processor(QUEUES.VIDEO_MAINTENANCE)
export class StaleUploadReconciliationProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(StaleUploadReconciliationProcessor.name);

  constructor(
    private readonly reconciliation: StaleUploadReconciliationService,
    @InjectQueue(QUEUES.VIDEO_MAINTENANCE) private readonly queue: Queue,
  ) {
    super();
  }

  /** Idempotent by scheduler id — safe on every worker boot (BullMQ v6 Job Schedulers). */
  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      JOBS.RECONCILE_STALE_UPLOADS,
      { pattern: HOURLY },
      {
        name: JOBS.RECONCILE_STALE_UPLOADS,
        data: {},
        opts: { attempts: 3, removeOnFail: 1000 },
      },
    );
  }

  async process(job: Job): Promise<number> {
    if (job.name !== JOBS.RECONCILE_STALE_UPLOADS) return 0;
    const count = await this.reconciliation.reconcile();
    if (count > 0)
      this.logger.log(`Marked ${count} abandoned upload(s) as failed`);
    return count;
  }
}
