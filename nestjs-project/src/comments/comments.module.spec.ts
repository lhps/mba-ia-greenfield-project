import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Category } from '../categories/entities/category.entity';
import { Channel } from '../channels/entities/channel.entity';
import { Subscription } from '../channels/entities/subscription.entity';
import appConfig from '../config/app.config';
import authConfig from '../config/auth.config';
import mailConfig from '../config/mail.config';
import queueConfig from '../config/queue.config';
import storageConfig from '../config/storage.config';
import uploadConfig from '../config/upload.config';
import { QueueModule } from '../queue/queue.module';
import { createTestDataSource } from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { VideoReaction } from '../videos/entities/video-reaction.entity';
import { Video } from '../videos/entities/video.entity';
import { CommentThrottlerGuard } from './comment-throttler.guard';
import { CommentsController } from './comments.controller';
import { CommentsModule } from './comments.module';
import { CommentsService } from './comments.service';
import { CommentReaction } from './entities/comment-reaction.entity';
import { Comment } from './entities/comment.entity';

const ALL_ENTITIES = [
  User,
  Channel,
  RefreshToken,
  VerificationToken,
  Video,
  Category,
  Subscription,
  VideoReaction,
  Comment,
  CommentReaction,
];

describe('CommentsModule', () => {
  it('should compile with VideosModule, AuthModule and the comment throttler wired', async () => {
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
        CommentsModule,
      ],
    }).compile();

    expect(module.get(CommentsService)).toBeInstanceOf(CommentsService);
    expect(module.get(CommentsController)).toBeInstanceOf(CommentsController);
    expect(module.get(CommentThrottlerGuard)).toBeInstanceOf(
      CommentThrottlerGuard,
    );
    await module.close();
  }, 30000);
});
