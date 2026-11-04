import {
  VideoAccessDeniedException,
  VideoNotFoundException,
  VideoNotReadyException,
} from '../common/exceptions/domain.exception';
import { StorageService } from '../storage/storage.service';
import type { Video } from './entities/video.entity';
import { ThumbnailUrlResolver } from './thumbnail-url.resolver';
import { VideoAccessService } from './video-access.service';
import { VideosService } from './videos.service';

describe('VideosService', () => {
  const access = {
    findReadableOrFail: jest.fn(),
    findOwnedOrFail: jest.fn(),
  };
  const storage = { presignGetObject: jest.fn() };
  const thumbnails = { resolve: jest.fn() };
  const service = new VideosService(
    access as unknown as VideoAccessService,
    storage as unknown as StorageService,
    thumbnails as unknown as ThumbnailUrlResolver,
  );
  const base = {
    id: 'internal-id',
    channel_id: 'channel-id',
    upload_id: null,
    original_key: 'videos/internal-id/original',
    public_id: 'AbC_def-123',
    file_name: 'clip.mov',
    publication_status: 'draft',
    created_at: new Date('2026-11-03T12:00:00Z'),
  };

  beforeEach(() => jest.clearAllMocks());

  describe('toVideoDetail', () => {
    it('should map every VideoDetail field and omit internal fields', async () => {
      const video = {
        ...base,
        title: 'clip',
        description: 'A short clip',
        category: { id: 'cat-id', slug: 'musica', name: 'Música' },
        category_id: 'cat-id',
        processing_status: 'ready',
        publication_status: 'published',
        visibility: 'unlisted',
        published_at: new Date('2026-11-04T08:00:00Z'),
        duration_seconds: 2.04,
        width: 320,
        height: 240,
        video_key: 'videos/internal-id/video.mp4',
        thumbnail_key: 'thumbnails/internal-id/v1.jpg',
      } as unknown as Video;
      thumbnails.resolve.mockResolvedValue('http://s3/thumb');

      const result = await service.toVideoDetail(video);

      expect(result).toEqual({
        public_id: 'AbC_def-123',
        title: 'clip',
        description: 'A short clip',
        category: { slug: 'musica', name: 'Música' },
        file_name: 'clip.mov',
        processing_status: 'ready',
        publication_status: 'published',
        visibility: 'unlisted',
        published_at: '2026-11-04T08:00:00.000Z',
        duration_seconds: 2.04,
        width: 320,
        height: 240,
        thumbnail_url: 'http://s3/thumb',
        created_at: '2026-11-03T12:00:00.000Z',
      });
      expect(thumbnails.resolve).toHaveBeenCalledWith(
        'thumbnails/internal-id/v1.jpg',
      );
    });

    it('should map a draft without category, publication date or thumbnail to nulls', async () => {
      const video = {
        ...base,
        title: 'clip',
        description: null,
        category: null,
        processing_status: 'processing',
        visibility: 'public',
        published_at: null,
        duration_seconds: null,
        width: null,
        height: null,
        thumbnail_key: null,
      } as unknown as Video;
      thumbnails.resolve.mockResolvedValue(null);

      const result = await service.toVideoDetail(video);

      expect(result).toMatchObject({
        description: null,
        category: null,
        publication_status: 'draft',
        published_at: null,
        duration_seconds: null,
        thumbnail_url: null,
      });
      expect(thumbnails.resolve).toHaveBeenCalledWith(null);
      expect(storage.presignGetObject).not.toHaveBeenCalled();
    });
  });

  describe('findReadable', () => {
    it('should resolve read access with the caller id and map to VideoDetail', async () => {
      access.findReadableOrFail.mockResolvedValue({
        ...base,
        title: 'clip',
        description: null,
        category: null,
        processing_status: 'ready',
        visibility: 'public',
        published_at: null,
        duration_seconds: 2.04,
        width: 320,
        height: 240,
        thumbnail_key: null,
      });
      thumbnails.resolve.mockResolvedValue(null);

      const result = await service.findReadable('AbC_def-123', 'owner');

      expect(access.findReadableOrFail).toHaveBeenCalledWith(
        'AbC_def-123',
        'owner',
      );
      expect(result.public_id).toBe('AbC_def-123');
      expect(result).not.toHaveProperty('id');
      expect(result).not.toHaveProperty('channel_id');
    });

    it('should propagate VIDEO_NOT_FOUND for a hidden draft', async () => {
      access.findReadableOrFail.mockRejectedValue(new VideoNotFoundException());

      await expect(service.findReadable('AbC_def-123')).rejects.toBeInstanceOf(
        VideoNotFoundException,
      );
    });
  });

  describe('getStreamUrl / getDownloadUrl', () => {
    const ready = {
      ...base,
      processing_status: 'ready',
      video_key: 'videos/internal-id/video.mp4',
    };
    const expiresAt = new Date('2030-01-01T00:00:00Z');

    beforeEach(() => {
      storage.presignGetObject.mockResolvedValue({
        url: 'http://s3/video',
        expiresAt,
      });
    });

    it('should reject streaming a video that is not ready', async () => {
      access.findReadableOrFail.mockResolvedValue({
        ...base,
        processing_status: 'processing',
        video_key: null,
      });

      await expect(service.getStreamUrl('AbC_def-123')).rejects.toBeInstanceOf(
        VideoNotReadyException,
      );
    });

    it('should presign the processed MP4 for streaming', async () => {
      access.findReadableOrFail.mockResolvedValue(ready);

      await expect(
        service.getStreamUrl('AbC_def-123', 'owner'),
      ).resolves.toEqual({
        url: 'http://s3/video',
        expires_at: '2030-01-01T00:00:00.000Z',
      });
      expect(access.findReadableOrFail).toHaveBeenCalledWith(
        'AbC_def-123',
        'owner',
      );
      expect(storage.presignGetObject).toHaveBeenCalledWith(
        'videos/internal-id/video.mp4',
      );
    });

    it('should propagate VIDEO_NOT_FOUND when streaming a hidden draft', async () => {
      access.findReadableOrFail.mockRejectedValue(new VideoNotFoundException());

      await expect(service.getStreamUrl('AbC_def-123')).rejects.toBeInstanceOf(
        VideoNotFoundException,
      );
      expect(storage.presignGetObject).not.toHaveBeenCalled();
    });

    it('should presign the download with an .mp4 attachment name derived from file_name', async () => {
      access.findOwnedOrFail.mockResolvedValue(ready);

      await service.getDownloadUrl('owner', 'AbC_def-123');

      expect(access.findOwnedOrFail).toHaveBeenCalledWith(
        'AbC_def-123',
        'owner',
      );
      expect(storage.presignGetObject).toHaveBeenCalledWith(
        'videos/internal-id/video.mp4',
        {
          downloadFileName: 'clip.mp4',
        },
      );
    });

    it('should propagate access denial for non-owner downloads', async () => {
      access.findOwnedOrFail.mockRejectedValue(
        new VideoAccessDeniedException(),
      );

      await expect(
        service.getDownloadUrl('intruder', 'AbC_def-123'),
      ).rejects.toBeInstanceOf(VideoAccessDeniedException);
    });
  });
});
