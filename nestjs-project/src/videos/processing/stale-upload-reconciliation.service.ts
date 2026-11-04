import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import uploadConfig from '../../config/upload.config';
import { StorageService } from '../../storage/storage.service';
import { Video } from '../entities/video.entity';
import { FAILURE_REASON, PROCESSING_STATUS } from '../videos.constants';

const MS_PER_HOUR = 60 * 60 * 1000;

@Injectable()
export class StaleUploadReconciliationService {
  constructor(
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    private readonly storage: StorageService,
    @Inject(uploadConfig.KEY)
    private readonly upload: ConfigType<typeof uploadConfig>,
  ) {}

  /** Aborts multipart uploads left `uploading` past STALE_UPLOAD_HOURS and fails their drafts (TD-10). */
  async reconcile(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - this.upload.staleUploadHours * MS_PER_HOUR,
    );
    const stale = await this.videos.find({
      where: {
        processing_status: PROCESSING_STATUS.UPLOADING,
        created_at: LessThan(cutoff),
      },
    });

    for (const video of stale) {
      if (video.upload_id) {
        await this.storage.abortMultipartUpload(
          video.original_key,
          video.upload_id,
        );
      }
      await this.videos.update(
        { id: video.id, processing_status: PROCESSING_STATUS.UPLOADING },
        {
          upload_id: null,
          processing_status: PROCESSING_STATUS.FAILED,
          failure_reason: FAILURE_REASON.UPLOAD_ABANDONED,
        },
      );
    }
    return stale.length;
  }
}
