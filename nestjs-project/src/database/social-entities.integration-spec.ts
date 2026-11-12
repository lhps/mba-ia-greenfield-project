import { DataSource } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Category } from '../categories/entities/category.entity';
import { Channel } from '../channels/entities/channel.entity';
import { Subscription } from '../channels/entities/subscription.entity';
import { CommentReaction } from '../comments/entities/comment-reaction.entity';
import { Comment } from '../comments/entities/comment.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { VideoReaction } from '../videos/entities/video-reaction.entity';
import { Video } from '../videos/entities/video.entity';
import { generatePublicId } from '../videos/public-id.util';

const ALL_ENTITIES = [
  User,
  Channel,
  RefreshToken,
  VerificationToken,
  Video,
  Category,
  VideoReaction,
  Comment,
  CommentReaction,
  Subscription,
];

describe('Social entities (integration)', () => {
  let dataSource: DataSource;
  let owner: User;
  let viewer: User;
  let channel: Channel;
  let video: Video;
  let comment: Comment;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    owner = await dataSource
      .getRepository(User)
      .save({ email: 'social_owner@example.com', password: 'hashed' });
    // The viewer has no channel, so the user row can be deleted directly.
    viewer = await dataSource
      .getRepository(User)
      .save({ email: 'social_viewer@example.com', password: 'hashed' });
    channel = await dataSource
      .getRepository(Channel)
      .save({ name: 'owner', nickname: 'social_owner', user_id: owner.id });
    video = await dataSource.getRepository(Video).save({
      channel_id: channel.id,
      public_id: generatePublicId(),
      file_name: 'clip.mp4',
      title: 'clip',
      file_size: 1024,
      content_type: 'video/mp4',
      original_key: 'videos/x/original',
    });
    comment = await dataSource
      .getRepository(Comment)
      .save({ video_id: video.id, user_id: owner.id, body: 'first' });
  });

  const countRows = async (table: string): Promise<number> => {
    const rows = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM "${table}"`,
    );
    return Number(rows[0].count);
  };

  it('should allow only one reaction per user per video', async () => {
    const repository = dataSource.getRepository(VideoReaction);
    await repository.insert({
      user_id: viewer.id,
      video_id: video.id,
      value: 'like',
    });

    await expect(
      repository.insert({
        user_id: viewer.id,
        video_id: video.id,
        value: 'dislike',
      }),
    ).rejects.toThrow(/duplicate key/);
  });

  it('should allow only one reaction per user per comment', async () => {
    const repository = dataSource.getRepository(CommentReaction);
    await repository.insert({
      user_id: viewer.id,
      comment_id: comment.id,
      value: 'like',
    });

    await expect(
      repository.insert({
        user_id: viewer.id,
        comment_id: comment.id,
        value: 'like',
      }),
    ).rejects.toThrow(/duplicate key/);
  });

  it('should allow only one subscription per user per channel', async () => {
    const repository = dataSource.getRepository(Subscription);
    await repository.insert({ user_id: viewer.id, channel_id: channel.id });

    await expect(
      repository.insert({ user_id: viewer.id, channel_id: channel.id }),
    ).rejects.toThrow(/duplicate key/);
  });

  it('should reject a reaction value outside like/dislike', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO video_reactions (user_id, video_id, value) VALUES ($1, $2, 'love')`,
        [viewer.id, video.id],
      ),
    ).rejects.toThrow(/invalid input value for enum/);
    await expect(
      dataSource.query(
        `INSERT INTO comment_reactions (user_id, comment_id, value) VALUES ($1, $2, 'love')`,
        [viewer.id, comment.id],
      ),
    ).rejects.toThrow(/invalid input value for enum/);
  });

  it('should remove reactions, comments and comment reactions when the video is deleted', async () => {
    await dataSource
      .getRepository(VideoReaction)
      .insert({ user_id: viewer.id, video_id: video.id, value: 'like' });
    await dataSource
      .getRepository(CommentReaction)
      .insert({ user_id: viewer.id, comment_id: comment.id, value: 'like' });

    await dataSource.getRepository(Video).delete({ id: video.id });

    await expect(countRows('video_reactions')).resolves.toBe(0);
    await expect(countRows('comments')).resolves.toBe(0);
    await expect(countRows('comment_reactions')).resolves.toBe(0);
  });

  it('should remove comment reactions when the comment is deleted', async () => {
    await dataSource
      .getRepository(CommentReaction)
      .insert({ user_id: viewer.id, comment_id: comment.id, value: 'like' });

    await dataSource.getRepository(Comment).delete({ id: comment.id });

    await expect(countRows('comment_reactions')).resolves.toBe(0);
  });

  it('should remove subscriptions when the channel is deleted', async () => {
    await dataSource
      .getRepository(Subscription)
      .insert({ user_id: viewer.id, channel_id: channel.id });

    await dataSource.getRepository(Channel).delete({ id: channel.id });

    await expect(countRows('subscriptions')).resolves.toBe(0);
  });

  it("should remove the user's reactions, comments and subscriptions when the user is deleted", async () => {
    await dataSource
      .getRepository(VideoReaction)
      .insert({ user_id: viewer.id, video_id: video.id, value: 'like' });
    await dataSource
      .getRepository(CommentReaction)
      .insert({ user_id: viewer.id, comment_id: comment.id, value: 'like' });
    await dataSource
      .getRepository(Subscription)
      .insert({ user_id: viewer.id, channel_id: channel.id });
    await dataSource
      .getRepository(Comment)
      .insert({ video_id: video.id, user_id: viewer.id, body: 'mine' });

    await dataSource.getRepository(User).delete({ id: viewer.id });

    await expect(countRows('video_reactions')).resolves.toBe(0);
    await expect(countRows('comment_reactions')).resolves.toBe(0);
    await expect(countRows('subscriptions')).resolves.toBe(0);
    await expect(
      dataSource.getRepository(Comment).countBy({ user_id: viewer.id }),
    ).resolves.toBe(0);
    await expect(
      dataSource.getRepository(Comment).existsBy({ id: comment.id }),
    ).resolves.toBe(true);
  });
});
