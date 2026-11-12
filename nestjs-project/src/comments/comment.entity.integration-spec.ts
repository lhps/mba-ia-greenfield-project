import { DataSource } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Category } from '../categories/entities/category.entity';
import { Channel } from '../channels/entities/channel.entity';
import { Subscription } from '../channels/entities/subscription.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { VideoReaction } from '../videos/entities/video-reaction.entity';
import { Video } from '../videos/entities/video.entity';
import { generatePublicId } from '../videos/public-id.util';
import { CommentReaction } from './entities/comment-reaction.entity';
import { Comment } from './entities/comment.entity';

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

describe('Comment entity and social counters (integration)', () => {
  let dataSource: DataSource;
  let user: User;
  let channel: Channel;
  let video: Video;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    user = await dataSource
      .getRepository(User)
      .save({ email: 'commenter@example.com', password: 'hashed' });
    channel = await dataSource
      .getRepository(Channel)
      .save({ name: 'commenter', nickname: 'commenter', user_id: user.id });
    video = await dataSource.getRepository(Video).save({
      channel_id: channel.id,
      public_id: generatePublicId(),
      file_name: 'clip.mp4',
      title: 'clip',
      file_size: 1024,
      content_type: 'video/mp4',
      original_key: 'videos/x/original',
    });
  });

  it('should default comment counters to 0 and leave deleted_at and parent_id null', async () => {
    const saved = await dataSource
      .getRepository(Comment)
      .save({ video_id: video.id, user_id: user.id, body: 'hello' });
    const found = await dataSource
      .getRepository(Comment)
      .findOneByOrFail({ id: saved.id });

    expect(found).toMatchObject({
      like_count: 0,
      dislike_count: 0,
      reply_count: 0,
      parent_id: null,
      deleted_at: null,
    });
  });

  it('should default channel subscriber_count and video dislike_count to 0', async () => {
    await expect(
      dataSource.getRepository(Channel).findOneByOrFail({ id: channel.id }),
    ).resolves.toMatchObject({ subscriber_count: 0 });
    await expect(
      dataSource.getRepository(Video).findOneByOrFail({ id: video.id }),
    ).resolves.toMatchObject({ dislike_count: 0 });
  });

  it('should remove the replies when their root comment is deleted', async () => {
    const repository = dataSource.getRepository(Comment);
    const root = await repository.save({
      video_id: video.id,
      user_id: user.id,
      body: 'root',
    });
    await repository.save({
      video_id: video.id,
      user_id: user.id,
      parent_id: root.id,
      body: 'reply',
    });

    await repository.delete({ id: root.id });

    await expect(repository.countBy({ video_id: video.id })).resolves.toBe(0);
  });

  it('should reject a body longer than 2000 characters', async () => {
    await expect(
      dataSource.getRepository(Comment).insert({
        video_id: video.id,
        user_id: user.id,
        body: 'x'.repeat(2001),
      }),
    ).rejects.toThrow(/value too long/);
  });
});
