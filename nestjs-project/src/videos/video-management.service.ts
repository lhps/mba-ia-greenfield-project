import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoriesService } from '../categories/categories.service';
import type { Category } from '../categories/entities/category.entity';
import {
  InvalidCategoryException,
  PublishRequirementsNotMetException,
  VideoNotReadyException,
} from '../common/exceptions/domain.exception';
import type { UpdateVideoDto } from './dto/update-video.dto';
import type { VideoDetailDto } from './dto/video-detail.dto';
import { Video } from './entities/video.entity';
import { VideoAccessService } from './video-access.service';
import { PROCESSING_STATUS, PUBLICATION_STATUS } from './videos.constants';
import { VideosService } from './videos.service';

/** Owner-side management of a video's information (Phase 04). */
@Injectable()
export class VideoManagementService {
  constructor(
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    private readonly access: VideoAccessService,
    private readonly categories: CategoriesService,
    private readonly videosService: VideosService,
  ) {}

  /**
   * Partial edit by the owner. `category` is resolved by slug (unknown →
   * INVALID_CATEGORY); clearing it on a published video is rejected because a
   * published video must keep a category (TD-02). Nothing is persisted when a
   * rule fails.
   */
  async update(
    publicId: string,
    userId: string,
    dto: UpdateVideoDto,
  ): Promise<VideoDetailDto> {
    const video = await this.access.findOwnedOrFail(publicId, userId, {
      category: true,
    });

    if (dto.category !== undefined) {
      const category = await this.resolveCategory(video, dto.category);
      video.category = category;
      video.category_id = category ? category.id : null;
    }
    if (dto.title !== undefined) video.title = dto.title;
    if (dto.description !== undefined) video.description = dto.description;
    if (dto.visibility !== undefined) video.visibility = dto.visibility;

    const saved = await this.videos.save(video);
    return this.videosService.toVideoDetail(saved);
  }

  /**
   * Draft → published (TD-03). Requires a ready video with a category (TD-02).
   * `published_at` is set only on the first publication and kept afterwards;
   * an already published video is returned unchanged.
   */
  async publish(publicId: string, userId: string): Promise<VideoDetailDto> {
    const video = await this.access.findOwnedOrFail(publicId, userId, {
      category: true,
    });

    if (video.processing_status !== PROCESSING_STATUS.READY) {
      throw new VideoNotReadyException();
    }
    if (!video.category_id) {
      throw new PublishRequirementsNotMetException();
    }
    if (video.publication_status === PUBLICATION_STATUS.PUBLISHED) {
      return this.videosService.toVideoDetail(video);
    }

    video.publication_status = PUBLICATION_STATUS.PUBLISHED;
    video.published_at ??= new Date();
    const saved = await this.videos.save(video);
    return this.videosService.toVideoDetail(saved);
  }

  /**
   * Published → draft (TD-03), keeping `published_at` so a later re-publish
   * preserves the first publication time. A draft is returned unchanged.
   */
  async unpublish(publicId: string, userId: string): Promise<VideoDetailDto> {
    const video = await this.access.findOwnedOrFail(publicId, userId, {
      category: true,
    });

    if (video.publication_status === PUBLICATION_STATUS.DRAFT) {
      return this.videosService.toVideoDetail(video);
    }

    video.publication_status = PUBLICATION_STATUS.DRAFT;
    const saved = await this.videos.save(video);
    return this.videosService.toVideoDetail(saved);
  }

  private async resolveCategory(
    video: Video,
    slug: string | null,
  ): Promise<Category | null> {
    if (slug === null) {
      if (video.publication_status === PUBLICATION_STATUS.PUBLISHED) {
        throw new PublishRequirementsNotMetException();
      }
      return null;
    }
    const category = await this.categories.findBySlug(slug);
    if (!category) throw new InvalidCategoryException();
    return category;
  }
}
