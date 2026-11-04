import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelsModule } from '../channels/channels.module';
import { QUEUES } from '../queue/queue.constants';
import { StorageModule } from '../storage/storage.module';
import { Video } from './entities/video.entity';
import { VideoProcessingQueue } from './video-processing.queue';
import { VideoUploadService } from './video-upload.service';
import { VideosController } from './videos.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Video]),
    // Producer only — processors are registered exclusively in the worker (TD-03).
    BullModule.registerQueue({ name: QUEUES.VIDEO_PROCESSING }),
    ChannelsModule,
    StorageModule,
  ],
  controllers: [VideosController],
  providers: [VideoProcessingQueue, VideoUploadService],
  exports: [VideoProcessingQueue],
})
export class VideosModule {}
