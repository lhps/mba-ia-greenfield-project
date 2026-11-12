import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  CommentNotFoundException,
  VideoNotReadyException,
} from '../common/exceptions/domain.exception';
import { writeReaction } from '../videos/reaction-writer';
import { PROCESSING_STATUS } from '../videos/videos.constants';
import { CommentAccessService } from './comment-access.service';
import {
  COMMENT_REACTION_TARGET,
  CommentReactionsService,
} from './comment-reactions.service';
import type { Comment } from './entities/comment.entity';

jest.mock('../videos/reaction-writer', () => ({
  writeReaction: jest.fn(),
}));

const COMMENT_ID = '11111111-1111-4111-8111-111111111111';

function readableComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: COMMENT_ID,
    deleted_at: null,
    video: { processing_status: PROCESSING_STATUS.READY },
    ...overrides,
  } as Comment;
}

describe('CommentReactionsService', () => {
  let service: CommentReactionsService;
  let commentAccess: { findReadableOrFail: jest.Mock };
  let manager: { query: jest.Mock };
  const write = writeReaction as jest.MockedFunction<typeof writeReaction>;

  beforeEach(async () => {
    write.mockReset();
    write.mockResolvedValue({ like_count: 1, my_reaction: 'like' });
    commentAccess = {
      findReadableOrFail: jest.fn().mockResolvedValue(readableComment()),
    };
    manager = { query: jest.fn().mockResolvedValue([{ deleted_at: null }]) };

    const module = await Test.createTestingModule({
      providers: [
        CommentReactionsService,
        { provide: CommentAccessService, useValue: commentAccess },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((cb: (m: typeof manager) => unknown) =>
              cb(manager),
            ),
          },
        },
      ],
    }).compile();
    service = module.get(CommentReactionsService);
  });

  it('should reject a placeholder with COMMENT_NOT_FOUND', async () => {
    commentAccess.findReadableOrFail.mockResolvedValue(
      readableComment({ deleted_at: new Date() }),
    );

    await expect(
      service.set(COMMENT_ID, 'user-1', 'like'),
    ).rejects.toBeInstanceOf(CommentNotFoundException);
    expect(write).not.toHaveBeenCalled();
  });

  it('should reject a comment whose video is not ready with VIDEO_NOT_READY', async () => {
    commentAccess.findReadableOrFail.mockResolvedValue(
      readableComment({
        video: { processing_status: PROCESSING_STATUS.PROCESSING },
      } as Partial<Comment>),
    );

    await expect(
      service.set(COMMENT_ID, 'user-1', 'like'),
    ).rejects.toBeInstanceOf(VideoNotReadyException);
  });

  it('should reject a comment deleted between the check and the write', async () => {
    manager.query.mockResolvedValue([]);

    await expect(service.clear(COMMENT_ID, 'user-1')).rejects.toBeInstanceOf(
      CommentNotFoundException,
    );
    expect(write).not.toHaveBeenCalled();
  });

  it.each([
    ['set', 'like' as const],
    ['clear', null],
  ])(
    'should %s through the shared writer on the comment counters',
    async (_label, value) => {
      if (value) await service.set(COMMENT_ID, 'user-1', value);
      else await service.clear(COMMENT_ID, 'user-1');

      expect(write).toHaveBeenCalledWith(
        manager,
        COMMENT_REACTION_TARGET,
        'user-1',
        COMMENT_ID,
        value,
      );
    },
  );
});
