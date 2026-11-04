import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { QueryFailedError, Repository } from 'typeorm';
import { ChannelsService } from '../channels/channels.service';
import {
  FileTooLargeException,
  InvalidUploadRequestException,
  UploadNotInProgressException,
  UploadPartsInvalidException,
} from '../common/exceptions/domain.exception';
import uploadConfig from '../config/upload.config';
import { MultipartCompletionError } from '../storage/storage.errors';
import { StorageService } from '../storage/storage.service';
import type { CreateVideoUploadDto } from './dto/create-video-upload.dto';
import type { UploadedPartDto } from './dto/complete-upload.dto';
import type { UploadCompletedDto } from './dto/upload-completed.dto';
import type { UploadPartsPresignedDto } from './dto/upload-parts-presigned.dto';
import type { VideoUploadStartedDto } from './dto/video-upload-started.dto';
import { Video } from './entities/video.entity';
import { VideoAccessService } from './video-access.service';
import { VideoProcessingQueue } from './video-processing.queue';
import { generatePublicId } from './public-id.util';
import {
  FAILURE_REASON,
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
    private readonly access: VideoAccessService,
    private readonly processingQueue: VideoProcessingQueue,
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

  async presignParts(
    userId: string,
    publicId: string,
    partNumbers: number[],
  ): Promise<UploadPartsPresignedDto> {
    const video = await this.findUploadingOrFail(userId, publicId);
    const partCount = this.partCount(video.file_size);
    const outOfRange = partNumbers.filter((n) => n > partCount);
    if (outOfRange.length > 0) {
      throw new InvalidUploadRequestException(
        `part_numbers must be within 1..${partCount} (got ${outOfRange.join(', ')})`,
      );
    }

    const presigned = await Promise.all(
      partNumbers.map((partNumber) =>
        this.storage.presignUploadPart(
          video.original_key,
          video.upload_id!,
          partNumber,
        ),
      ),
    );
    return {
      parts: presigned.map(({ url }, index) => ({
        part_number: partNumbers[index],
        url,
      })),
      expires_at: presigned[0].expiresAt.toISOString(),
    };
  }

  async complete(
    userId: string,
    publicId: string,
    parts: UploadedPartDto[],
  ): Promise<UploadCompletedDto> {
    const video = await this.findUploadingOrFail(userId, publicId);
    const partCount = this.partCount(video.file_size);
    const partNumbers = new Set(parts.map((part) => part.part_number));
    if (parts.length !== partCount || partNumbers.size !== parts.length) {
      throw new InvalidUploadRequestException(
        `parts must list each of the ${partCount} part numbers exactly once`,
      );
    }

    try {
      await this.storage.completeMultipartUpload(
        video.original_key,
        video.upload_id!,
        parts.map((part) => ({
          partNumber: part.part_number,
          etag: part.etag,
        })),
      );
    } catch (error) {
      if (error instanceof MultipartCompletionError) {
        throw new UploadPartsInvalidException();
      }
      throw error;
    }

    const { contentLength } = await this.storage.headObject(video.original_key);
    if (contentLength > this.upload.maxUploadBytes) {
      await this.storage.deleteObject(video.original_key);
      await this.videos.update(video.id, {
        upload_id: null,
        processing_status: PROCESSING_STATUS.FAILED,
        failure_reason: FAILURE_REASON.FILE_TOO_LARGE,
      });
      throw new FileTooLargeException();
    }

    await this.videos.update(video.id, {
      upload_id: null,
      processing_status: PROCESSING_STATUS.PROCESSING,
    });
    await this.processingQueue.enqueue(video.id);

    return {
      public_id: video.public_id,
      processing_status: PROCESSING_STATUS.PROCESSING,
    };
  }

  private async findUploadingOrFail(
    userId: string,
    publicId: string,
  ): Promise<Video> {
    const video = await this.access.findOwnedOrFail(publicId, userId);
    if (video.processing_status !== PROCESSING_STATUS.UPLOADING) {
      throw new UploadNotInProgressException();
    }
    return video;
  }

  partCount(fileSize: number): number {
    return Math.ceil(fileSize / this.upload.partSizeBytes);
  }

  private async insertWithUniquePublicId(data: Partial<Video>): Promise<Video> {
    for (let attempt = 1; ; attempt++) {
      const video = this.videos.create({
        ...data,
        public_id: generatePublicId(),
      });
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
