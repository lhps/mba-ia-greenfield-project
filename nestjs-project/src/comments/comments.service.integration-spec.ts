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
import { CommentsService } from './comments.service';
import { CommentReaction } from './entities/comment-reaction.entity';
import { Comment } from './entities/comment.entity';

describe('CommentsService (integration)', () => {
  let module: TestingModule;
  let service: CommentsService;
  let dataSource: DataSource;
  let video: Video;
  let ownerId: string;
  let viewerId: string;

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
      providers: [CommentsService, CommentAccessService, VideoAccessService],
    }).compile();
    service = module.get(CommentsService);
    dataSource = module.get(DataSource);
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    const [owner, viewer] = await dataSource.getRepository(User).save([
      { email: 'owner@example.com', password: 'hashed' },
      { email: 'viewer@example.com', password: 'hashed' },
    ]);
    ownerId = owner.id;
    viewerId = viewer.id;
    const [channel] = await dataSource.getRepository(Channel).save([
      { name: 'Owner', nickname: 'comments_owner', user_id: ownerId },
      { name: 'Viewer', nickname: 'comments_viewer', user_id: viewerId },
    ]);
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
  });

  const createInSequence = async (
    count: number,
    parentId?: string,
  ): Promise<string[]> => {
    const ids: string[] = [];
    for (let index = 0; index < count; index++) {
      const created = await service.create(video.public_id, viewerId, {
        body: `comment ${index}`,
        parent_id: parentId,
      });
      ids.push(created.id);
    }
    return ids;
  };

  it('should update comment_count and the root reply_count on create', async () => {
    const [rootId] = await createInSequence(1);
    const [replyId] = await createInSequence(1, rootId);
    const nested = await service.create(video.public_id, ownerId, {
      body: 'reply to reply',
      parent_id: replyId,
    });

    const counts = await dataSource.query<
      { comment_count: number; reply_count: number }[]
    >(
      `SELECT v.comment_count, c.reply_count FROM videos v, comments c
       WHERE v.id = $1 AND c.id = $2`,
      [video.id, rootId],
    );
    expect(counts[0]).toEqual({ comment_count: 3, reply_count: 2 });
    expect(nested.parent_id).toBe(rootId);
    expect(nested.author).toEqual({
      nickname: 'comments_owner',
      name: 'Owner',
    });
  });

  it('should page roots newest first across keyset pages without duplicates', async () => {
    const ids = await createInSequence(5);

    const first = await service.listRoots(video.public_id, undefined, {
      limit: 2,
    });
    const second = await service.listRoots(video.public_id, undefined, {
      limit: 2,
      cursor: first.next_cursor!,
    });
    const third = await service.listRoots(video.public_id, undefined, {
      limit: 2,
      cursor: second.next_cursor!,
    });

    const paged = [...first.items, ...second.items, ...third.items].map(
      (item) => item.id,
    );
    expect(paged).toEqual([...ids].reverse());
    expect(third.next_cursor).toBeNull();
  });

  it('should page replies oldest first across keyset pages without duplicates', async () => {
    const [rootId] = await createInSequence(1);
    const replyIds = await createInSequence(3, rootId);

    const first = await service.listReplies(rootId, undefined, { limit: 2 });
    const second = await service.listReplies(rootId, undefined, {
      limit: 2,
      cursor: first.next_cursor!,
    });

    expect([...first.items, ...second.items].map((item) => item.id)).toEqual(
      replyIds,
    );
    expect(second.next_cursor).toBeNull();
  });

  it("should fill my_reaction with the viewer's reaction only", async () => {
    const [likedId, otherId] = await createInSequence(2);
    await dataSource.getRepository(CommentReaction).save({
      user_id: viewerId,
      comment_id: likedId,
      value: 'like',
    });

    const asViewer = await service.listRoots(video.public_id, viewerId, {
      limit: 20,
    });
    const asAnonymous = await service.listRoots(video.public_id, undefined, {
      limit: 20,
    });

    const reactionOf = (page: typeof asViewer, id: string) =>
      page.items.find((item) => item.id === id)?.my_reaction;
    expect(reactionOf(asViewer, likedId)).toBe('like');
    expect(reactionOf(asViewer, otherId)).toBeNull();
    expect(reactionOf(asAnonymous, likedId)).toBeNull();
  });

  it('should hide placeholders without replies and show those with replies', async () => {
    const [emptyId, withRepliesId] = await createInSequence(2);
    await createInSequence(1, withRepliesId);
    await dataSource.query(
      `UPDATE comments SET deleted_at = now(), body = NULL WHERE id IN ($1, $2)`,
      [emptyId, withRepliesId],
    );

    const page = await service.listRoots(video.public_id, undefined, {
      limit: 20,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: withRepliesId,
      deleted: true,
      body: null,
      author: null,
      reply_count: 1,
    });
  });

  const counters = async (rootId: string) => {
    const [video_row] = await dataSource.query<{ comment_count: number }[]>(
      'SELECT comment_count FROM videos WHERE id = $1',
      [video.id],
    );
    const roots = await dataSource.query<
      { reply_count: number; deleted_at: Date | null }[]
    >('SELECT reply_count, deleted_at FROM comments WHERE id = $1', [rootId]);
    return {
      comment_count: video_row.comment_count,
      root: roots[0] ?? null,
    };
  };

  it('should remove a root without replies and drop comment_count', async () => {
    const [rootId] = await createInSequence(1);

    await service.remove(rootId, viewerId);

    await expect(counters(rootId)).resolves.toEqual({
      comment_count: 0,
      root: null,
    });
  });

  it('should keep a root with replies as a placeholder', async () => {
    const [rootId] = await createInSequence(1);
    await createInSequence(2, rootId);

    await service.remove(rootId, viewerId);

    const state = await counters(rootId);
    expect(state.comment_count).toBe(2);
    expect(state.root).toMatchObject({ reply_count: 2 });
    expect(state.root?.deleted_at).toBeInstanceOf(Date);
  });

  it('should decrement both counters when a reply is removed, and its reactions go with it', async () => {
    const [rootId] = await createInSequence(1);
    const [replyId] = await createInSequence(1, rootId);
    await dataSource.getRepository(CommentReaction).save({
      user_id: ownerId,
      comment_id: replyId,
      value: 'like',
    });

    await service.remove(replyId, viewerId);

    await expect(counters(rootId)).resolves.toMatchObject({
      comment_count: 1,
      root: { reply_count: 0, deleted_at: null },
    });
    await expect(
      dataSource
        .getRepository(CommentReaction)
        .countBy({ comment_id: replyId }),
    ).resolves.toBe(0);
  });

  it('should remove a placeholder root together with its last reply', async () => {
    const [rootId] = await createInSequence(1);
    const [replyId] = await createInSequence(1, rootId);
    await service.remove(rootId, viewerId);

    await service.remove(replyId, viewerId);

    await expect(counters(rootId)).resolves.toEqual({
      comment_count: 0,
      root: null,
    });
  });

  it('should keep counters consistent when a root and its replies are deleted concurrently', async () => {
    const [rootId] = await createInSequence(1);
    const replyIds = await createInSequence(3, rootId);

    await Promise.all([
      service.remove(rootId, viewerId),
      ...replyIds.map((id) => service.remove(id, viewerId)),
    ]);

    await expect(counters(rootId)).resolves.toEqual({
      comment_count: 0,
      root: null,
    });
  });
});
