import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  VideoAccessDeniedException,
  VideoNotFoundException,
} from '../common/exceptions/domain.exception';
import { Video } from './entities/video.entity';
import { VideoAccessService } from './video-access.service';

describe('VideoAccessService', () => {
  let service: VideoAccessService;
  const repo = { findOne: jest.fn() };
  const video = { public_id: 'AbC_def-123', channel: { user_id: 'owner' } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        VideoAccessService,
        { provide: getRepositoryToken(Video), useValue: repo },
      ],
    }).compile();
    service = module.get(VideoAccessService);
  });

  it('should reject a malformed public_id without querying', async () => {
    await expect(service.findByPublicIdOrFail('abc')).rejects.toBeInstanceOf(
      VideoNotFoundException,
    );
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it('should reject an unknown public_id', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(
      service.findByPublicIdOrFail('AbC_def-123'),
    ).rejects.toBeInstanceOf(VideoNotFoundException);
  });

  it('should reject a non-owner with VideoAccessDeniedException', async () => {
    repo.findOne.mockResolvedValue(video);

    await expect(
      service.findOwnedOrFail('AbC_def-123', 'someone-else'),
    ).rejects.toBeInstanceOf(VideoAccessDeniedException);
  });

  it('should return the video to its owner', async () => {
    repo.findOne.mockResolvedValue(video);

    await expect(service.findOwnedOrFail('AbC_def-123', 'owner')).resolves.toBe(
      video,
    );
  });

  it('should load extra relations alongside the channel for the owner', async () => {
    repo.findOne.mockResolvedValue(video);

    await service.findOwnedOrFail('AbC_def-123', 'owner', { category: true });

    expect(repo.findOne).toHaveBeenCalledWith({
      where: { public_id: 'AbC_def-123' },
      relations: { category: true, channel: true },
    });
  });

  describe('findReadableOrFail', () => {
    const draft = { ...video, publication_status: 'draft' };
    const published = { ...video, publication_status: 'published' };

    it('should load the channel and category relations', async () => {
      repo.findOne.mockResolvedValue(published);

      await service.findReadableOrFail('AbC_def-123');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { public_id: 'AbC_def-123' },
        relations: { channel: true, category: true },
      });
    });

    it('should return a published video to an anonymous caller', async () => {
      repo.findOne.mockResolvedValue(published);

      await expect(service.findReadableOrFail('AbC_def-123')).resolves.toBe(
        published,
      );
    });

    it('should return a published video to a non-owner', async () => {
      repo.findOne.mockResolvedValue(published);

      await expect(
        service.findReadableOrFail('AbC_def-123', 'someone-else'),
      ).resolves.toBe(published);
    });

    it('should return a draft to its owner', async () => {
      repo.findOne.mockResolvedValue(draft);

      await expect(
        service.findReadableOrFail('AbC_def-123', 'owner'),
      ).resolves.toBe(draft);
    });

    it('should hide a draft from an anonymous caller as VIDEO_NOT_FOUND', async () => {
      repo.findOne.mockResolvedValue(draft);

      await expect(
        service.findReadableOrFail('AbC_def-123'),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });

    it('should hide a draft from a non-owner as VIDEO_NOT_FOUND', async () => {
      repo.findOne.mockResolvedValue(draft);

      await expect(
        service.findReadableOrFail('AbC_def-123', 'someone-else'),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });

    it('should reject an unknown public_id', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.findReadableOrFail('AbC_def-123', 'owner'),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });
  });
});
