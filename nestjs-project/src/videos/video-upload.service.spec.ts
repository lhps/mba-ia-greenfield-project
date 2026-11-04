import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { ChannelsService } from '../channels/channels.service';
import { InvalidUploadRequestException } from '../common/exceptions/domain.exception';
import uploadConfig from '../config/upload.config';
import { StorageService } from '../storage/storage.service';
import { Video } from './entities/video.entity';
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
  };
  const channels = { findByUserId: jest.fn() };
  const storage = {
    createMultipartUpload: jest.fn(),
    abortMultipartUpload: jest.fn(),
  };
  const dto = { file_name: 'a.mp4', file_size: 3 * PART, content_type: 'video/mp4' };

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
    const result = await service.initiate('user-1', { ...dto, file_size: size });

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
      .mockRejectedValueOnce(uniqueViolation('Key (public_id)=(x) already exists.'))
      .mockImplementationOnce(async (v: Partial<Video>) => v);

    const result = await service.initiate('user-1', dto);

    expect(repo.save).toHaveBeenCalledTimes(2);
    const [first, second] = repo.save.mock.calls.map(([v]) => v.public_id);
    expect(first).not.toBe(second);
    expect(result.public_id).toBe(second);
  });

  it('should give up after max public_id collisions and abort the multipart upload', async () => {
    repo.save.mockRejectedValue(uniqueViolation('Key (public_id)=(x) already exists.'));

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
});
