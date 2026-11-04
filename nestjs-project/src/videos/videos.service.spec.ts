import {
  VideoAccessDeniedException,
  VideoNotReadyException,
} from '../common/exceptions/domain.exception';
import { StorageService } from '../storage/storage.service';
import { VideoAccessService } from './video-access.service';
import { VideosService } from './videos.service';

describe('VideosService', () => {
  const access = {
    findByPublicIdOrFail: jest.fn(),
    findOwnedOrFail: jest.fn(),
  };
  const storage = { presignGetObject: jest.fn() };
  const service = new VideosService(
    access as unknown as VideoAccessService,
    storage as unknown as StorageService,
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

  describe('findPublic', () => {
    it('should map a ready video with a presigned thumbnail and hide internal fields', async () => {
      access.findByPublicIdOrFail.mockResolvedValue({
        ...base,
        processing_status: 'ready',
        duration_seconds: 2.04,
        width: 320,
        height: 240,
        video_key: 'videos/internal-id/video.mp4',
        thumbnail_key: 'videos/internal-id/thumbnail.jpg',
      });
      storage.presignGetObject.mockResolvedValue({
        url: 'http://s3/thumb',
        expiresAt: new Date(),
      });

      const result = await service.findPublic('AbC_def-123');

      expect(result).toEqual({
        public_id: 'AbC_def-123',
        file_name: 'clip.mov',
        processing_status: 'ready',
        publication_status: 'draft',
        duration_seconds: 2.04,
        width: 320,
        height: 240,
        thumbnail_url: 'http://s3/thumb',
        created_at: '2026-11-03T12:00:00.000Z',
      });
      expect(storage.presignGetObject).toHaveBeenCalledWith(
        'videos/internal-id/thumbnail.jpg',
      );
    });

    it('should return null metadata and thumbnail while processing', async () => {
      access.findByPublicIdOrFail.mockResolvedValue({
        ...base,
        processing_status: 'processing',
        duration_seconds: null,
        width: null,
        height: null,
        thumbnail_key: null,
      });

      const result = await service.findPublic('AbC_def-123');

      expect(result).toMatchObject({
        processing_status: 'processing',
        duration_seconds: null,
        thumbnail_url: null,
      });
      expect(storage.presignGetObject).not.toHaveBeenCalled();
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
      access.findByPublicIdOrFail.mockResolvedValue({
        ...base,
        processing_status: 'processing',
        video_key: null,
      });

      await expect(service.getStreamUrl('AbC_def-123')).rejects.toBeInstanceOf(
        VideoNotReadyException,
      );
    });

    it('should presign the processed MP4 for streaming', async () => {
      access.findByPublicIdOrFail.mockResolvedValue(ready);

      await expect(service.getStreamUrl('AbC_def-123')).resolves.toEqual({
        url: 'http://s3/video',
        expires_at: '2030-01-01T00:00:00.000Z',
      });
      expect(storage.presignGetObject).toHaveBeenCalledWith(
        'videos/internal-id/video.mp4',
      );
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
