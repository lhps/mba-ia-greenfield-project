import {
  Body,
  Controller,
  HttpCode,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { CreateVideoUploadDto } from './dto/create-video-upload.dto';
import { PresignedUrlResponseDto } from './dto/presigned-url-response.dto';
import { RequestUploadPartsDto } from './dto/request-upload-parts.dto';
import { ThumbnailResponseDto } from './dto/thumbnail-response.dto';
import { UploadCompletedDto } from './dto/upload-completed.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { UploadPartsPresignedDto } from './dto/upload-parts-presigned.dto';
import { VideoDetailDto } from './dto/video-detail.dto';
import { VideoUploadStartedDto } from './dto/video-upload-started.dto';
import { ThumbnailTooLargeFilter } from './filters/thumbnail-too-large.filter';
import { VideoManagementService } from './video-management.service';
import {
  VideoThumbnailService,
  type UploadedImage,
} from './video-thumbnail.service';
import { VideoUploadService } from './video-upload.service';
import {
  THUMBNAIL_MAX_BYTES,
  THUMBNAIL_UPLOAD_FIELD,
} from './videos.constants';
import { VideosService } from './videos.service';

const errorSchema = { $ref: getSchemaPath(ApiErrorEnvelope) };

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(
    private readonly videoUpload: VideoUploadService,
    private readonly videos: VideosService,
    private readonly videoManagement: VideoManagementService,
    private readonly videoThumbnail: VideoThumbnailService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Start a video upload',
    description:
      'Pre-registers the video as a draft under the caller channel and opens a multipart upload. ' +
      'Bytes are sent directly to storage through presigned part URLs.',
  })
  @ApiResponse({ status: 201, type: VideoUploadStartedDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: errorSchema,
  })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateVideoUploadDto,
  ): Promise<VideoUploadStartedDto> {
    return this.videoUpload.initiate(user.sub, dto);
  }

  @Post(':id/upload/parts')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Presign upload part URLs',
    description:
      'Issues presigned UploadPart URLs for the requested part numbers (owner only, while uploading). ' +
      'Can be called again to resume failed parts. `:id` is the video public_id.',
  })
  @ApiResponse({ status: 200, type: UploadPartsPresignedDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 403,
    description: 'Caller does not own the video',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 409,
    description: 'Upload is not in progress',
    schema: errorSchema,
  })
  async presignParts(
    @CurrentUser() user: JwtPayload,
    @Param('id') publicId: string,
    @Body() dto: RequestUploadPartsDto,
  ): Promise<UploadPartsPresignedDto> {
    return this.videoUpload.presignParts(user.sub, publicId, dto.part_numbers);
  }

  @Post(':id/upload/complete')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Complete a video upload',
    description:
      'Completes the multipart upload, verifies the stored size and enqueues background processing ' +
      '(owner only, while uploading). `:id` is the video public_id.',
  })
  @ApiResponse({ status: 202, type: UploadCompletedDto })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed or parts rejected by storage (UPLOAD_PARTS_INVALID)',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 403,
    description: 'Caller does not own the video',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 409,
    description: 'Upload is not in progress',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 413,
    description: 'Stored file exceeds MAX_UPLOAD_BYTES',
    schema: errorSchema,
  })
  async complete(
    @CurrentUser() user: JwtPayload,
    @Param('id') publicId: string,
    @Body() dto: CompleteUploadDto,
  ): Promise<UploadCompletedDto> {
    return this.videoUpload.complete(user.sub, publicId, dto.parts);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  @ApiOperation({
    summary: 'Get a video by its unique URL id',
    description:
      'Returns the VideoDetail shape. Published videos (public or unlisted) are readable by anyone with the link; ' +
      'a draft is readable only by its owner. Optional bearer token: when valid it identifies the owner, ' +
      'when missing, invalid or expired the caller is treated as anonymous. `:id` is the video public_id.',
  })
  @ApiResponse({ status: 200, type: VideoDetailDto })
  @ApiResponse({
    status: 404,
    description:
      'Video not found, or the video is a draft and the caller is not its owner',
    schema: errorSchema,
  })
  async findOne(
    @CurrentUser() user: JwtPayload | undefined,
    @Param('id') publicId: string,
  ): Promise<VideoDetailDto> {
    return this.videos.findReadable(publicId, user?.sub);
  }

  @Patch(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Edit video information',
    description:
      'Partially updates title, description, category (by slug) and visibility (owner only). ' +
      'At least one field is required; `null` clears description or category. ' +
      'Visibility is independent of publication. `:id` is the video public_id.',
  })
  @ApiResponse({ status: 200, type: VideoDetailDto })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed or empty body (VALIDATION_ERROR), or unknown category slug (INVALID_CATEGORY)',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 403,
    description: 'Caller does not own the video',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 409,
    description:
      'Category cannot be cleared on a published video (PUBLISH_REQUIREMENTS_NOT_MET)',
    schema: errorSchema,
  })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') publicId: string,
    @Body() dto: UpdateVideoDto,
  ): Promise<VideoDetailDto> {
    return this.videoManagement.update(publicId, user.sub, dto);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Publish a video',
    description:
      'Moves the video from draft to published (owner only). Requires processing_status `ready` and a category. ' +
      '`published_at` is set on the first publication and kept on later re-publications. ' +
      'Idempotent: an already published video is returned unchanged. `:id` is the video public_id.',
  })
  @ApiResponse({ status: 200, type: VideoDetailDto })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 403,
    description: 'Caller does not own the video',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 409,
    description:
      'Video is not ready (VIDEO_NOT_READY) or has no category (PUBLISH_REQUIREMENTS_NOT_MET)',
    schema: errorSchema,
  })
  async publish(
    @CurrentUser() user: JwtPayload,
    @Param('id') publicId: string,
  ): Promise<VideoDetailDto> {
    return this.videoManagement.publish(publicId, user.sub);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Unpublish a video',
    description:
      'Moves the video back to draft (owner only), keeping `published_at`. ' +
      'Idempotent: a draft is returned unchanged. `:id` is the video public_id.',
  })
  @ApiResponse({ status: 200, type: VideoDetailDto })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 403,
    description: 'Caller does not own the video',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: errorSchema,
  })
  async unpublish(
    @CurrentUser() user: JwtPayload,
    @Param('id') publicId: string,
  ): Promise<VideoDetailDto> {
    return this.videoManagement.unpublish(publicId, user.sub);
  }

  @Put(':id/thumbnail')
  @UseInterceptors(
    FileInterceptor(THUMBNAIL_UPLOAD_FIELD, {
      limits: { fileSize: THUMBNAIL_MAX_BYTES },
    }),
  )
  @UseFilters(ThumbnailTooLargeFilter)
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [THUMBNAIL_UPLOAD_FIELD],
      properties: {
        [THUMBNAIL_UPLOAD_FIELD]: {
          type: 'string',
          format: 'binary',
          description:
            'JPEG, PNG or WebP image, at most 2 MB (2 097 152 bytes)',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Replace the video thumbnail',
    description:
      'Uploads a custom thumbnail (owner only). The image is re-encoded to a 1280×720 JPEG ' +
      '(scaled and center-cropped, metadata dropped), stored under a new versioned public URL, ' +
      'and the previous thumbnail is deleted. Later processing never overwrites a custom thumbnail. ' +
      '`:id` is the video public_id.',
  })
  @ApiResponse({ status: 200, type: ThumbnailResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'File missing, not JPEG/PNG/WebP by content, or undecodable (INVALID_THUMBNAIL)',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 403,
    description: 'Caller does not own the video',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 413,
    description: 'File larger than 2 MB (THUMBNAIL_TOO_LARGE)',
    schema: errorSchema,
  })
  async replaceThumbnail(
    @CurrentUser() user: JwtPayload,
    @Param('id') publicId: string,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<ThumbnailResponseDto> {
    return this.videoThumbnail.replace(publicId, user.sub, file);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/stream')
  @ApiOperation({
    summary: 'Get a streaming URL',
    description:
      'Returns a short-lived presigned URL to the processed faststart MP4; storage serves HTTP Range for seeking. ' +
      'Same read rule as GET /videos/:id: published videos for anyone with the link, drafts owner-only. ' +
      'Optional bearer token identifies the owner. `:id` is the video public_id.',
  })
  @ApiResponse({ status: 200, type: PresignedUrlResponseDto })
  @ApiResponse({
    status: 404,
    description:
      'Video not found, or the video is a draft and the caller is not its owner',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 409,
    description: 'Video is not ready',
    schema: errorSchema,
  })
  async stream(
    @CurrentUser() user: JwtPayload | undefined,
    @Param('id') publicId: string,
  ): Promise<PresignedUrlResponseDto> {
    return this.videos.getStreamUrl(publicId, user?.sub);
  }

  @Get(':id/download')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get a download URL',
    description:
      'Returns a short-lived presigned URL to the processed MP4 with an attachment Content-Disposition (owner only). ' +
      '`:id` is the video public_id.',
  })
  @ApiResponse({ status: 200, type: PresignedUrlResponseDto })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 403,
    description: 'Caller does not own the video',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: errorSchema,
  })
  @ApiResponse({
    status: 409,
    description: 'Video is not ready',
    schema: errorSchema,
  })
  async download(
    @CurrentUser() user: JwtPayload,
    @Param('id') publicId: string,
  ): Promise<PresignedUrlResponseDto> {
    return this.videos.getDownloadUrl(user.sub, publicId);
  }
}
