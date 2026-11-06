import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Category } from '../categories/entities/category.entity';
import { Channel } from '../channels/entities/channel.entity';
import appConfig from '../config/app.config';
import authConfig from '../config/auth.config';
import mailConfig from '../config/mail.config';
import queueConfig from '../config/queue.config';
import storageConfig from '../config/storage.config';
import uploadConfig from '../config/upload.config';
import { QueueModule } from '../queue/queue.module';
import { createTestDataSource } from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { Video } from '../videos/entities/video.entity';
import { VideoViewsController } from './video-views.controller';
import { ViewCountingService } from './view-counting.service';
import { ViewDedupStore } from './view-dedup.store';
import { ViewsModule } from './views.module';

const ALL_ENTITIES = [
  User,
  Channel,
  RefreshToken,
  VerificationToken,
  Video,
  Category,
];

describe('ViewsModule', () => {
  it('should compile with VideosModule, AuthModule and the dedup store wired', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            appConfig,
            authConfig,
            mailConfig,
            queueConfig,
            storageConfig,
            uploadConfig,
          ],
        }),
        TypeOrmModule.forRoot(createTestDataSource(ALL_ENTITIES).options),
        QueueModule,
        ViewsModule,
      ],
    }).compile();

    expect(module.get(ViewDedupStore)).toBeInstanceOf(ViewDedupStore);
    expect(module.get(ViewCountingService)).toBeInstanceOf(ViewCountingService);
    expect(module.get(VideoViewsController)).toBeInstanceOf(
      VideoViewsController,
    );
    await module.close();
  }, 30000);
});
