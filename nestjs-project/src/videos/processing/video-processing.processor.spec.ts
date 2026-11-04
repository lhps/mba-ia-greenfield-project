import type { Job } from 'bullmq';
import type { ProcessVideoJobData } from '../../queue/queue.constants';
import { VideoProcessingProcessor } from './video-processing.processor';
import type { VideoProcessingService } from './video-processing.service';

describe('VideoProcessingProcessor', () => {
  const processing = { process: jest.fn(), markProcessingFailed: jest.fn() };
  const processor = new VideoProcessingProcessor(
    processing as unknown as VideoProcessingService,
  );

  const job = (attemptsMade: number) =>
    ({
      data: { video_id: 'v1' },
      attemptsMade,
      opts: { attempts: 3 },
    }) as Job<ProcessVideoJobData>;

  beforeEach(() => jest.clearAllMocks());

  it('should delegate the job to the processing service', async () => {
    await processor.process(job(0));

    expect(processing.process).toHaveBeenCalledWith('v1');
  });

  it('should mark the video failed after the last attempt', async () => {
    await processor.handleFailed(job(3), new Error('boom'));

    expect(processing.markProcessingFailed).toHaveBeenCalledWith('v1');
  });

  it('should leave the status untouched on earlier attempts', async () => {
    await processor.handleFailed(job(1), new Error('boom'));

    expect(processing.markProcessingFailed).not.toHaveBeenCalled();
  });
});
