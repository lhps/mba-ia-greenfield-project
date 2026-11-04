import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { ChannelsService } from '../channels/channels.service';
import { InvalidUploadRequestException } from '../common/exceptions/domain.exception';
import uploadConfig from '../config/upload.config';
import { StorageService } from '../storage/storage.service';
import { Video } from './entities/video.entity';
import {
  FileTooLargeException,
  UploadNotInProgressException,
  UploadPartsInvalidException,
} from '../common/exceptions/domain.exception';
import { MultipartCompletionError } from '../storage/storage.errors';
import { VideoProcessingQueue } from './video-processing.queue';
import { VideoAccessService } from './video-access.service';
import { VideoUploadService } from './video-upload.service';

const PART = 64 * 1024 * 1024;

function uniqueViolation(detail: string): QueryFailedError {
  return new QueryFailedError('INSERT', [], {
    code: '23505',
    detail,
  } as unknown as Error);
}

describe('VideoUploadService', () => {
  let service: VideoUploadService;
  const repo = {
    create: jest.fn((data: Partial<Video>) => data),
    save: jest.fn(),
    update: jest.fn(),
  };
  const channels = { findByUserId: jest.fn() };
  const storage = {
    createMultipartUpload: jest.fn(),
    abortMultipartUpload: jest.fn(),
    presignUploadPart: jest.fn(),
    completeMultipartUpload: jest.fn(),
    headObject: jest.fn(),
    deleteObject: jest.fn(),
  };
  const queue = { enqueue: jest.fn() };
  const access = { findOwnedOrFail: jest.fn() };
  const dto = {
    file_name: 'a.mp4',
    file_size: 3 * PART,
    content_type: 'video/mp4',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    channels.findByUserId.mockResolvedValue({ id: 'channel-1' });
    storage.createMultipartUpload.mockResolvedValue('upload-1');
    repo.save.mockImplementation(async (v: Partial<Video>) => v);

    const module = await Test.createTestingModule({
      providers: [
        VideoUploadService,
        { provide: getRepositoryToken(Video), useValue: repo },
        { provide: ChannelsService, useValue: channels },
        { provide: StorageService, useValue: storage },
        { provide: VideoAccessService, useValue: access },
        { provide: VideoProcessingQueue, useValue: queue },
        {
          provide: uploadConfig.KEY,
          useValue: { maxUploadBytes: 10 * PART, partSizeBytes: PART },
        },
      ],
    }).compile();
    service = module.get(VideoUploadService);
  });

  it.each([
    [3 * PART, 3],
    [3 * PART + 1, 4],
    [1, 1],
  ])('should compute part_count for %i bytes as %i', async (size, count) => {
    const result = await service.initiate('user-1', {
      ...dto,
      file_size: size,
    });

    expect(result.part_count).toBe(count);
    expect(result.part_size).toBe(PART);
  });

  it('should reject a declared size above the limit without touching storage', async () => {
    await expect(
      service.initiate('user-1', { ...dto, file_size: 10 * PART + 1 }),
    ).rejects.toBeInstanceOf(InvalidUploadRequestException);
    expect(storage.createMultipartUpload).not.toHaveBeenCalled();
  });

  it('should retry with a new public_id on a public_id collision', async () => {
    repo.save
      .mockRejectedValueOnce(
        uniqueViolation('Key (public_id)=(x) already exists.'),
      )
      .mockImplementationOnce(async (v: Partial<Video>) => v);

    const result = await service.initiate('user-1', dto);

    expect(repo.save).toHaveBeenCalledTimes(2);
    const [first, second] = repo.save.mock.calls.map(([v]) => v.public_id);
    expect(first).not.toBe(second);
    expect(result.public_id).toBe(second);
  });

  it('should give up after max public_id collisions and abort the multipart upload', async () => {
    repo.save.mockRejectedValue(
      uniqueViolation('Key (public_id)=(x) already exists.'),
    );

    await expect(service.initiate('user-1', dto)).rejects.toBeInstanceOf(
      QueryFailedError,
    );
    expect(repo.save).toHaveBeenCalledTimes(5);
    expect(storage.abortMultipartUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^videos\/.+\/original$/),
      'upload-1',
    );
  });

  it('should abort the multipart upload and rethrow when the insert fails', async () => {
    const failure = new Error('db down');
    repo.save.mockRejectedValue(failure);

    await expect(service.initiate('user-1', dto)).rejects.toBe(failure);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(storage.abortMultipartUpload).toHaveBeenCalledTimes(1);
  });

  describe('presignParts', () => {
    const uploading = {
      original_key: 'videos/v1/original',
      upload_id: 'upload-1',
      file_size: 3 * PART,
      processing_status: 'uploading',
    };

    beforeEach(() => {
      access.findOwnedOrFail.mockResolvedValue(uploading);
      storage.presignUploadPart.mockImplementation(
        async (_k: string, _u: string, n: number) => ({
          url: `http://s3/part-${n}`,
          expiresAt: new Date('2030-01-01T00:00:00Z'),
        }),
      );
    });

    it('should return one presigned URL per requested part', async () => {
      const result = await service.presignParts('user-1', 'pub', [1, 3]);

      expect(result).toEqual({
        parts: [
          { part_number: 1, url: 'http://s3/part-1' },
          { part_number: 3, url: 'http://s3/part-3' },
        ],
        expires_at: '2030-01-01T00:00:00.000Z',
      });
    });

    it('should reject part numbers above part_count', async () => {
      await expect(
        service.presignParts('user-1', 'pub', [1, 4]),
      ).rejects.toBeInstanceOf(InvalidUploadRequestException);
      expect(storage.presignUploadPart).not.toHaveBeenCalled();
    });

    it('should reject when the video is no longer uploading', async () => {
      access.findOwnedOrFail.mockResolvedValue({
        ...uploading,
        processing_status: 'processing',
      });

      await expect(
        service.presignParts('user-1', 'pub', [1]),
      ).rejects.toBeInstanceOf(UploadNotInProgressException);
    });
  });

  describe('complete', () => {
    const uploading = {
      id: 'v1',
      public_id: 'pub',
      original_key: 'videos/v1/original',
      upload_id: 'upload-1',
      file_size: 2 * PART,
      processing_status: 'uploading',
    };
    const parts = [
      { part_number: 1, etag: '"a"' },
      { part_number: 2, etag: '"b"' },
    ];

    beforeEach(() => {
      access.findOwnedOrFail.mockResolvedValue(uploading);
      storage.completeMultipartUpload.mockResolvedValue(undefined);
      storage.headObject.mockResolvedValue({ contentLength: 2 * PART });
    });

    it('should mark the video processing and enqueue it once', async () => {
      const result = await service.complete('user-1', 'pub', parts);

      expect(result).toEqual({
        public_id: 'pub',
        processing_status: 'processing',
      });
      expect(repo.update).toHaveBeenCalledWith('v1', {
        upload_id: null,
        processing_status: 'processing',
      });
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
      expect(queue.enqueue).toHaveBeenCalledWith('v1');
    });

    it('should reject a parts list that does not match part_count', async () => {
      await expect(
        service.complete('user-1', 'pub', [parts[0]]),
      ).rejects.toBeInstanceOf(InvalidUploadRequestException);
      await expect(
        service.complete('user-1', 'pub', [parts[0], parts[0]]),
      ).rejects.toBeInstanceOf(InvalidUploadRequestException);
      expect(storage.completeMultipartUpload).not.toHaveBeenCalled();
    });

    it('should map a storage rejection to UPLOAD_PARTS_INVALID without changing state', async () => {
      storage.completeMultipartUpload.mockRejectedValue(
        new MultipartCompletionError('InvalidPart', 'bad etag'),
      );

      await expect(
        service.complete('user-1', 'pub', parts),
      ).rejects.toBeInstanceOf(UploadPartsInvalidException);
      expect(repo.update).not.toHaveBeenCalled();
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it('should delete an oversize object, fail the video and not enqueue', async () => {
      storage.headObject.mockResolvedValue({ contentLength: 10 * PART + 1 });

      await expect(
        service.complete('user-1', 'pub', parts),
      ).rejects.toBeInstanceOf(FileTooLargeException);
      expect(storage.deleteObject).toHaveBeenCalledWith('videos/v1/original');
      expect(repo.update).toHaveBeenCalledWith('v1', {
        upload_id: null,
        processing_status: 'failed',
        failure_reason: 'FILE_TOO_LARGE',
      });
      expect(queue.enqueue).not.toHaveBeenCalled();
    });
  });
});
