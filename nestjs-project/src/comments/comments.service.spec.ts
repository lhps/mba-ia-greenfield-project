import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  CommentAccessDeniedException,
  CommentNotFoundException,
  VideoNotFoundException,
  VideoNotReadyException,
} from '../common/exceptions/domain.exception';
import { Video } from '../videos/entities/video.entity';
import { VideoAccessService } from '../videos/video-access.service';
import { PROCESSING_STATUS } from '../videos/videos.constants';
import { CommentAccessService } from './comment-access.service';
import { CommentsService } from './comments.service';
import { Comment } from './entities/comment.entity';

const VIDEO_ID = 'video-uuid';
const ROOT_ID = '11111111-1111-4111-8111-111111111111';
const REPLY_ID = '22222222-2222-4222-8222-222222222222';
const NEW_ID = '33333333-3333-4333-8333-333333333333';

function commentRow(overrides: Partial<Comment>): Comment {
  return {
    id: ROOT_ID,
    video_id: VIDEO_ID,
    parent_id: null,
    deleted_at: null,
    ...overrides,
  } as Comment;
}

describe('CommentsService', () => {
  let service: CommentsService;
  let access: { findReadableOrFail: jest.Mock };
  let manager: {
    findOne: jest.Mock;
    insert: jest.Mock;
    increment: jest.Mock;
    decrement: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let commentsRepo: { findOne: jest.Mock };
  let dataSource: {
    transaction: jest.Mock;
    query: jest.Mock;
    getRepository: jest.Mock;
  };

  beforeEach(async () => {
    access = {
      findReadableOrFail: jest.fn().mockResolvedValue({
        id: VIDEO_ID,
        public_id: 'aB3_-xYz9Qw',
        processing_status: PROCESSING_STATUS.READY,
      }),
    };
    manager = {
      findOne: jest.fn(),
      insert: jest.fn().mockResolvedValue({ identifiers: [{ id: NEW_ID }] }),
      increment: jest.fn(),
      decrement: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    commentsRepo = { findOne: jest.fn() };
    dataSource = {
      transaction: jest.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
      query: jest.fn().mockResolvedValue([
        {
          id: NEW_ID,
          parent_id: null,
          body: 'hi',
          deleted_at: null,
          like_count: 0,
          reply_count: 0,
          created_at: new Date('2026-11-11T12:00:00.000Z'),
          author_nickname: 'jane',
          author_name: 'Jane',
        },
      ]),
      getRepository: jest.fn().mockReturnValue(commentsRepo),
    };

    const module = await Test.createTestingModule({
      providers: [
        CommentsService,
        // Same-module collaborator: real instance over the mocked DataSource / VideoAccessService.
        CommentAccessService,
        { provide: VideoAccessService, useValue: access },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(CommentsService);
  });

  describe('create', () => {
    it('should reject a video that is not ready with VIDEO_NOT_READY', async () => {
      access.findReadableOrFail.mockResolvedValue({
        id: VIDEO_ID,
        processing_status: PROCESSING_STATUS.PROCESSING,
      });

      await expect(
        service.create('aB3_-xYz9Qw', 'user-1', { body: 'hi' }),
      ).rejects.toBeInstanceOf(VideoNotReadyException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should attach a reply to a reply to its root and count it on the root', async () => {
      manager.findOne
        .mockResolvedValueOnce(commentRow({ id: REPLY_ID, parent_id: ROOT_ID }))
        .mockResolvedValueOnce(commentRow({ id: ROOT_ID }));

      await service.create('aB3_-xYz9Qw', 'user-1', {
        body: 'hi',
        parent_id: REPLY_ID,
      });

      expect(manager.insert).toHaveBeenCalledWith(
        Comment,
        expect.objectContaining({ parent_id: ROOT_ID }),
      );
      expect(manager.increment).toHaveBeenCalledWith(
        Comment,
        { id: ROOT_ID },
        'reply_count',
        1,
      );
    });

    it('should count a top-level comment on the video only', async () => {
      const result = await service.create('aB3_-xYz9Qw', 'user-1', {
        body: 'hi',
      });

      expect(manager.insert).toHaveBeenCalledWith(
        Comment,
        expect.objectContaining({ parent_id: null, body: 'hi' }),
      );
      expect(manager.increment).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        id: NEW_ID,
        deleted: false,
        author: { nickname: 'jane', name: 'Jane' },
        my_reaction: null,
      });
    });

    it.each([
      ['missing', null],
      ['of another video', commentRow({ video_id: 'other-video' })],
      ['a placeholder', commentRow({ deleted_at: new Date() })],
    ])(
      'should reject a parent that is %s with COMMENT_NOT_FOUND',
      async (_label, parent) => {
        manager.findOne.mockResolvedValueOnce(parent);

        await expect(
          service.create('aB3_-xYz9Qw', 'user-1', {
            body: 'hi',
            parent_id: ROOT_ID,
          }),
        ).rejects.toBeInstanceOf(CommentNotFoundException);
        expect(manager.insert).not.toHaveBeenCalled();
      },
    );

    it('should reject a root deleted while the reply was being created', async () => {
      manager.findOne
        .mockResolvedValueOnce(commentRow({ id: ROOT_ID }))
        .mockResolvedValueOnce(commentRow({ deleted_at: new Date() }));

      await expect(
        service.create('aB3_-xYz9Qw', 'user-1', {
          body: 'hi',
          parent_id: ROOT_ID,
        }),
      ).rejects.toBeInstanceOf(CommentNotFoundException);
    });
  });

  describe('listReplies', () => {
    const query = { limit: 20 };

    it('should reject a reply id with COMMENT_NOT_FOUND', async () => {
      commentsRepo.findOne.mockResolvedValue({
        ...commentRow({ id: REPLY_ID, parent_id: ROOT_ID }),
        video: { public_id: 'aB3_-xYz9Qw' },
      });

      await expect(
        service.listReplies(REPLY_ID, undefined, query),
      ).rejects.toBeInstanceOf(CommentNotFoundException);
    });

    it('should report a comment of an unreadable video as COMMENT_NOT_FOUND', async () => {
      commentsRepo.findOne.mockResolvedValue({
        ...commentRow({}),
        video: { public_id: 'aB3_-xYz9Qw' },
      });
      access.findReadableOrFail.mockRejectedValue(new VideoNotFoundException());

      await expect(
        service.listReplies(ROOT_ID, undefined, query),
      ).rejects.toBeInstanceOf(CommentNotFoundException);
    });

    it('should reject a non-uuid id without querying', async () => {
      await expect(
        service.listReplies('not-a-uuid', undefined, query),
      ).rejects.toBeInstanceOf(CommentNotFoundException);
      expect(commentsRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    const AUTHOR = 'author-1';
    const readable = (overrides: Partial<Comment>) => ({
      ...commentRow({ user_id: AUTHOR, ...overrides }),
      video: { public_id: 'aB3_-xYz9Qw' },
    });

    it('should report an unknown comment as COMMENT_NOT_FOUND before checking the author', async () => {
      commentsRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(ROOT_ID, 'someone')).rejects.toBeInstanceOf(
        CommentNotFoundException,
      );
    });

    it("should reject another user's comment with COMMENT_ACCESS_DENIED", async () => {
      commentsRepo.findOne.mockResolvedValue(readable({}));

      await expect(service.remove(ROOT_ID, 'someone')).rejects.toBeInstanceOf(
        CommentAccessDeniedException,
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should report an existing placeholder as COMMENT_NOT_FOUND even to its author', async () => {
      commentsRepo.findOne.mockResolvedValue(
        readable({ deleted_at: new Date() }),
      );

      await expect(service.remove(ROOT_ID, AUTHOR)).rejects.toBeInstanceOf(
        CommentNotFoundException,
      );
    });

    it('should turn a root with replies into a placeholder', async () => {
      commentsRepo.findOne.mockResolvedValue(readable({}));
      manager.findOne.mockResolvedValue(commentRow({ reply_count: 2 }));

      await service.remove(ROOT_ID, AUTHOR);

      expect(manager.update).toHaveBeenCalledWith(
        Comment,
        { id: ROOT_ID },
        { deleted_at: expect.any(Date) as Date, body: null },
      );
      expect(manager.delete).not.toHaveBeenCalled();
      expect(manager.decrement).toHaveBeenCalledWith(
        Video,
        { id: VIDEO_ID },
        'comment_count',
        1,
      );
    });

    it('should remove a root without replies', async () => {
      commentsRepo.findOne.mockResolvedValue(readable({}));
      manager.findOne.mockResolvedValue(commentRow({ reply_count: 0 }));

      await service.remove(ROOT_ID, AUTHOR);

      expect(manager.delete).toHaveBeenCalledWith(Comment, { id: ROOT_ID });
      expect(manager.update).not.toHaveBeenCalled();
    });

    it("should remove a reply and decrement its root's reply_count", async () => {
      commentsRepo.findOne.mockResolvedValue(
        readable({ id: REPLY_ID, parent_id: ROOT_ID }),
      );
      manager.findOne.mockResolvedValue(commentRow({ reply_count: 2 }));

      await service.remove(REPLY_ID, AUTHOR);

      expect(manager.delete).toHaveBeenCalledWith(Comment, { id: REPLY_ID });
      expect(manager.decrement).toHaveBeenCalledWith(
        Comment,
        { id: ROOT_ID },
        'reply_count',
        1,
      );
    });

    it('should remove a placeholder root when its last reply goes', async () => {
      commentsRepo.findOne.mockResolvedValue(
        readable({ id: REPLY_ID, parent_id: ROOT_ID }),
      );
      manager.findOne.mockResolvedValue(
        commentRow({ reply_count: 1, deleted_at: new Date() }),
      );

      await service.remove(REPLY_ID, AUTHOR);

      expect(manager.delete).toHaveBeenCalledWith(Comment, { id: REPLY_ID });
      expect(manager.delete).toHaveBeenCalledWith(Comment, { id: ROOT_ID });
      expect(manager.decrement).toHaveBeenCalledTimes(1);
    });
  });
});
