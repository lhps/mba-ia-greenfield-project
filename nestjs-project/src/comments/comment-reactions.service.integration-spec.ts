import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Category } from '../categories/entities/category.entity';
import { Channel } from '../channels/entities/channel.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { Video } from '../videos/entities/video.entity';
import { generatePublicId } from '../videos/public-id.util';
import { VideoAccessService } from '../videos/video-access.service';
import { CommentAccessService } from './comment-access.service';
import { CommentReactionsService } from './comment-reactions.service';
import { CommentsService } from './comments.service';
import { CommentReaction } from './entities/comment-reaction.entity';
import { Comment } from './entities/comment.entity';

const USER_COUNT = 10;

describe('CommentReactionsService (integration)', () => {
  let module: TestingModule;
  let reactions: CommentReactionsService;
  let comments: CommentsService;
  let dataSource: DataSource;
  let video: Video;
  let userIds: string[];
  let commentId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(
          createTestDataSource(
            [
              User,
              Channel,
              RefreshToken,
              VerificationToken,
              Video,
              Category,
              Comment,
              CommentReaction,
            ],
            { synchronize: false },
          ).options,
        ),
        TypeOrmModule.forFeature([Video]),
      ],
      providers: [
        CommentReactionsService,
        CommentsService,
        CommentAccessService,
        VideoAccessService,
      ],
    }).compile();
    reactions = module.get(CommentReactionsService);
    comments = module.get(CommentsService);
    dataSource = module.get(DataSource);
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    const users = await dataSource.getRepository(User).save(
      Array.from({ length: USER_COUNT }, (_, index) => ({
        email: `comment_reactor${index}@example.com`,
        password: 'hashed',
      })),
    );
    userIds = users.map((user) => user.id);
    const channel = await dataSource.getRepository(Channel).save({
      name: 'owner',
      nickname: 'comment_reactions_owner',
      user_id: userIds[0],
    });
    video = await dataSource.getRepository(Video).save({
      channel_id: channel.id,
      public_id: generatePublicId(),
      file_name: 'clip.mp4',
      title: 'clip',
      file_size: 1024,
      content_type: 'video/mp4',
      original_key: 'videos/x/original',
      processing_status: 'ready',
      publication_status: 'published',
      published_at: new Date(),
    });
    commentId = (
      await comments.create(video.public_id, userIds[0], { body: 'root' })
    ).id;
  });

  const expectCountersToMatchRows = async (): Promise<void> => {
    const rows = await dataSource.query<{ value: string; count: string }[]>(
      `SELECT value, COUNT(*)::text AS count FROM comment_reactions
       WHERE comment_id = $1 GROUP BY value`,
      [commentId],
    );
    const byValue = Object.fromEntries(
      rows.map((row) => [row.value, Number(row.count)]),
    );
    const [counters] = await dataSource.query<
      { like_count: number; dislike_count: number }[]
    >('SELECT like_count, dislike_count FROM comments WHERE id = $1', [
      commentId,
    ]);
    expect(counters).toEqual({
      like_count: byValue.like ?? 0,
      dislike_count: byValue.dislike ?? 0,
    });
  };

  it('should keep counters equal to row counts after mixed set and clear', async () => {
    await reactions.set(commentId, userIds[1], 'like');
    await reactions.set(commentId, userIds[2], 'like');
    await reactions.set(commentId, userIds[3], 'dislike');
    await reactions.set(commentId, userIds[1], 'dislike');
    await reactions.clear(commentId, userIds[2]);
    await reactions.clear(commentId, userIds[4]);

    await expectCountersToMatchRows();
  });

  it('should count concurrent likes by distinct users', async () => {
    await Promise.all(
      userIds.map((userId) => reactions.set(commentId, userId, 'like')),
    );

    const [{ like_count }] = await dataSource.query<{ like_count: number }[]>(
      'SELECT like_count FROM comments WHERE id = $1',
      [commentId],
    );
    expect(like_count).toBe(USER_COUNT);
    await expectCountersToMatchRows();
  });

  it('should show my_reaction in the listing for the reacting viewer', async () => {
    await reactions.set(commentId, userIds[1], 'dislike');

    const page = await comments.listRoots(video.public_id, userIds[1], {
      limit: 20,
    });

    expect(page.items[0]).toMatchObject({
      id: commentId,
      like_count: 0,
      my_reaction: 'dislike',
    });
  });
});
