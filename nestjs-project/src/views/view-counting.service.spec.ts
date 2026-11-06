import { createHash } from 'node:crypto';
import type { Repository } from 'typeorm';
import {
  VideoNotFoundException,
  VideoNotReadyException,
} from '../common/exceptions/domain.exception';
import type { Video } from '../videos/entities/video.entity';
import type { VideoAccessService } from '../videos/video-access.service';
import { ViewCountingService } from './view-counting.service';
import type { ViewDedupStore } from './view-dedup.store';

describe('ViewCountingService', () => {
  const access = { findReadableOrFail: jest.fn() };
  const dedup = { markFirstView: jest.fn() };
  const videos = { increment: jest.fn() };
  const service = new ViewCountingService(
    access as unknown as VideoAccessService,
    dedup as unknown as ViewDedupStore,
    videos as unknown as Repository<Video>,
  );

  const video = {
    id: 'video-id',
    public_id: 'AbC_def-123',
    processing_status: 'ready',
    channel: { user_id: 'owner-id' },
  } as unknown as Video;
  const anonymous = { ip: '203.0.113.7', userAgent: 'e2e-agent' };

  beforeEach(() => {
    jest.clearAllMocks();
    access.findReadableOrFail.mockResolvedValue(video);
    dedup.markFirstView.mockResolvedValue(true);
  });

  it('should resolve the video with the read rule of the caller', async () => {
    await service.record('AbC_def-123', { ...anonymous, userId: 'user-1' });

    expect(access.findReadableOrFail).toHaveBeenCalledWith(
      'AbC_def-123',
      'user-1',
    );
  });

  it('should propagate VIDEO_NOT_FOUND from the read rule', async () => {
    access.findReadableOrFail.mockRejectedValue(new VideoNotFoundException());

    await expect(service.record('AbC_def-123', anonymous)).rejects.toThrow(
      VideoNotFoundException,
    );
    expect(dedup.markFirstView).not.toHaveBeenCalled();
  });

  it('should throw VIDEO_NOT_READY when the video is not ready', async () => {
    access.findReadableOrFail.mockResolvedValue({
      ...video,
      processing_status: 'processing',
    });

    await expect(service.record('AbC_def-123', anonymous)).rejects.toThrow(
      VideoNotReadyException,
    );
    expect(dedup.markFirstView).not.toHaveBeenCalled();
    expect(videos.increment).not.toHaveBeenCalled();
  });

  it('should skip Redis and the counter when the caller owns the video', async () => {
    await service.record('AbC_def-123', { ...anonymous, userId: 'owner-id' });

    expect(dedup.markFirstView).not.toHaveBeenCalled();
    expect(videos.increment).not.toHaveBeenCalled();
  });

  it('should key an authenticated viewer by user id', async () => {
    await service.record('AbC_def-123', { ...anonymous, userId: 'user-1' });

    expect(dedup.markFirstView).toHaveBeenCalledWith(
      'AbC_def-123',
      'user:user-1',
    );
  });

  it('should key an anonymous viewer by the sha256 of ip and user agent', async () => {
    await service.record('AbC_def-123', anonymous);

    const digest = createHash('sha256')
      .update('203.0.113.7|e2e-agent')
      .digest('hex');
    expect(dedup.markFirstView).toHaveBeenCalledWith(
      'AbC_def-123',
      `anon:${digest}`,
    );
  });

  it('should increment view_count atomically on the first view', async () => {
    await service.record('AbC_def-123', anonymous);

    expect(videos.increment).toHaveBeenCalledWith(
      { id: 'video-id' },
      'view_count',
      1,
    );
  });

  it('should not increment on a repeated view inside the window', async () => {
    dedup.markFirstView.mockResolvedValue(false);

    await service.record('AbC_def-123', anonymous);

    expect(videos.increment).not.toHaveBeenCalled();
  });
});
