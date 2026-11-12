import type { DataSource, EntityManager } from 'typeorm';
import {
  VideoNotFoundException,
  VideoNotReadyException,
} from '../common/exceptions/domain.exception';
import type { Video } from './entities/video.entity';
import type { VideoAccessService } from './video-access.service';
import { VideoReactionsService } from './video-reactions.service';

describe('VideoReactionsService', () => {
  const access = { findReadableOrFail: jest.fn() };
  const manager = { query: jest.fn() };
  const dataSource = {
    transaction: jest.fn((cb: (m: EntityManager) => unknown) =>
      cb(manager as unknown as EntityManager),
    ),
  };
  const service = new VideoReactionsService(
    access as unknown as VideoAccessService,
    dataSource as unknown as DataSource,
  );

  const video = {
    id: 'video-id',
    public_id: 'AbC_def-123',
    processing_status: 'ready',
    channel: { user_id: 'owner-id' },
  } as unknown as Video;

  beforeEach(() => {
    jest.clearAllMocks();
    access.findReadableOrFail.mockResolvedValue(video);
  });

  it('should resolve the video with the read rule of the caller', async () => {
    manager.query.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('SELECT "like_count"') ? [{ like_count: 0 }] : [],
      ),
    );

    await service.clear('AbC_def-123', 'user-1');

    expect(access.findReadableOrFail).toHaveBeenCalledWith(
      'AbC_def-123',
      'user-1',
    );
  });

  it('should propagate VIDEO_NOT_FOUND without opening a transaction', async () => {
    access.findReadableOrFail.mockRejectedValue(new VideoNotFoundException());

    await expect(service.set('AbC_def-123', 'user-1', 'like')).rejects.toThrow(
      VideoNotFoundException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it.each(['uploading', 'processing', 'failed'])(
    'should throw VIDEO_NOT_READY when the video is %s',
    async (status) => {
      access.findReadableOrFail.mockResolvedValue({
        ...video,
        processing_status: status,
      });

      await expect(
        service.set('AbC_def-123', 'user-1', 'like'),
      ).rejects.toThrow(VideoNotReadyException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    },
  );

  it('should not touch the counters when clearing without a reaction', async () => {
    manager.query.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('SELECT "like_count"') ? [{ like_count: 3 }] : [],
      ),
    );

    await expect(service.clear('AbC_def-123', 'user-1')).resolves.toEqual({
      like_count: 3,
      my_reaction: null,
    });
    const statements = manager.query.mock.calls.map(([sql]) => sql as string);
    expect(statements.some((sql) => sql.startsWith('UPDATE'))).toBe(false);
    expect(statements.some((sql) => sql.startsWith('DELETE'))).toBe(false);
  });
});
