import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { ReactionStateDto } from '../videos/dto/reaction-state.dto';
import { SetReactionDto } from '../videos/dto/set-reaction.dto';
import { CommentReactionsService } from './comment-reactions.service';
import { CommentThrottlerGuard } from './comment-throttler.guard';
import { CommentsService } from './comments.service';
import { CommentDto, CommentPageDto } from './dto/comment.dto';
import { CommentsQueryDto } from './dto/comments-query.dto';
import { CreateCommentDto } from './dto/create-comment.dto';

const errorSchema = { $ref: getSchemaPath(ApiErrorEnvelope) };

/** The global per-IP throttler is skipped; POST has its own per-user limit (phase-06 TD-06). */
@ApiTags('comments')
@SkipThrottle()
@Controller()
export class CommentsController {
  constructor(
    private readonly comments: CommentsService,
    private readonly reactions: CommentReactionsService,
  ) {}

  @Get('videos/:id/comments')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'List the top-level comments of a video',
    description:
      'Newest first with keyset pagination: pass the previous `next_cursor` as `cursor` (null on ' +
      'the last page). Each comment carries its `reply_count`; a deleted comment stays as a ' +
      'placeholder (`deleted: true`) only while it has replies. `my_reaction` is filled when a ' +
      'valid bearer token is sent. `:id` is the video public_id.',
  })
  @ApiResponse({ status: 200, type: CommentPageDto })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR — malformed cursor or invalid limit',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 404,
    description:
      'VIDEO_NOT_FOUND — unknown video, or a draft the caller does not own',
    schema: errorSchema,
  })
  async listRoots(
    @CurrentUser() user: JwtPayload | undefined,
    @Param('id') publicId: string,
    @Query() query: CommentsQueryDto,
  ): Promise<CommentPageDto> {
    return this.comments.listRoots(publicId, user?.sub, query);
  }

  @Post('videos/:id/comments')
  @UseGuards(CommentThrottlerGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Comment on a video or answer a comment',
    description:
      'The body is trimmed (1–2000 characters). With `parent_id` the comment answers another ' +
      "one; answering a reply attaches the new comment to that reply's top-level comment (one " +
      'reply level). Limited per user to COMMENT_RATE_LIMIT comments per ' +
      'COMMENT_RATE_TTL_SECONDS (default 10 per 60 s). `:id` is the video public_id.',
  })
  @ApiResponse({ status: 201, type: CommentDto })
  @ApiResponse({
    status: 400,
    description:
      'VALIDATION_ERROR — body empty or too long, or parent_id not a uuid',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 404,
    description:
      'VIDEO_NOT_FOUND — unknown video or a draft the caller does not own; ' +
      'COMMENT_NOT_FOUND — parent_id unknown, deleted or from another video',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 409,
    description: 'VIDEO_NOT_READY — the video is not ready',
    schema: errorSchema,
  })
  @ApiResponse({ status: 429, description: 'Too many comments by this user' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Param('id') publicId: string,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentDto> {
    return this.comments.create(publicId, user.sub, dto);
  }

  @Get('comments/:id/replies')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'List the replies of a top-level comment',
    description:
      'Oldest first with keyset pagination (`cursor` / `next_cursor`). `my_reaction` is filled ' +
      'when a valid bearer token is sent. `:id` is the top-level comment id.',
  })
  @ApiResponse({ status: 200, type: CommentPageDto })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR — malformed cursor or invalid limit',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 404,
    description:
      'COMMENT_NOT_FOUND — unknown comment, a reply, or its video is not readable',
    schema: errorSchema,
  })
  async listReplies(
    @CurrentUser() user: JwtPayload | undefined,
    @Param('id') commentId: string,
    @Query() query: CommentsQueryDto,
  ): Promise<CommentPageDto> {
    return this.comments.listReplies(commentId, user?.sub, query);
  }

  @Delete('comments/:id')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete my comment',
    description:
      'Only the author may delete. A top-level comment with replies becomes a placeholder ' +
      '(`deleted: true`, `body` and `author` null) so its thread stays readable; any other ' +
      'comment is removed. A placeholder disappears once its last reply is deleted. ' +
      '`:id` is the comment id.',
  })
  @ApiResponse({ status: 204, description: 'Comment deleted' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 403,
    description: 'COMMENT_ACCESS_DENIED — the caller is not the author',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 404,
    description:
      'COMMENT_NOT_FOUND — unknown comment, already deleted, or its video is not readable',
    schema: errorSchema,
  })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id') commentId: string,
  ): Promise<void> {
    await this.comments.remove(commentId, user.sub);
  }

  @Put('comments/:id/reaction')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Like or dislike a comment',
    description:
      "Sets the caller's reaction on the comment. Idempotent: setting the current value again " +
      'changes nothing. Returns the like count and the caller reaction — the dislike count is ' +
      'never exposed. `:id` is the comment id.',
  })
  @ApiResponse({ status: 200, type: ReactionStateDto })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR — value is not like / dislike',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 404,
    description:
      'COMMENT_NOT_FOUND — unknown comment, a deleted placeholder, or its video is not readable',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 409,
    description: "VIDEO_NOT_READY — the comment's video is not ready",
    schema: errorSchema,
  })
  async setReaction(
    @CurrentUser() user: JwtPayload,
    @Param('id') commentId: string,
    @Body() dto: SetReactionDto,
  ): Promise<ReactionStateDto> {
    return this.reactions.set(commentId, user.sub, dto.value);
  }

  @Delete('comments/:id/reaction')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove my reaction from a comment',
    description:
      "Clears the caller's reaction. Idempotent: without a reaction the counts are unchanged. " +
      '`:id` is the comment id.',
  })
  @ApiResponse({ status: 200, type: ReactionStateDto })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 404,
    description:
      'COMMENT_NOT_FOUND — unknown comment, a deleted placeholder, or its video is not readable',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 409,
    description: "VIDEO_NOT_READY — the comment's video is not ready",
    schema: errorSchema,
  })
  async clearReaction(
    @CurrentUser() user: JwtPayload,
    @Param('id') commentId: string,
  ): Promise<ReactionStateDto> {
    return this.reactions.clear(commentId, user.sub);
  }
}
