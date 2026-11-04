import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { QueryFailedError, Repository } from 'typeorm';
import { ChannelsService } from '../channels/channels.service';
import { InvalidUploadRequestException } from '../common/exceptions/domain.exception';
import uploadConfig from '../config/upload.config';
import { StorageService } from '../storage/storage.service';
import type { CreateVideoUploadDto } from './dto/create-video-upload.dto';
import type { VideoUploadStartedDto } from './dto/video-upload-started.dto';
import { Video } from './entities/video.entity';
import { generatePublicId } from './public-id.util';
import {
  PROCESSING_STATUS,
  PUBLICATION_STATUS,
  PUBLIC_ID_MAX_ATTEMPTS,
  STORAGE_KEYS,
} from './videos.constants';

const PG_UNIQUE_VIOLATION = '23505';

function isPublicIdCollision(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError = error.driverError as { code?: string; detail?: string };
  return (
    driverError.code === PG_UNIQUE_VIOLATION &&
    (driverError.detail ?? '').includes('public_id')
  );
}

@Injectable()
export class VideoUploadService {
  constructor(
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    private readonly channels: ChannelsService,
    private readonly storage: StorageService,
    @Inject(uploadConfig.KEY)
    private readonly upload: ConfigType<typeof uploadConfig>,
  ) {}

  async initiate(
    userId: string,
    dto: CreateVideoUploadDto,
  ): Promise<VideoUploadStartedDto> {
    if (dto.file_size > this.upload.maxUploadBytes) {
      throw new InvalidUploadRequestException(
        `file_size must not be greater than ${this.upload.maxUploadBytes}`,
      );
    }

    const channel = await this.channels.findByUserId(userId);
    if (!channel) throw new Error(`User ${userId} has no channel`);

    const id = randomUUID();
    const originalKey = STORAGE_KEYS.original(id);
    const uploadId = await this.storage.createMultipartUpload(
      originalKey,
      dto.content_type,
    );

    let video: Video;
    try {
      video = await this.insertWithUniquePublicId({
        id,
        channel_id: channel.id,
        file_name: dto.file_name,
        file_size: dto.file_size,
        content_type: dto.content_type,
        original_key: originalKey,
        upload_id: uploadId,
      });
    } catch (error) {
      await this.storage.abortMultipartUpload(originalKey, uploadId);
      throw error;
    }

    return {
      public_id: video.public_id,
      processing_status: PROCESSING_STATUS.UPLOADING,
      publication_status: PUBLICATION_STATUS.DRAFT,
      part_size: this.upload.partSizeBytes,
      part_count: this.partCount(dto.file_size),
    };
  }

  partCount(fileSize: number): number {
    return Math.ceil(fileSize / this.upload.partSizeBytes);
  }

  private async insertWithUniquePublicId(
    data: Partial<Video>,
  ): Promise<Video> {
    for (let attempt = 1; ; attempt++) {
      const video = this.videos.create({ ...data, public_id: generatePublicId() });
      try {
        return await this.videos.save(video);
      } catch (error) {
        if (!isPublicIdCollision(error) || attempt >= PUBLIC_ID_MAX_ATTEMPTS) {
          throw error;
        }
      }
    }
  }
}
