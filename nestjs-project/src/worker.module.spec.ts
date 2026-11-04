import { Test } from '@nestjs/testing';
import { VideoProcessingProcessor } from './videos/processing/video-processing.processor';
import { WorkerModule } from './worker.module';

describe('WorkerModule', () => {
  it('should compile on its own (no AppModule, no HTTP) and provide the processor', async () => {
    const module = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();

    expect(module.get(VideoProcessingProcessor)).toBeDefined();
    await module.close();
  }, 20000);
});
