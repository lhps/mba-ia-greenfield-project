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
});
