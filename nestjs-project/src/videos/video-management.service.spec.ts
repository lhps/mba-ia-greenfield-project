import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoriesService } from '../categories/categories.service';
import {
  InvalidCategoryException,
  PublishRequirementsNotMetException,
  VideoAccessDeniedException,
  VideoNotReadyException,
} from '../common/exceptions/domain.exception';
import { Video } from './entities/video.entity';
import { VideoAccessService } from './video-access.service';
import { VideoManagementService } from './video-management.service';
import { VideosService } from './videos.service';

describe('VideoManagementService', () => {
  let service: VideoManagementService;
  const repo = { save: jest.fn<Promise<Video>, [Video]>() };
  const savedVideo = (): Video => repo.save.mock.calls[0][0];
  const access = { findOwnedOrFail: jest.fn() };
  const categories = { findBySlug: jest.fn() };
  const videosService = { toVideoDetail: jest.fn() };
  const music = { id: 'cat-music', slug: 'musica', name: 'Música' };
  const games = { id: 'cat-games', slug: 'jogos', name: 'Jogos' };

  const buildVideo = (overrides: Partial<Video> = {}): Video =>
    ({
      id: 'internal-id',
      public_id: 'AbC_def-123',
      title: 'clip',
      description: 'old description',
      category_id: music.id,
      category: music,
      publication_status: 'draft',
      visibility: 'public',
      channel: { user_id: 'owner' },
      ...overrides,
    }) as unknown as Video;

  beforeEach(async () => {
    jest.clearAllMocks();
    repo.save.mockImplementation((video: Video) => Promise.resolve(video));
    videosService.toVideoDetail.mockResolvedValue({ public_id: 'AbC_def-123' });
    const module = await Test.createTestingModule({
      providers: [
        VideoManagementService,
        { provide: getRepositoryToken(Video), useValue: repo },
        { provide: VideoAccessService, useValue: access },
        { provide: CategoriesService, useValue: categories },
        { provide: VideosService, useValue: videosService },
      ],
    }).compile();
    service = module.get(VideoManagementService);
  });

  it('should load the owned video with its category relation', async () => {
    access.findOwnedOrFail.mockResolvedValue(buildVideo());

    await service.update('AbC_def-123', 'owner', { title: 'New' });

    expect(access.findOwnedOrFail).toHaveBeenCalledWith(
      'AbC_def-123',
      'owner',
      { category: true },
    );
  });

  it('should update only the provided fields and keep the others', async () => {
    access.findOwnedOrFail.mockResolvedValue(buildVideo());

    const result = await service.update('AbC_def-123', 'owner', {
      title: 'New title',
    });

    const saved = savedVideo();
    expect(saved).toMatchObject({
      title: 'New title',
      description: 'old description',
      category_id: music.id,
      category: music,
      visibility: 'public',
    });
    expect(categories.findBySlug).not.toHaveBeenCalled();
    expect(videosService.toVideoDetail).toHaveBeenCalledWith(saved, 'owner');
    expect(result).toEqual({ public_id: 'AbC_def-123' });
  });

  it('should clear the description when it is null', async () => {
    access.findOwnedOrFail.mockResolvedValue(buildVideo());

    await service.update('AbC_def-123', 'owner', { description: null });

    expect(savedVideo()).toMatchObject({ description: null });
  });

  it('should change visibility without touching the publication status', async () => {
    access.findOwnedOrFail.mockResolvedValue(buildVideo());

    await service.update('AbC_def-123', 'owner', { visibility: 'unlisted' });

    expect(savedVideo()).toMatchObject({
      visibility: 'unlisted',
      publication_status: 'draft',
    });
  });

  it('should resolve the category by slug and set both relation and FK', async () => {
    access.findOwnedOrFail.mockResolvedValue(buildVideo());
    categories.findBySlug.mockResolvedValue(games);

    await service.update('AbC_def-123', 'owner', { category: 'jogos' });

    expect(categories.findBySlug).toHaveBeenCalledWith('jogos');
    expect(savedVideo()).toMatchObject({
      category: games,
      category_id: games.id,
    });
  });

  it('should reject an unknown category slug without persisting', async () => {
    access.findOwnedOrFail.mockResolvedValue(buildVideo());
    categories.findBySlug.mockResolvedValue(null);

    await expect(
      service.update('AbC_def-123', 'owner', {
        title: 'New',
        category: 'inexistente',
      }),
    ).rejects.toBeInstanceOf(InvalidCategoryException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('should clear the category of a draft', async () => {
    access.findOwnedOrFail.mockResolvedValue(buildVideo());

    await service.update('AbC_def-123', 'owner', { category: null });

    expect(categories.findBySlug).not.toHaveBeenCalled();
    expect(savedVideo()).toMatchObject({
      category: null,
      category_id: null,
    });
  });

  it('should reject clearing the category of a published video without persisting', async () => {
    access.findOwnedOrFail.mockResolvedValue(
      buildVideo({ publication_status: 'published' }),
    );

    await expect(
      service.update('AbC_def-123', 'owner', { category: null }),
    ).rejects.toBeInstanceOf(PublishRequirementsNotMetException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('should allow changing the category of a published video to another one', async () => {
    access.findOwnedOrFail.mockResolvedValue(
      buildVideo({ publication_status: 'published' }),
    );
    categories.findBySlug.mockResolvedValue(games);

    await service.update('AbC_def-123', 'owner', { category: 'jogos' });

    expect(savedVideo()).toMatchObject({
      category_id: games.id,
    });
  });

  it('should propagate access denial without persisting', async () => {
    access.findOwnedOrFail.mockRejectedValue(new VideoAccessDeniedException());

    await expect(
      service.update('AbC_def-123', 'intruder', { title: 'x' }),
    ).rejects.toBeInstanceOf(VideoAccessDeniedException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  describe('publish', () => {
    const firstPublishedAt = new Date('2026-11-01T10:00:00Z');

    it('should reject a video that is not ready without persisting', async () => {
      access.findOwnedOrFail.mockResolvedValue(
        buildVideo({ processing_status: 'processing' }),
      );

      await expect(
        service.publish('AbC_def-123', 'owner'),
      ).rejects.toBeInstanceOf(VideoNotReadyException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('should reject a ready video without a category without persisting', async () => {
      access.findOwnedOrFail.mockResolvedValue(
        buildVideo({
          processing_status: 'ready',
          category_id: null,
          category: null,
        }),
      );

      await expect(
        service.publish('AbC_def-123', 'owner'),
      ).rejects.toBeInstanceOf(PublishRequirementsNotMetException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('should set published_at on the first publication', async () => {
      access.findOwnedOrFail.mockResolvedValue(
        buildVideo({ processing_status: 'ready', published_at: null }),
      );
      const before = Date.now();

      await service.publish('AbC_def-123', 'owner');

      expect(access.findOwnedOrFail).toHaveBeenCalledWith(
        'AbC_def-123',
        'owner',
        { category: true },
      );
      const saved = savedVideo();
      expect(saved.publication_status).toBe('published');
      expect(saved.published_at).toBeInstanceOf(Date);
      expect(saved.published_at?.getTime()).toBeGreaterThanOrEqual(before);
      expect(videosService.toVideoDetail).toHaveBeenCalledWith(saved, 'owner');
    });

    it('should keep the first published_at when re-publishing a draft', async () => {
      access.findOwnedOrFail.mockResolvedValue(
        buildVideo({
          processing_status: 'ready',
          publication_status: 'draft',
          published_at: firstPublishedAt,
        }),
      );

      await service.publish('AbC_def-123', 'owner');

      expect(savedVideo()).toMatchObject({
        publication_status: 'published',
        published_at: firstPublishedAt,
      });
    });

    it('should return an already published video unchanged without persisting', async () => {
      const video = buildVideo({
        processing_status: 'ready',
        publication_status: 'published',
        published_at: firstPublishedAt,
      });
      access.findOwnedOrFail.mockResolvedValue(video);

      await service.publish('AbC_def-123', 'owner');

      expect(repo.save).not.toHaveBeenCalled();
      expect(video.published_at).toBe(firstPublishedAt);
      expect(videosService.toVideoDetail).toHaveBeenCalledWith(video, 'owner');
    });
  });

  describe('unpublish', () => {
    const firstPublishedAt = new Date('2026-11-01T10:00:00Z');

    it('should move a published video back to draft keeping published_at', async () => {
      access.findOwnedOrFail.mockResolvedValue(
        buildVideo({
          processing_status: 'ready',
          publication_status: 'published',
          published_at: firstPublishedAt,
        }),
      );

      await service.unpublish('AbC_def-123', 'owner');

      const saved = savedVideo();
      expect(saved).toMatchObject({
        publication_status: 'draft',
        published_at: firstPublishedAt,
      });
      expect(videosService.toVideoDetail).toHaveBeenCalledWith(saved, 'owner');
    });

    it('should return a draft unchanged without persisting', async () => {
      const video = buildVideo({ publication_status: 'draft' });
      access.findOwnedOrFail.mockResolvedValue(video);

      await service.unpublish('AbC_def-123', 'owner');

      expect(repo.save).not.toHaveBeenCalled();
      expect(videosService.toVideoDetail).toHaveBeenCalledWith(video, 'owner');
    });

    it('should propagate access denial without persisting', async () => {
      access.findOwnedOrFail.mockRejectedValue(
        new VideoAccessDeniedException(),
      );

      await expect(
        service.unpublish('AbC_def-123', 'intruder'),
      ).rejects.toBeInstanceOf(VideoAccessDeniedException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });
});
