import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from './channels/entities/channel.entity';
import appConfig from './config/app.config';
import authConfig from './config/auth.config';
import databaseConfig from './config/database.config';
import { envValidationSchema } from './config/env.validation';
import mailConfig from './config/mail.config';
import queueConfig from './config/queue.config';
import storageConfig from './config/storage.config';
import swaggerConfig from './config/swagger.config';
import uploadConfig from './config/upload.config';
import { MediaModule } from './media/media.module';
import { QueueModule } from './queue/queue.module';
import { QUEUES } from './queue/queue.constants';
import { StorageModule } from './storage/storage.module';
import { User } from './users/entities/user.entity';
import { Video } from './videos/entities/video.entity';
import { Category } from './categories/entities/category.entity';
import { StaleUploadReconciliationProcessor } from './videos/processing/stale-upload-reconciliation.processor';
import { StaleUploadReconciliationService } from './videos/processing/stale-upload-reconciliation.service';
import { VideoProcessingProcessor } from './videos/processing/video-processing.processor';
import { VideoProcessingService } from './videos/processing/video-processing.service';

/** Root module of the video-worker process (no HTTP). Never imported by AppModule (TD-03). */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        authConfig,
        databaseConfig,
        mailConfig,
        swaggerConfig,
        storageConfig,
        queueConfig,
        uploadConfig,
      ],
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [databaseConfig.KEY],
      useFactory: (dbConfig: ConfigType<typeof databaseConfig>) => ({
        type: 'postgres',
        host: dbConfig.host,
        port: dbConfig.port,
        username: dbConfig.username,
        password: dbConfig.password,
        database: dbConfig.name,
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    TypeOrmModule.forFeature([Video, Channel, User, Category]),
    QueueModule,
    BullModule.registerQueue(
      { name: QUEUES.VIDEO_PROCESSING },
      { name: QUEUES.VIDEO_MAINTENANCE },
    ),
    StorageModule,
    MediaModule,
  ],
  providers: [
    VideoProcessingService,
    VideoProcessingProcessor,
    StaleUploadReconciliationService,
    StaleUploadReconciliationProcessor,
  ],
})
export class WorkerModule {}
