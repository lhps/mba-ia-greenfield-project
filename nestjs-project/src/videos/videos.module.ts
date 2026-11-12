import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CategoriesModule } from '../categories/categories.module';
import { ChannelsModule } from '../channels/channels.module';
import { MediaModule } from '../media/media.module';
import { QUEUES } from '../queue/queue.constants';
import { StorageModule } from '../storage/storage.module';
import { ChannelVideosController } from './channel-videos.controller';
import { Video } from './entities/video.entity';
import { VideoReaction } from './entities/video-reaction.entity';
import { SubscriptionFeedController } from './subscription-feed.controller';
import { ThumbnailUrlResolver } from './thumbnail-url.resolver';
import { VideoAccessService } from './video-access.service';
import { VideoListingService } from './video-listing.service';
import { VideoManagementService } from './video-management.service';
import { VideoProcessingQueue } from './video-processing.queue';
import { VideoReactionsController } from './video-reactions.controller';
import { VideoReactionsService } from './video-reactions.service';
import { VideoThumbnailService } from './video-thumbnail.service';
import { VideoUploadService } from './video-upload.service';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Video, VideoReaction]),
    // Producer only — processors are registered exclusively in the worker (TD-03).
    BullModule.registerQueue({ name: QUEUES.VIDEO_PROCESSING }),
    // Provides JwtService for the optional-auth guard on GET :id and :id/stream (TD-04).
    AuthModule,
    // Resolves `category` slugs on PATCH /videos/:id.
    CategoriesModule,
    ChannelsModule,
    // FFmpeg re-encodes custom thumbnails in the API process (TD-06 bounded exception).
    MediaModule,
    StorageModule,
  ],
  controllers: [
    VideosController,
    ChannelVideosController,
    VideoReactionsController,
    SubscriptionFeedController,
  ],
  providers: [
    VideoProcessingQueue,
    VideoUploadService,
    VideoAccessService,
    VideosService,
    VideoManagementService,
    ThumbnailUrlResolver,
    VideoThumbnailService,
    VideoListingService,
    VideoReactionsService,
  ],
  // VideoAccessService: read rule reused by view counting in ViewsModule.
  exports: [VideoProcessingQueue, VideoAccessService],
})
export class VideosModule {}
