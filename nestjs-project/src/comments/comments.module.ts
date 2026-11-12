import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import commentsConfig from '../config/comments.config';
import { VideosModule } from '../videos/videos.module';
import { CommentAccessService } from './comment-access.service';
import { CommentReactionsService } from './comment-reactions.service';
import { CommentThrottlerGuard } from './comment-throttler.guard';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { CommentReaction } from './entities/comment-reaction.entity';
import { Comment } from './entities/comment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Comment, CommentReaction]),
    ConfigModule.forFeature(commentsConfig),
    // VideoAccessService (read rule); one-way — VideosModule never imports CommentsModule.
    VideosModule,
    // Provides JwtService for the optional-auth guard.
    AuthModule,
  ],
  controllers: [CommentsController],
  providers: [
    CommentAccessService,
    CommentsService,
    CommentReactionsService,
    CommentThrottlerGuard,
  ],
})
export class CommentsModule {}
