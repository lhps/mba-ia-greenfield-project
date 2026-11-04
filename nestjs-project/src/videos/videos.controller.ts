import {
  Body,
  Controller,
  HttpCode,
  Get,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { CreateVideoUploadDto } from './dto/create-video-upload.dto';
import { PresignedUrlResponseDto } from './dto/presigned-url-response.dto';
import { RequestUploadPartsDto } from './dto/request-upload-parts.dto';
import { UploadCompletedDto } from './dto/upload-completed.dto';
import { UploadPartsPresignedDto } from './dto/upload-parts-presigned.dto';
import { VideoResponseDto } from './dto/video-response.dto';
import { VideoUploadStartedDto } from './dto/video-upload-started.dto';
import { VideoUploadService } from './video-upload.service';
import { VideosService } from './videos.service';

const errorSchema = { $ref: getSchemaPath(ApiErrorEnvelope) };

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(
    private readonly videoUpload: VideoUploadService,
    private readonly videos: VideosService,
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
  @Get(':id')
  @ApiOperation({
    summary: 'Get a video by its unique URL id',
    description:
      'Returns processing state and extracted metadata. Open by unique URL in Phase 03. `:id` is the video public_id.',
  })
  @ApiResponse({ status: 200, type: VideoResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: errorSchema,
  })
  async findOne(@Param('id') publicId: string): Promise<VideoResponseDto> {
    return this.videos.findPublic(publicId);
  }

  @Public()
  @Get(':id/stream')
  @ApiOperation({
    summary: 'Get a streaming URL',
    description:
      'Returns a short-lived presigned URL to the processed faststart MP4; storage serves HTTP Range for seeking. ' +
      'Open by unique URL in Phase 03. `:id` is the video public_id.',
  })
  @ApiResponse({ status: 200, type: PresignedUrlResponseDto })
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
  async stream(
    @Param('id') publicId: string,
  ): Promise<PresignedUrlResponseDto> {
    return this.videos.getStreamUrl(publicId);
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
